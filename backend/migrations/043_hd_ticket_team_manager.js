/**
 * Migration 043 — Helpdesk "team = reporting manager" + PM project link
 *
 * A helpdesk TEAM is now a manager (users row) plus their active direct
 * reports (users.managerId). Tickets record which team owns them in a new
 * column instead of the retired hd_groups link (which is kept, read-only).
 * Tickets and legacy hd_projects also gain a link to PM projects (UUID).
 *
 * Adds to hd_tickets (snake_case, matching the table):
 *   team_manager_id  CHAR(36) utf8mb4_bin NULL  + idx_hd_tickets_team_manager   → users.id
 *   pm_project_id    CHAR(36) utf8mb4_bin NULL  + idx_hd_tickets_pm_project     → pm_projects.id
 * Adds to hd_projects:
 *   pm_project_id    CHAR(36) utf8mb4_bin NULL  + idx_hd_projects_pm_project_id → pm_projects.id
 *
 * users.id / users.managerId / pm_projects.id are CHAR(36) COLLATE utf8mb4_bin,
 * so every new column uses the same collation (joins otherwise fail with
 * "Illegal mix of collations"). If a column already exists with a different
 * collation it is MODIFIED in place — no data is dropped.
 *
 * Backfill (B1): tickets with an assignee and NULL team_manager_id get
 * team_manager_id = assignee's users.managerId (only where the assignee has one).
 *
 * Nothing is dropped. Idempotent — safe to re-run.
 *
 *   node backend/migrations/043_hd_ticket_team_manager.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const UUID_COL = `CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL`;

async function columnInfo(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COLLATION_NAME AS collation FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows[0] || null;
}
async function hasIndex(table, index) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    { replacements: [table, index] }
  );
  return Number(cnt) > 0;
}
async function addUuidColumn(table, column, comment) {
  const ddl = `${UUID_COL} COMMENT '${comment}'`;
  const info = await columnInfo(table, column);
  if (!info) {
    await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`  [+] ${table}.${column} added`);
    return;
  }
  if (info.collation !== 'utf8mb4_bin') {
    await sequelize.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${ddl}`);
    console.log(`  [~] ${table}.${column} already existed (${info.collation}) — collation set to utf8mb4_bin`);
    return;
  }
  console.log(`  [~] ${table}.${column} already exists — skipping`);
}
async function addIndex(table, index, column) {
  if (await hasIndex(table, index)) { console.log(`  [~] ${table} index ${index} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD INDEX ${index} (${column})`);
  console.log(`  [+] ${table} index ${index} added`);
}

async function run() {
  console.log('\n[Migration 043] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 043] Connected.\n');

  await addUuidColumn('hd_tickets',  'team_manager_id', 'Team owning the ticket = reporting manager (users.id)');
  await addIndex('hd_tickets',  'idx_hd_tickets_team_manager',   'team_manager_id');
  await addUuidColumn('hd_tickets',  'pm_project_id',   'PM project (pm_projects.id); project_id keeps the legacy hd_projects INT');
  await addIndex('hd_tickets',  'idx_hd_tickets_pm_project',     'pm_project_id');
  await addUuidColumn('hd_projects', 'pm_project_id',   'Linked PM project (pm_projects.id) for legacy helpdesk projects');
  await addIndex('hd_projects', 'idx_hd_projects_pm_project_id', 'pm_project_id');

  // Backfill: team = assignee's reporting manager (only when the ticket has no team yet).
  const [, meta] = await sequelize.query(
    `UPDATE hd_tickets t
       JOIN users u ON u.id = t.assignee_id
        SET t.team_manager_id = u.managerId
      WHERE t.team_manager_id IS NULL
        AND t.assignee_id IS NOT NULL
        AND u.managerId IS NOT NULL`
  );
  const backfilled = meta && typeof meta.affectedRows === 'number' ? meta.affectedRows : 0;

  const [[a]] = await sequelize.query(`SELECT COUNT(*) n FROM hd_tickets WHERE team_manager_id IS NOT NULL`);
  const [[b]] = await sequelize.query(`SELECT COUNT(*) n FROM hd_tickets WHERE team_manager_id IS NULL AND assignee_id IS NOT NULL`);
  console.log(`\n  [✓] backfilled ${backfilled} ticket(s) · ${a.n} ticket(s) have a team · ${b.n} assigned ticket(s) still without a team (assignee has no manager)`);
  console.log('\n[Migration 043] Done.\n');
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch(err => { console.error('[Migration 043] FAILED:', err.message); process.exit(1); });
}
