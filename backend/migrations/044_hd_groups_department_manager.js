/**
 * Migration 044 — Helpdesk groups reuse KPI departments and users
 *
 * A helpdesk group (team) can now be backed by a KPI department, and its
 * manager is validated against the users table.
 *
 *   hd_groups.department_id  CHAR(36) NULL (utf8mb4_bin, same as departments.id)
 *                            + index. NO foreign key — departments is a
 *                            KPI-owned table in another module; the app
 *                            validates existence instead.
 *   hd_groups.manager_id     orphan values (no matching users.id) are set to
 *                            NULL and printed; then a real FK to users(id)
 *                            ON DELETE SET NULL is attempted. If the FK cannot
 *                            be added (charset / collation / type mismatch)
 *                            the column is first re-typed to match users.id
 *                            (CHAR(36) utf8mb4_bin — only hd_groups is
 *                            touched) and the FK retried; a second failure is
 *                            printed and the migration continues (the app
 *                            validates managerId on write).
 *
 * `departments` and `users` are never altered.
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/044_hd_groups_department_manager.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const FK_NAME  = 'fk_hd_groups_manager';
const IDX_NAME = 'idx_hd_groups_department_id';

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
async function hasConstraint(table, name) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    { replacements: [table, name] }
  );
  return Number(cnt) > 0;
}

async function addDepartmentColumn() {
  if (await hasColumn('hd_groups', 'department_id')) {
    console.log('  [~] hd_groups.department_id already exists — skipping');
  } else {
    await sequelize.query(
      `ALTER TABLE hd_groups ADD COLUMN department_id CHAR(36)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL
         COMMENT 'KPI departments.id this team is backed by (no FK: cross-module, app-validated)'`
    );
    console.log('  [+] hd_groups.department_id added');
  }
  if (await hasIndex('hd_groups', IDX_NAME)) {
    console.log(`  [~] index ${IDX_NAME} already exists — skipping`);
  } else {
    await sequelize.query(`ALTER TABLE hd_groups ADD INDEX ${IDX_NAME} (department_id)`);
    console.log(`  [+] index ${IDX_NAME} added`);
  }
}

async function nullOrphanManagers() {
  const [orphans] = await sequelize.query(
    `SELECT id, name, manager_id FROM hd_groups
      WHERE manager_id IS NOT NULL AND manager_id NOT IN (SELECT id FROM users)`
  );
  if (!orphans.length) {
    console.log('  [~] no hd_groups rows with an orphan manager_id');
    return;
  }
  for (const g of orphans) {
    console.log(`  [!] hd_groups #${g.id} "${g.name}": manager_id ${g.manager_id} has no users row — set to NULL`);
  }
  await sequelize.query(
    `UPDATE hd_groups SET manager_id = NULL
      WHERE manager_id IS NOT NULL AND manager_id NOT IN (SELECT id FROM users)`
  );
  console.log(`  [+] ${orphans.length} orphan manager_id value(s) nulled`);
}

async function tryAddFk() {
  await sequelize.query(
    `ALTER TABLE hd_groups ADD CONSTRAINT ${FK_NAME}
       FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL`
  );
}

async function addManagerFk() {
  if (await hasConstraint('hd_groups', FK_NAME)) {
    console.log(`  [~] ${FK_NAME} already exists — skipping`);
    return;
  }
  try {
    await tryAddFk();
    console.log(`  [+] ${FK_NAME} added (hd_groups.manager_id → users.id ON DELETE SET NULL)`);
    return;
  } catch (err) {
    console.log(`  [x] ${FK_NAME} could not be added as-is: ${err.message}`);
  }

  // Retry once after aligning hd_groups.manager_id with users.id (CHAR(36) utf8mb4_bin).
  try {
    await sequelize.query(
      `ALTER TABLE hd_groups MODIFY manager_id CHAR(36)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL DEFAULT NULL`
    );
    console.log('  [+] hd_groups.manager_id re-typed to CHAR(36) utf8mb4_bin to match users.id');
    await tryAddFk();
    console.log(`  [+] ${FK_NAME} added after re-type (hd_groups.manager_id → users.id ON DELETE SET NULL)`);
  } catch (err) {
    console.log(`  [x] ${FK_NAME} still could not be added: ${err.message}`);
    console.log('      Continuing without the FK — the app validates managerId against active users.');
  }
}

async function run() {
  console.log('\n[Migration 044] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 044] Connected.\n');

  await addDepartmentColumn();
  await nullOrphanManagers();
  await addManagerFk();

  const [[s]] = await sequelize.query(
    `SELECT COUNT(*) total, SUM(department_id IS NOT NULL) withDept, SUM(manager_id IS NOT NULL) withMgr FROM hd_groups`
  );
  console.log(`\n  [✓] hd_groups: ${s.total} row(s), ${Number(s.withDept) || 0} with department, ${Number(s.withMgr) || 0} with manager`);
  console.log('\n[Migration 044] Done.\n');
  await sequelize.close();
}

run().catch(err => { console.error('[Migration 044] FAILED:', err.message); process.exit(1); });
