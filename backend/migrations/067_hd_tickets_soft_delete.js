/**
 * Migration 067 — soft delete for hd_tickets.
 *
 * Today, deleting a ticket is a real SQL DELETE, which cascades and
 * permanently destroys its conversations, history, assignees, approvals,
 * and tasks too (all FK'd ON DELETE CASCADE), plus immediately unlinks its
 * attachment files from disk. Completely unrecoverable.
 *
 * Adding deleted_at + Sequelize's `paranoid: true` on the HdTicket model
 * makes `.destroy()` an UPDATE (deleted_at = NOW()) instead of a real
 * DELETE — every normal Sequelize query then automatically excludes
 * soft-deleted tickets, and because no real DELETE ever fires, the CASCADE
 * never fires either, so every child row survives intact for free.
 *
 * Schema-only — adds one nullable column, touches no existing data.
 * Idempotent: safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('=== Migration 067: hd_tickets soft delete ===\n');

  if (!(await columnExists('hd_tickets', 'deleted_at'))) {
    await sequelize.query(`
      ALTER TABLE hd_tickets
      ADD COLUMN deleted_at DATETIME NULL COMMENT 'Soft delete — NULL = active, set = deleted but fully recoverable via restore'
    `);
    console.log('Added hd_tickets.deleted_at');
  } else {
    console.log('hd_tickets.deleted_at already exists — skipping');
  }

  console.log('\n=== Migration 067 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 067 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
