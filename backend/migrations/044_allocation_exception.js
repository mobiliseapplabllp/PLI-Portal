/**
 * Migration 044 — Allocation exceptions (over-capacity with approval)
 *
 * A PM who hits a capacity conflict can request an EXCEPTION: the member row
 * is written with the requested (over-capacity) hours in a pending state and
 * an approval row is raised. Approvers (pm_settings.exceptionApproverRoles)
 * approve → the allocation becomes active, or decline → the member row is
 * reverted to its previous snapshot (or deleted when it was new).
 *
 * Column names are camelCase — matching every other column on these three
 * tables (see migration 042).
 *
 * Adds to pm_project_members:
 *   exceptionStatus      ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none'
 *   exceptionApprovalId  CHAR(36) NULL   (+ idx_pm_members_exception_approval) → pm_allocation_approvals.id
 * Adds to pm_allocation_approvals:
 *   requestType          ENUM('capacity_release','exception') NOT NULL DEFAULT 'capacity_release'
 *   overloadHours        DECIMAL(4,1) NULL           peak − capacity at request time
 *   memberId             CHAR(36) utf8mb4_bin NULL   (+ idx_pm_alloc_approvals_member) → pm_project_members.id
 *   previousSnapshot     JSON NULL                   member values before the request (revert on decline)
 * Adds to pm_settings:
 *   exceptionApproverRoles   JSON NULL   (backfilled to ["admin"] where NULL)
 *   exceptionMaxHoursPerDay  DECIMAL(3,1) NOT NULL DEFAULT 12.0
 *
 * Nothing is dropped; pm_projects is not touched. Idempotent — safe to re-run.
 *
 *   node backend/migrations/044_allocation_exception.js
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
async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  [~] ${table}.${column} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
}
async function addIndex(table, index, column) {
  if (await hasIndex(table, index)) { console.log(`  [~] ${table} index ${index} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD INDEX ${index} (${column})`);
  console.log(`  [+] ${table} index ${index} added`);
}

async function run() {
  console.log('\n[Migration 044] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 044] Connected.\n');

  // pm_project_members ──────────────────────────────────────────────────────
  await addColumn('pm_project_members', 'exceptionStatus',
    `ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none' COMMENT 'Over-capacity exception state for this allocation'`);
  // pm_allocation_approvals.id is CHAR(36) utf8mb4_unicode_ci — match it so joins never mix collations
  await addColumn('pm_project_members', 'exceptionApprovalId',
    `CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'pm_allocation_approvals.id of the exception request (pending or approved)'`);
  await addIndex('pm_project_members', 'idx_pm_members_exception_approval', 'exceptionApprovalId');

  // pm_allocation_approvals ─────────────────────────────────────────────────
  await addColumn('pm_allocation_approvals', 'requestType',
    `ENUM('capacity_release','exception') NOT NULL DEFAULT 'capacity_release' COMMENT 'capacity_release = ask another project to free hours; exception = allow over-capacity'`);
  await addColumn('pm_allocation_approvals', 'overloadHours',
    `DECIMAL(4,1) NULL DEFAULT NULL COMMENT 'Exception only: peak hours/day minus capacity at request time'`);
  // pm_project_members.id is CHAR(36) utf8mb4_bin — match it
  await addColumn('pm_allocation_approvals', 'memberId',
    `CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL COMMENT 'Exception only: pm_project_members.id written in pending state'`);
  await addIndex('pm_allocation_approvals', 'idx_pm_alloc_approvals_member', 'memberId');
  await addColumn('pm_allocation_approvals', 'previousSnapshot',
    `JSON NULL DEFAULT NULL COMMENT 'Exception only: member allocation fields before the request (NULL = row was new); restored on decline'`);

  // pm_settings ─────────────────────────────────────────────────────────────
  await addColumn('pm_settings', 'exceptionApproverRoles',
    `JSON NULL DEFAULT NULL COMMENT 'Roles allowed to approve allocation exceptions (default ["admin"])'`);
  await addColumn('pm_settings', 'exceptionMaxHoursPerDay',
    `DECIMAL(3,1) NOT NULL DEFAULT 12.0 COMMENT 'Hard cap on hours/day an exception may request'`);

  // JSON columns cannot carry a literal default on every MySQL 8 build → backfill.
  const [, meta] = await sequelize.query(
    `UPDATE pm_settings SET exceptionApproverRoles = JSON_ARRAY('admin') WHERE exceptionApproverRoles IS NULL`
  );
  const backfilled = meta && typeof meta.affectedRows === 'number' ? meta.affectedRows : 0;

  const [[a]] = await sequelize.query(`SELECT COUNT(*) n FROM pm_project_members WHERE exceptionStatus = 'none'`);
  const [[b]] = await sequelize.query(`SELECT COUNT(*) n FROM pm_allocation_approvals WHERE requestType = 'capacity_release'`);
  console.log(`\n  [✓] ${a.n} member row(s) exceptionStatus=none · ${b.n} approval row(s) requestType=capacity_release · ${backfilled} settings row(s) backfilled with ["admin"]`);
  console.log('\n[Migration 044] Done.\n');
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch(err => { console.error('[Migration 044] FAILED:', err.message); process.exit(1); });
}
