/**
 * Migration 025 — pm_milestone_date_logs
 *
 * Creates an audit log table that records every change to milestone date fields
 * (planned or actual), who made the change, and the reason given.
 *
 * Table: pm_milestone_date_logs
 *   id            — UUID primary key
 *   milestoneId   — FK to pm_milestones
 *   changedById   — FK to users
 *   field         — which date field changed
 *   oldValue      — previous date value
 *   newValue      — new date value
 *   reason        — free-text explanation for the change
 *   createdAt     — auto-set to current timestamp
 *
 * Re-runnable: CREATE TABLE uses IF NOT EXISTS.
 *
 * UAT only — run once:
 *   node backend/migrations/025_pm_milestone_date_logs.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 025] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 025] Connected.\n');

  // Create pm_milestone_date_logs table
  console.log('  [~] Creating pm_milestone_date_logs table ...');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_milestone_date_logs (
      id              CHAR(36)     NOT NULL PRIMARY KEY,
      milestoneId     CHAR(36)     NOT NULL COMMENT 'FK to pm_milestones',
      changedById     CHAR(36)     NOT NULL COMMENT 'FK to users',
      field           ENUM('plannedStartDate','plannedEndDate','actualStartDate','actualEndDate') NOT NULL,
      oldValue        DATE         NULL,
      newValue        DATE         NULL,
      reason          TEXT         NULL COMMENT 'Why the date was changed',
      createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pm_date_logs_milestone (milestoneId),
      INDEX idx_pm_date_logs_changed_by (changedById)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  [+] pm_milestone_date_logs created (or already existed)');

  console.log('\n[Migration 025] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 025] FAILED:', err);
  process.exit(1);
});
