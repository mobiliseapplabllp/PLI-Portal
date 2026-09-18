/**
 * Migration 046 — Project usage flags (Product / Operations)
 *
 * A project can serve Project Management (Product), Operations (tickets), or both:
 *   isProduct    the project is planned and tracked in PM — DEFAULT MILESTONES are
 *                created on creation only when this is true
 *   isOperations the project accepts helpdesk tickets
 *
 * Both are independent and both may be true. The ticket project dropdown lists
 * every project regardless of the flags.
 *
 * ADDITIVE ONLY on pm_projects: two boolean columns with safe defaults. No data is
 * rewritten beyond the one-time backfill below, no column or row is dropped.
 * Backfill (existing rows keep working everywhere):
 *   isProduct    = 1 for every project (they are all visible in PM today)
 *   isOperations = 1 where projectType = 'Operations' OR the project already has a
 *                  helpdesk profile (hd_projects.pm_project_id), else 0
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/046_project_usage_flags.js
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
async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  [~] ${table}.${column} already exists — skipping`); return false; }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
  return true;
}

async function run() {
  console.log('[Migration 046] Project usage flags (Product / Operations)');

  const addedProduct = await addColumn('pm_projects', 'isProduct', 'TINYINT(1) NOT NULL DEFAULT 1');
  const addedOps     = await addColumn('pm_projects', 'isOperations', 'TINYINT(1) NOT NULL DEFAULT 0');

  if (addedProduct) {
    const [, meta] = await sequelize.query(`UPDATE pm_projects SET isProduct = 1`);
    console.log(`  [=] isProduct backfilled on ${meta?.affectedRows ?? 0} project(s)`);
  }
  if (addedOps) {
    const [, m1] = await sequelize.query(`UPDATE pm_projects SET isOperations = 1 WHERE projectType = 'Operations'`);
    console.log(`  [=] isOperations set from projectType on ${m1?.affectedRows ?? 0} project(s)`);
    const [, m2] = await sequelize.query(
      `UPDATE pm_projects p
          JOIN hd_projects h ON h.pm_project_id = p.id
           SET p.isOperations = 1
         WHERE p.isOperations = 0`
    );
    console.log(`  [=] isOperations set from helpdesk profiles on ${m2?.affectedRows ?? 0} project(s)`);
  }

  const [[counts]] = await sequelize.query(
    `SELECT COUNT(*) AS total, SUM(isProduct) AS product, SUM(isOperations) AS operations FROM pm_projects`
  );
  console.log(`  [i] ${counts.total} project(s): ${counts.product} product, ${counts.operations} operations`);
  console.log('[Migration 046] done.');
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch((err) => { console.error('[Migration 046] FAILED:', err); process.exit(1); });
}
