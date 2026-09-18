/**
 * Migration 047 — Allocation exceptions for HELPDESK TICKETS
 *
 * Helpdesk ticket allocation now follows the SAME capacity rules as PM team
 * allocation: over-capacity is blocked (409) and the user may raise an
 * ALLOCATION EXCEPTION decided by the same admin inbox
 * (pm_allocation_approvals, requestType 'exception').
 *
 * Adds
 *   pm_allocation_approvals.ticketId  INT NULL (+ idx_pm_alloc_approvals_ticket)
 *       hd_tickets.id is an INT AUTO_INCREMENT (NOT a CHAR(36) uuid) — the column
 *       MATCHES that type, so no collation is involved. No FK: the approval row
 *       outlives the ticket exactly as the project rows outlive their member.
 *
 * Relaxes
 *   pm_allocation_approvals.projectId  CHAR(36) utf8mb4_unicode_ci → NULL allowed
 *       A ticket exception belongs to NO project, so projectId must be nullable.
 *       This is the one extra statement beyond the new column and it is purely
 *       widening — it drops nothing and rewrites no row.
 *
 * A ticket's exception state is DERIVED from these rows (a pending 'exception'
 * approval with a ticketId ⇒ that ticket's allocation is pending and is not
 * counted towards capacity) — no column is added to hd_tickets.
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/047_ticket_allocation_exception.js
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
async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  [~] ${table}.${column} already exists — skipping`); return false; }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
  return true;
}
async function addIndex(table, index, cols) {
  if (await hasIndex(table, index)) { console.log(`  [~] ${table}.${index} already exists — skipping`); return false; }
  await sequelize.query(`ALTER TABLE ${table} ADD INDEX ${index} (${cols})`);
  console.log(`  [+] ${table}.${index} added`);
  return true;
}

async function run() {
  console.log('[Migration 047] Ticket allocation exceptions');

  // The ticket id column must MATCH hd_tickets.id — read it, never assume.
  const ticketPk = await columnInfo('hd_tickets', 'id');
  if (!ticketPk) throw new Error('hd_tickets.id not found — run the helpdesk migrations first');
  const ticketIdDdl = /int/i.test(ticketPk.ct)
    ? `${ticketPk.ct.replace(/\s*auto_increment/i, '')} NULL`
    : `${ticketPk.ct}${ticketPk.col ? ` COLLATE ${ticketPk.col}` : ''} NULL`;
  console.log(`  [i] hd_tickets.id is ${ticketPk.ct} → pm_allocation_approvals.ticketId ${ticketIdDdl}`);

  await addColumn('pm_allocation_approvals', 'ticketId', ticketIdDdl);
  await addIndex('pm_allocation_approvals', 'idx_pm_alloc_approvals_ticket', 'ticketId');

  // A ticket exception has no project → projectId must accept NULL.
  const proj = await columnInfo('pm_allocation_approvals', 'projectId');
  if (proj && proj.n === 'NO') {
    await sequelize.query(
      `ALTER TABLE pm_allocation_approvals MODIFY COLUMN projectId ${proj.ct}${proj.col ? ` COLLATE ${proj.col}` : ''} NULL`
    );
    console.log('  [+] pm_allocation_approvals.projectId now accepts NULL');
  } else {
    console.log('  [~] pm_allocation_approvals.projectId already nullable — skipping');
  }

  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM pm_allocation_approvals WHERE ticketId IS NOT NULL`
  );
  console.log(`  [i] ${cnt} ticket allocation exception row(s) present`);
  console.log('[Migration 047] done.');
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch((err) => { console.error('[Migration 047] FAILED:', err); process.exit(1); });
}
