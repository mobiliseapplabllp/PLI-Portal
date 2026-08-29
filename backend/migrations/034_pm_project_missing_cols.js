/**
 * Migration 034 — Add missing columns to pm_projects
 *
 * The Project.js model references 3 columns that exist NEITHER in the
 * production DB schema NOR in any prior migration (022–033b).
 * Without this migration, Sequelize throws "Unknown column" on every
 * project query — ProjectList, ProjectDetail, and Dashboard all crash.
 *
 * COLUMNS ADDED:
 *
 *   accountManagerId  CHAR(36) NULL
 *     Optional FK to users.id — the account manager for this project.
 *     Referenced in milestone.service.js assertProjectVisible() so that
 *     account managers can see projects assigned to them.
 *     All 49 existing projects get NULL (no account manager assigned yet).
 *
 *   billingType  ENUM('Billable','Non-Billable') NOT NULL DEFAULT 'Non-Billable'
 *     Project billing classification.
 *     DEFAULT 'Non-Billable' is confirmed by the user — all 49 existing
 *     production projects are treated as Non-Billable at migration time.
 *     PMs can update individual projects via the UI after deployment.
 *     NOT NULL: MySQL fills all existing rows with 'Non-Billable' during
 *     ALTER TABLE before removing the NULL option — zero data loss.
 *
 *   projectType  VARCHAR(100) NOT NULL DEFAULT 'Demo'
 *     Links to pm_project_types.name (application-level FK).
 *     DEFAULT 'Demo' is confirmed by the user — the 'Demo' project type
 *     is seeded in migration 021b and has a 'Development' milestone template.
 *     All 49 existing projects get 'Demo'. PMs can change type via UI.
 *     NOT NULL: MySQL fills all existing rows with 'Demo' during ALTER TABLE.
 *
 * DATA SAFETY:
 *   accountManagerId → NULL for all 49 rows (no data loss)
 *   billingType      → 'Non-Billable' for all 49 rows (confirmed default)
 *   projectType      → 'Demo' for all 49 rows (confirmed default)
 *
 * Run ORDER: AFTER 033b (data migration complete).
 *
 *   node backend/migrations/034_pm_project_missing_cols.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function addColumnIfMissing(table, column, definition) {
  await sequelize.query(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  ).catch(e => {
    if (!e.message.includes('Duplicate column name')) throw e;
    console.log(`  [~] ${column} already exists — skipping`);
  });
}

async function run() {
  console.log('\n[Migration 034] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 034] Connected.\n');

  // ── Step 1: accountManagerId ──────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_projects',
    'accountManagerId',
    `CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL
     COMMENT 'FK to users.id — account manager (application-level integrity)' AFTER \`managerId\``
  );
  console.log('  [+] accountManagerId CHAR(36) NULL — all 49 existing rows get NULL');

  // ── Step 2: Index on accountManagerId ────────────────────────────────────
  await sequelize.query(`
    CREATE INDEX idx_pm_projects_account_mgr ON pm_projects(accountManagerId)
  `).catch(e => {
    if (!e.message.includes('Duplicate key name')) throw e;
    console.log('  [~] idx_pm_projects_account_mgr already exists — skipping');
  });
  console.log('  [+] idx_pm_projects_account_mgr index created');

  // ── Step 3: billingType ───────────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_projects',
    'billingType',
    `ENUM('Billable','Non-Billable') NOT NULL DEFAULT 'Non-Billable'
     COMMENT 'Billing classification — all 49 existing projects default to Non-Billable'`
  );
  console.log("  [+] billingType ENUM NOT NULL DEFAULT 'Non-Billable' — 49 existing rows backfilled");

  // ── Step 4: projectType ───────────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_projects',
    'projectType',
    `VARCHAR(100) NOT NULL DEFAULT 'Demo'
     COMMENT 'FK to pm_project_types.name — all 49 existing projects default to Demo'`
  );
  console.log("  [+] projectType VARCHAR(100) NOT NULL DEFAULT 'Demo' — 49 existing rows backfilled");

  // ── Verify backfill ───────────────────────────────────────────────────────
  const [[{ nonBillableCount, demoCount }]] = await sequelize.query(`
    SELECT
      SUM(CASE WHEN billingType = 'Non-Billable' THEN 1 ELSE 0 END) AS nonBillableCount,
      SUM(CASE WHEN projectType = 'Demo'         THEN 1 ELSE 0 END) AS demoCount
    FROM pm_projects
  `);
  console.log(`\n  [✓] Verify: ${nonBillableCount} projects have billingType='Non-Billable'`);
  console.log(`  [✓] Verify: ${demoCount} projects have projectType='Demo'`);

  console.log('\n[Migration 034] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 034] FAILED:', err.message);
  process.exit(1);
});
