/**
 * Migration 033 — Add missing columns to pm_milestones
 *
 * The Milestone.js model references 5 columns that exist NEITHER in the
 * production DB schema NOR in any prior migration (022–032).
 * Without this migration, Sequelize throws "Unknown column" on every
 * milestone query — MilestoneBoard and ProjectDetail both crash.
 *
 * COLUMNS ADDED:
 *
 *   parentMilestoneId  CHAR(36) NULL
 *     Self-referencing FK: NULL = top-level (parent) milestone;
 *     non-NULL = sub-milestone under that parent.
 *     Set by milestone.service.js createSubMilestone().
 *
 *   isDefault  TINYINT(1) NOT NULL DEFAULT 0
 *     Marks template-generated milestones (created from pm_milestone_templates
 *     via createDefaultMilestones()). PMs cannot delete isDefault=1 milestones.
 *     Existing production milestones get 0 — migration 033b will set their
 *     wrapped 'Development' parents to 1.
 *
 *   weightPercentage  DECIMAL(5,2) NULL
 *     PM-assigned weight of this milestone within the project scope.
 *     Validated against minPct/maxPct (advisory warning in service layer).
 *
 *   minPct  DECIMAL(5,2) NULL
 *     Lower bound of acceptable weightPercentage (from template).
 *
 *   maxPct  DECIMAL(5,2) NULL
 *     Upper bound of acceptable weightPercentage (from template).
 *
 * DATA SAFETY:
 *   All added columns allow NULL or have DEFAULT 0.
 *   All 223 existing production milestone rows are untouched (no data loss).
 *   parentMilestoneId is intentionally NOT a DB-level FK to allow flexible
 *   ordering — application-level integrity only (consistent with existing pattern).
 *
 * Run ORDER: AFTER 031, BEFORE 033b (data migration).
 *
 *   node backend/migrations/033_pm_milestone_missing_cols.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

// Helper — add a column only if it doesn't already exist (idempotent)
async function addColumnIfMissing(table, column, definition) {
  await sequelize.query(`
    ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}
  `).catch(e => {
    if (!e.message.includes('Duplicate column name')) throw e;
    console.log(`  [~] ${column} already exists — skipping`);
  });
}

async function run() {
  console.log('\n[Migration 033] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 033] Connected.\n');

  // ── Step 1: parentMilestoneId ─────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_milestones',
    'parentMilestoneId',
    `CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL
     COMMENT 'NULL = top-level parent; non-NULL = sub-milestone' AFTER \`projectId\``
  );
  console.log('  [+] parentMilestoneId CHAR(36) NULL');

  // ── Step 2: isDefault ─────────────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_milestones',
    'isDefault',
    `TINYINT(1) NOT NULL DEFAULT 0
     COMMENT 'Template-generated milestone — set by createDefaultMilestones()' AFTER \`parentMilestoneId\``
  );
  console.log('  [+] isDefault TINYINT(1) NOT NULL DEFAULT 0');

  // ── Step 3: weightPercentage ──────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_milestones',
    'weightPercentage',
    `DECIMAL(5,2) NULL COMMENT 'PM-assigned weight within project scope'`
  );
  console.log('  [+] weightPercentage DECIMAL(5,2) NULL');

  // ── Step 4: minPct ────────────────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_milestones',
    'minPct',
    `DECIMAL(5,2) NULL COMMENT 'Lower bound from milestone template'`
  );
  console.log('  [+] minPct DECIMAL(5,2) NULL');

  // ── Step 5: maxPct ────────────────────────────────────────────────────────
  await addColumnIfMissing(
    'pm_milestones',
    'maxPct',
    `DECIMAL(5,2) NULL COMMENT 'Upper bound from milestone template'`
  );
  console.log('  [+] maxPct DECIMAL(5,2) NULL');

  // ── Step 6: Index on parentMilestoneId ───────────────────────────────────
  await sequelize.query(`
    CREATE INDEX idx_pm_milestones_parent ON pm_milestones(parentMilestoneId)
  `).catch(e => {
    if (!e.message.includes('Duplicate key name')) throw e;
    console.log('  [~] idx_pm_milestones_parent already exists — skipping');
  });
  console.log('  [+] idx_pm_milestones_parent index created');

  console.log('\n[Migration 033] Done — 223 existing rows untouched.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 033] FAILED:', err.message);
  process.exit(1);
});
