/**
 * Migration 043 — ONE PROJECT MASTER: link helpdesk projects to pm_projects
 *
 * pm_projects is the single master list of projects. A helpdesk project
 * (hd_projects) becomes a *profile* of a PM project: it carries only the
 * helpdesk-specific bits (group, public widget token) and points at its master
 * through the new `pm_project_id` column.
 *
 *   1. pm_project_types gets an 'Operations' type (helpdesk-only projects are
 *      created under this type — no milestone templates, hidden from PM lists
 *      and dashboard aggregates, but counted in utilisation since the work is
 *      real).
 *   2. hd_projects.pm_project_id CHAR(36) NULL + index. No FK: hd_projects has
 *      an INT PK and pm_projects a CHAR(36) PK, and the link is soft — the app
 *      enforces it (constraints:false in Sequelize).
 *
 * pm_projects itself is NOT modified — no column, no row edit. Existing
 * hd_projects rows are linked afterwards with `node scripts/link-hd-projects.js`.
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/043_project_master_link.js
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

async function run() {
  console.log('\n[Migration 043] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 043] Connected.\n');

  // 1. 'Operations' project type (name is UNIQUE — INSERT IGNORE keeps this idempotent)
  const [, meta] = await sequelize.query(
    `INSERT IGNORE INTO pm_project_types (name, isActive, sortOrder, createdAt, updatedAt)
     VALUES ('Operations', 1, 99, NOW(), NOW())`
  );
  const inserted = Number(meta?.affectedRows ?? meta) > 0;
  console.log(inserted
    ? `  [+] pm_project_types 'Operations' added`
    : `  [~] pm_project_types 'Operations' already exists — skipping`);

  // 2. hd_projects.pm_project_id
  if (await hasColumn('hd_projects', 'pm_project_id')) {
    console.log('  [~] hd_projects.pm_project_id already exists — skipping');
  } else {
    await sequelize.query(
      `ALTER TABLE hd_projects ADD COLUMN pm_project_id CHAR(36) NULL DEFAULT NULL
         COMMENT 'Master project (pm_projects.id). Soft link — no FK, app-enforced.'`
    );
    console.log('  [+] hd_projects.pm_project_id added');
  }
  if (await hasIndex('hd_projects', 'idx_hd_projects_pm_project_id')) {
    console.log('  [~] index idx_hd_projects_pm_project_id already exists — skipping');
  } else {
    await sequelize.query(`CREATE INDEX idx_hd_projects_pm_project_id ON hd_projects (pm_project_id)`);
    console.log('  [+] index idx_hd_projects_pm_project_id added');
  }

  // Counts
  const [[c]] = await sequelize.query(
    `SELECT
       (SELECT COUNT(*) FROM hd_projects)                                  AS hdTotal,
       (SELECT COUNT(*) FROM hd_projects WHERE pm_project_id IS NOT NULL)  AS hdLinked,
       (SELECT COUNT(*) FROM pm_projects)                                  AS pmTotal,
       (SELECT COUNT(*) FROM pm_projects WHERE projectType = 'Operations') AS pmOperations`
  );
  console.log(`\n  [✓] hd_projects: ${c.hdTotal} total, ${c.hdLinked} linked · pm_projects: ${c.pmTotal} total, ${c.pmOperations} Operations`);
  if (Number(c.hdTotal) > Number(c.hdLinked)) {
    console.log(`  [i] ${Number(c.hdTotal) - Number(c.hdLinked)} helpdesk project(s) unlinked — run: node scripts/link-hd-projects.js (dry run), then --apply`);
  }
  console.log('\n[Migration 043] Done.\n');
  await sequelize.close();
}

run().catch(err => { console.error('[Migration 043] FAILED:', err.message); process.exit(1); });
