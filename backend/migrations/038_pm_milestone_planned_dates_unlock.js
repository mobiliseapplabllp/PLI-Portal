/**
 * Migration 038 — Admin unlock for planned dates
 *
 * Planned dates are write-once (the baseline). This adds the state needed
 * for the two-step re-baseline flow:
 *
 *   1. Admin UNLOCKS a milestone's planned dates (with a reason)
 *   2. Manager RESETS the dates
 *   3. Dates auto-relock after that one change
 *
 * Adds to pm_milestones:
 *   plannedDatesUnlockedAt  DATETIME NULL   — when the unlock happened (NULL = locked)
 *   plannedDatesUnlockedBy  VARCHAR(36) NULL — admin user id who unlocked
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/038_pm_milestone_planned_dates_unlock.js
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

async function run() {
  console.log('\n[Migration 038] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 038] Connected.\n');

  if (await hasColumn('pm_milestones', 'plannedDatesUnlockedAt')) {
    console.log('  [~] pm_milestones.plannedDatesUnlockedAt already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
        ADD COLUMN plannedDatesUnlockedAt DATETIME NULL DEFAULT NULL
        COMMENT 'NULL = planned dates locked; set = an admin has unlocked them for one change'
    `);
    console.log('  [+] pm_milestones.plannedDatesUnlockedAt added');
  }

  if (await hasColumn('pm_milestones', 'plannedDatesUnlockedBy')) {
    console.log('  [~] pm_milestones.plannedDatesUnlockedBy already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
        ADD COLUMN plannedDatesUnlockedBy VARCHAR(36) NULL DEFAULT NULL
        COMMENT 'users.id of the admin who unlocked'
    `);
    console.log('  [+] pm_milestones.plannedDatesUnlockedBy added');
  }

  // ── Audit: let pm_milestone_date_logs record lock/unlock events ───────────
  // `field` is an ENUM of the four date columns; lock events need their own
  // values or MySQL silently coerces them to ''.
  const [[col]] = await sequelize.query(`
    SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_milestone_date_logs' AND COLUMN_NAME = 'field'
  `);
  if (col && col.COLUMN_TYPE.includes('plannedDatesUnlock')) {
    console.log('  [~] pm_milestone_date_logs.field already includes lock events — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestone_date_logs
        MODIFY COLUMN field ENUM(
          'plannedStartDate','plannedEndDate','actualStartDate','actualEndDate',
          'plannedDatesUnlock','plannedDatesLock'
        ) NOT NULL
    `);
    console.log('  [+] pm_milestone_date_logs.field ENUM extended with plannedDatesUnlock / plannedDatesLock');
  }

  console.log('\n[Migration 038] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 038] FAILED:', err.message);
  process.exit(1);
});
