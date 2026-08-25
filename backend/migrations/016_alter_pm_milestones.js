/**
 * Migration 016 — Alter pm_milestones for hierarchy + weight percentage
 *
 * New columns:
 *   parentMilestoneId  — self-FK; NULL = top-level (default) milestone
 *   isDefault          — 1 = system default (from template), 0 = PM-added sub-milestone
 *   weightPercentage   — the % this milestone carries in the project (PM sets this)
 *   minPct             — range min from template (default milestones only)
 *   maxPct             — range max from template (default milestones only)
 *
 * Note: existing completionPercentage and accountableUserId are kept as-is.
 *
 * UAT only — run once:
 *   node backend/migrations/016_alter_pm_milestones.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = '${table}'
      AND COLUMN_NAME  = '${column}'
  `);
  return rows[0].cnt > 0;
}

async function run() {
  console.log('\n[Migration 016] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 016] Connected.\n');

  // ADD parentMilestoneId (self-ref — use index only; FK skipped to avoid collation issues)
  if (await columnExists('pm_milestones', 'parentMilestoneId')) {
    console.log('  [~] parentMilestoneId already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD COLUMN parentMilestoneId CHAR(36) NULL DEFAULT NULL
      AFTER projectId
    `);
    console.log('  [+] parentMilestoneId added');
  }

  // ADD isDefault
  if (await columnExists('pm_milestones', 'isDefault')) {
    console.log('  [~] isDefault already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD COLUMN isDefault TINYINT(1) NOT NULL DEFAULT 0
      AFTER parentMilestoneId
    `);
    console.log('  [+] isDefault added');
  }

  // ADD weightPercentage (PM-assigned weight in project total)
  if (await columnExists('pm_milestones', 'weightPercentage')) {
    console.log('  [~] weightPercentage already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD COLUMN weightPercentage DECIMAL(5,2) NULL DEFAULT NULL
      AFTER isDefault
    `);
    console.log('  [+] weightPercentage added');
  }

  // ADD minPct (range min from template — default milestones only)
  if (await columnExists('pm_milestones', 'minPct')) {
    console.log('  [~] minPct already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD COLUMN minPct DECIMAL(5,2) NULL DEFAULT NULL
      AFTER weightPercentage
    `);
    console.log('  [+] minPct added');
  }

  // ADD maxPct (range max from template — default milestones only)
  if (await columnExists('pm_milestones', 'maxPct')) {
    console.log('  [~] maxPct already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD COLUMN maxPct DECIMAL(5,2) NULL DEFAULT NULL
      AFTER minPct
    `);
    console.log('  [+] maxPct added');
  }

  // ADD index on parentMilestoneId for tree queries
  try {
    await sequelize.query(`
      ALTER TABLE pm_milestones
      ADD INDEX idx_pm_milestones_parent (parentMilestoneId)
    `);
    console.log('  [+] Index on parentMilestoneId added');
  } catch (e) {
    // Index may already exist
    console.log('  [~] Index on parentMilestoneId already exists — skipping');
  }

  console.log('\n[Migration 016] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 016] FAILED:', err);
  process.exit(1);
});
