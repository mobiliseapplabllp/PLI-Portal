/**
 * Migration 027 — pm_allocation_approvals
 *
 * Creates a new table to track exceptional approval requests when a resource
 * allocation would exceed 100% across projects.
 *
 * UAT only — run once:
 *   node backend/migrations/027_pm_allocation_approvals.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 027] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 027] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_allocation_approvals (
      id              CHAR(36)             NOT NULL PRIMARY KEY,
      projectId       CHAR(36)             NOT NULL COMMENT 'FK to pm_projects',
      userId          CHAR(36)             NOT NULL COMMENT 'The resource being allocated',
      requestedById   CHAR(36)             NOT NULL COMMENT 'Who submitted the approval request',
      approvedById    CHAR(36)             NULL     COMMENT 'Who approved or rejected',
      allocationPct   TINYINT UNSIGNED     NOT NULL COMMENT 'Requested allocation %',
      fromDate        DATE                 NOT NULL COMMENT 'Allocation start date',
      toDate          DATE                 NOT NULL COMMENT 'Allocation end date',
      status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      reason          TEXT                 NOT NULL COMMENT 'Business justification',
      approverNote    TEXT                 NULL     COMMENT 'Approver comment',
      createdAt       DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt       DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_alloc_approvals_project (projectId),
      INDEX idx_pm_alloc_approvals_user (userId),
      INDEX idx_pm_alloc_approvals_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_allocation_approvals table created (or already exists)');

  console.log('\n[Migration 027] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 027] FAILED:', err);
  process.exit(1);
});
