/**
 * Migration 018 — Create pm_status_reports table
 *
 * Stores periodic status reports per project (weekly/monthly).
 * Each report has a RAG status, summary, risks, and next steps.
 *
 * UAT only — run once:
 *   node backend/migrations/018_create_pm_status_reports.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 018] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 018] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_status_reports (
      id           CHAR(36)     NOT NULL PRIMARY KEY,
      projectId    CHAR(36)     NOT NULL,
      reportDate   DATE         NOT NULL,
      period       ENUM('Weekly','Fortnightly','Monthly','Ad-hoc')
                                NOT NULL DEFAULT 'Weekly',
      ragStatus    ENUM('Green','Amber','Red')
                                NOT NULL DEFAULT 'Green',
      summary      TEXT         NULL COMMENT 'Overall status summary',
      risks        TEXT         NULL COMMENT 'Current risks and issues',
      nextSteps    TEXT         NULL COMMENT 'Planned next steps',
      createdById  CHAR(36)     NULL,
      createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_sr_project (projectId),
      INDEX idx_pm_sr_date (reportDate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_status_reports table created (or already exists)');

  console.log('\n[Migration 018] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 018] FAILED:', err);
  process.exit(1);
});
