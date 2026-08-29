/**
 * Migration 024 — pm_milestone_planned_actual
 *
 * CRITICAL: Deploy this migration in the SAME deploy as the code change to
 * milestone.controller.js exportMilestones (column keys startDate→plannedStartDate etc.).
 *
 * Changes to pm_milestones:
 *   RENAME  startDate  → plannedStartDate  (Planned start date)
 *   RENAME  endDate    → plannedEndDate    (Planned end date)
 *   ADD     actualStartDate                (Actual start date)
 *   ADD     actualEndDate                  (Actual end date)
 *
 * Re-runnable: rename ops catch 'Unknown column' (already renamed);
 *              add ops catch 'Duplicate column name' (already added).
 *
 * UAT only — run once:
 *   node backend/migrations/024_pm_milestone_planned_actual.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 024] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 024] Connected.\n');

  // 1. Rename startDate → plannedStartDate
  console.log('  [~] Renaming startDate → plannedStartDate ...');
  await sequelize.query(
    `ALTER TABLE pm_milestones CHANGE COLUMN startDate plannedStartDate DATE NULL COMMENT 'Planned start date'`
  ).then(() => {
    console.log('  [+] startDate renamed to plannedStartDate');
  }).catch(e => {
    if (e.message.includes('Unknown column')) {
      console.log('  [~] startDate not found (already renamed) — skipping');
    } else {
      throw e;
    }
  });

  // 2. Rename endDate → plannedEndDate
  console.log('  [~] Renaming endDate → plannedEndDate ...');
  await sequelize.query(
    `ALTER TABLE pm_milestones CHANGE COLUMN endDate plannedEndDate DATE NULL COMMENT 'Planned end date'`
  ).then(() => {
    console.log('  [+] endDate renamed to plannedEndDate');
  }).catch(e => {
    if (e.message.includes('Unknown column')) {
      console.log('  [~] endDate not found (already renamed) — skipping');
    } else {
      throw e;
    }
  });

  // 3. Add actualStartDate
  console.log('  [~] Adding actualStartDate ...');
  await sequelize.query(
    `ALTER TABLE pm_milestones ADD COLUMN actualStartDate DATE NULL COMMENT 'Actual start date'`
  ).then(() => {
    console.log('  [+] actualStartDate added');
  }).catch(e => {
    if (e.message.includes('Duplicate column name')) {
      console.log('  [~] actualStartDate already exists — skipping');
    } else {
      throw e;
    }
  });

  // 4. Add actualEndDate
  console.log('  [~] Adding actualEndDate ...');
  await sequelize.query(
    `ALTER TABLE pm_milestones ADD COLUMN actualEndDate DATE NULL COMMENT 'Actual end date'`
  ).then(() => {
    console.log('  [+] actualEndDate added');
  }).catch(e => {
    if (e.message.includes('Duplicate column name')) {
      console.log('  [~] actualEndDate already exists — skipping');
    } else {
      throw e;
    }
  });

  console.log('\n[Migration 024] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 024] FAILED:', err);
  process.exit(1);
});
