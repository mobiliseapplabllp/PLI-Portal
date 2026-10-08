/**
 * Migration 055 — make Helpdesk ticket Status admin-configurable.
 *
 * hd_tickets.status was a hard MySQL ENUM (only the DB schema could add/remove
 * values), unlike Category/Mode/Impact/Urgency/Request Type, which are free-text
 * columns validated against the admin-configurable hd_options table.
 *
 *   - Converts hd_tickets.status from ENUM to VARCHAR(50). Existing values are
 *     preserved exactly (MySQL keeps ENUM strings unchanged on this conversion).
 *   - Normalises any empty-string status (found: legacy bad-data rows) to 'open'.
 *   - Adds hd_options.isBuiltIn — protects the 6 foundational statuses (open,
 *     in-progress, pending, on-hold, resolved, closed) from deletion, since
 *     dashboard SLA/aging counts, the approval flow, and the closedAt auto-stamp
 *     hook all key off these exact string values. Admins can freely ADD new
 *     statuses beyond these; built-ins just can't be removed out from under
 *     that logic. (Renaming isn't a feature of hd_options yet, for any type —
 *     nothing to guard there.)
 *   - Seeds the 'on-hold' status option, missing since migration 017b.
 *
 * Idempotent: safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const BUILT_IN_STATUSES = ['open', 'in-progress', 'pending', 'on-hold', 'resolved', 'closed'];

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('=== Migration 055: ticket Status admin-configurable ===\n');

  // 1) hd_options.isBuiltIn
  if (!(await columnExists('hd_options', 'is_built_in'))) {
    await sequelize.query(`ALTER TABLE hd_options ADD COLUMN is_built_in TINYINT(1) NOT NULL DEFAULT 0`);
    console.log('Added hd_options.is_built_in');
  } else {
    console.log('hd_options.is_built_in already exists — skipping');
  }

  // 2) Seed the missing 'on-hold' status option (same pattern as migration 017b)
  const [, seedMeta] = await sequelize.query(
    `INSERT IGNORE INTO hd_options (type, name, description) VALUES ('status', 'on-hold', 'Ticket paused — waiting on something outside the requester''s or agent''s control')`
  );
  console.log(`Seeded 'on-hold' status option: ${seedMeta.affectedRows ? 'inserted' : 'already existed'}`);

  // 3) Mark the 6 foundational statuses as built-in (protected from delete)
  const [, builtInMeta] = await sequelize.query(
    `UPDATE hd_options SET is_built_in = 1 WHERE type = 'status' AND name IN (?)`,
    { replacements: [BUILT_IN_STATUSES] }
  );
  console.log(`Marked ${builtInMeta.affectedRows} status option(s) as built-in`);

  // 4) Normalise legacy empty-string status rows to 'open' before the ENUM,
  // which silently tolerated '', is gone and NOT NULL/DEFAULT 'open' applies.
  const [[{ blankCount }]] = await sequelize.query(`SELECT COUNT(*) AS blankCount FROM hd_tickets WHERE status = ''`);
  if (blankCount > 0) {
    await sequelize.query(`UPDATE hd_tickets SET status = 'open' WHERE status = ''`);
    console.log(`Normalised ${blankCount} ticket(s) with a blank status to 'open'`);
  } else {
    console.log('No blank-status tickets found');
  }

  // 5) Convert the ENUM column to VARCHAR — existing values are preserved as-is.
  const [[col]] = await sequelize.query(`SHOW COLUMNS FROM hd_tickets LIKE 'status'`);
  if (col.Type.startsWith('enum')) {
    await sequelize.query(`ALTER TABLE hd_tickets MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'open'`);
    console.log('Converted hd_tickets.status from ENUM to VARCHAR(50)');
  } else {
    console.log(`hd_tickets.status is already ${col.Type} — skipping conversion`);
  }

  console.log('\n=== Migration 055 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 055 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
