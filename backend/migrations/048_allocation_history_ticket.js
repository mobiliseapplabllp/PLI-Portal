/**
 * Migration 048 — Audit ticket allocation exceptions in pm_allocation_history
 *
 * Deciding (approve / reject / withdraw) an allocation exception on a HELPDESK
 * TICKET mutates the ticket's allocation and sometimes its assignee. The project
 * half of the flow writes a pm_allocation_history row for every such decision;
 * the ticket half could not, because the table demands projectId AND memberId.
 *
 * Adds
 *   pm_allocation_history.ticketId  INT NULL (+ idx_pm_alloc_history_ticket)
 *       Matches hd_tickets.id (an INT AUTO_INCREMENT, NOT a CHAR(36) uuid) —
 *       read from INFORMATION_SCHEMA, never assumed. No FK: the audit row
 *       outlives the ticket, exactly as the project rows outlive their member.
 *
 * Relaxes
 *   pm_allocation_history.projectId  → NULL allowed
 *   pm_allocation_history.memberId   → NULL allowed
 *       A ticket exception belongs to no project and no project member. Purely
 *       widening: drops nothing, rewrites no row, and every existing row keeps
 *       its non-null values.
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/048_allocation_history_ticket.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function hasColumn(table, column) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return Number(cnt) > 0;
}
async function hasIndex(table, index) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    { replacements: [table, index] }
  );
  return Number(cnt) > 0;
}
async function columnInfo(table, column) {
  const [[row]] = await sequelize.query(
    `SELECT COLUMN_TYPE ct, IS_NULLABLE n, COLLATION_NAME col FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return row || null;
}

/** Make one NOT NULL column accept NULL, preserving its exact type + collation. */
async function relaxColumn(table, column) {
  const info = await columnInfo(table, column);
  if (!info) { console.log(`  [!] ${table}.${column} not found — skipping`); return false; }
  if (info.n === 'YES') { console.log(`  [~] ${table}.${column} already nullable — skipping`); return false; }
  await sequelize.query(
    `ALTER TABLE ${table} MODIFY COLUMN ${column} ${info.ct}${info.col ? ` COLLATE ${info.col}` : ''} NULL`
  );
  console.log(`  [+] ${table}.${column} now accepts NULL`);
  return true;
}

async function run() {
  console.log('[Migration 048] Ticket rows in pm_allocation_history');

  const hist = await columnInfo('pm_allocation_history', 'id');
  if (!hist) throw new Error('pm_allocation_history not found — run migration 045 first');

  // The ticket id column must MATCH hd_tickets.id — read it, never assume.
  const ticketPk = await columnInfo('hd_tickets', 'id');
  if (!ticketPk) throw new Error('hd_tickets.id not found — run the helpdesk migrations first');
  const ticketIdDdl = /int/i.test(ticketPk.ct)
    ? `${ticketPk.ct.replace(/\s*auto_increment/i, '')} NULL`
    : `${ticketPk.ct}${ticketPk.col ? ` COLLATE ${ticketPk.col}` : ''} NULL`;
  console.log(`  [i] hd_tickets.id is ${ticketPk.ct} → pm_allocation_history.ticketId ${ticketIdDdl}`);

  if (await hasColumn('pm_allocation_history', 'ticketId')) {
    console.log('  [~] pm_allocation_history.ticketId already exists — skipping');
  } else {
    await sequelize.query(`ALTER TABLE pm_allocation_history ADD COLUMN ticketId ${ticketIdDdl}`);
    console.log('  [+] pm_allocation_history.ticketId added');
  }

  if (await hasIndex('pm_allocation_history', 'idx_pm_alloc_history_ticket')) {
    console.log('  [~] pm_allocation_history.idx_pm_alloc_history_ticket already exists — skipping');
  } else {
    await sequelize.query('ALTER TABLE pm_allocation_history ADD INDEX idx_pm_alloc_history_ticket (ticketId)');
    console.log('  [+] pm_allocation_history.idx_pm_alloc_history_ticket added');
  }

  await relaxColumn('pm_allocation_history', 'projectId');
  await relaxColumn('pm_allocation_history', 'memberId');

  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM pm_allocation_history WHERE ticketId IS NOT NULL`
  );
  console.log(`  [i] ${cnt} ticket allocation history row(s) present`);
  console.log('[Migration 048] done.');
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch((err) => { console.error('[Migration 048] FAILED:', err); process.exit(1); });
}
