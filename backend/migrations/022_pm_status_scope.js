/**
 * Migration 022 — pm_status_scope
 *
 * Adds three boolean scope columns to pm_statuses so each status can be
 * independently enabled for Project, Milestone, and Sub-Milestone contexts.
 *
 * Columns added:
 *   forProject      TINYINT(1) DEFAULT 1  — available as a project status
 *   forMilestone    TINYINT(1) DEFAULT 1  — available as a milestone status
 *   forSubMilestone TINYINT(1) DEFAULT 0  — available as a sub-milestone status
 *
 * UAT only — safe to re-run (duplicate-column errors are caught):
 *   node backend/migrations/022_pm_status_scope.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 022] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 022] Connected.\n');

  // --- forProject ---
  await sequelize.query(`
    ALTER TABLE pm_statuses
      ADD COLUMN forProject TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Available as project status'
  `).catch(err => {
    if (err.message.includes('Duplicate column name')) {
      console.log('  [~] forProject column already exists — skipping');
    } else {
      throw err;
    }
  });
  console.log('  [+] forProject column ensured');

  // --- forMilestone ---
  await sequelize.query(`
    ALTER TABLE pm_statuses
      ADD COLUMN forMilestone TINYINT(1) NOT NULL DEFAULT 1
        COMMENT 'Available as milestone status'
  `).catch(err => {
    if (err.message.includes('Duplicate column name')) {
      console.log('  [~] forMilestone column already exists — skipping');
    } else {
      throw err;
    }
  });
  console.log('  [+] forMilestone column ensured');

  // --- forSubMilestone ---
  await sequelize.query(`
    ALTER TABLE pm_statuses
      ADD COLUMN forSubMilestone TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Available as sub-milestone status'
  `).catch(err => {
    if (err.message.includes('Duplicate column name')) {
      console.log('  [~] forSubMilestone column already exists — skipping');
    } else {
      throw err;
    }
  });
  console.log('  [+] forSubMilestone column ensured');

  // --- Backfill guard -------------------------------------------------------
  // Migration 021c creates pm_statuses from scratch with specific per-status
  // scope flags (e.g. 'not_started' has forProject=0, 'planning' has
  // forMilestone=0). If 021c ran before us, those precise values must NOT
  // be overwritten with the conservative defaults below.
  //
  // Detection: if any row has forProject=0 (which 021c sets on milestone-only
  // statuses), then 021c already seeded with correct per-row values — skip.
  const [[{ alreadySpecific }]] = await sequelize.query(
    `SELECT COUNT(*) AS alreadySpecific FROM pm_statuses WHERE forProject = 0`
  );

  if (Number(alreadySpecific) > 0) {
    console.log('  [~] pm_statuses already has per-status scope flags (021c ran first) — skipping blanket backfill');
  } else {
    // Only runs on a legacy pm_statuses table that had NO scope columns before.
    // In this case all rows are project-statuses and the conservative default is correct.
    await sequelize.query(`
      UPDATE pm_statuses
         SET forProject = 1, forMilestone = 1, forSubMilestone = 0
       WHERE forProject IS NOT NULL
    `);
    console.log('  [+] Legacy rows backfilled with conservative scope defaults');
  }

  console.log('\n[Migration 022] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 022] FAILED:', err);
  process.exit(1);
});
