/**
 * Migration 029 — pm_status_sub_milestone_scope
 *
 * Sets forSubMilestone = 1 for statuses that are valid at the sub-milestone
 * level. Also corrects scope flags for project-only statuses that must NOT
 * appear in milestone/sub-milestone dropdowns.
 *
 * This migration is safe whether 021c ran before 022 (scope flags already
 * correct) or not (022 reset everything to forSubMilestone=0 for legacy tables).
 * All UPDATEs are idempotent.
 *
 * SCOPE MATRIX (final desired state):
 *   Status          forProject  forMilestone  forSubMilestone
 *   ─────────────── ─────────── ───────────── ───────────────
 *   Yet to Start        1            0              0
 *   planning            1            0              0
 *   active              1            0              0
 *   on_hold             1            1              1
 *   completed           1            1              1
 *   cancelled           1            1              0
 *   not_started         0            1              1
 *   in_progress         0            1              1
 *   delayed             0            1              1
 *
 * UAT only — safe to re-run (idempotent UPDATE statements):
 *   node backend/migrations/029_pm_status_sub_milestone_scope.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 029] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 029] Connected.\n');

  // ── Step 1: Project-only statuses — must NOT appear in milestone dropdowns ─
  // 'planning', 'active', 'Yet to Start' are exclusively project-level.
  const [, metaA] = await sequelize.query(`
    UPDATE pm_statuses
       SET forMilestone = 0, forSubMilestone = 0
     WHERE name IN ('planning', 'active', 'Yet to Start')
  `);
  console.log(`  [+] Project-only flags set for ${metaA?.affectedRows ?? 0} status row(s) (planning, active, Yet to Start)`);

  // ── Step 2: forSubMilestone = 1 for statuses valid at sub-milestone level ──
  // Uses exact stored names (underscore format) — not space-separated.
  // 'cancelled' is intentionally excluded (sub-milestones are not cancelled
  //  independently; the parent milestone handles that).
  const [, metaB] = await sequelize.query(`
    UPDATE pm_statuses
       SET forSubMilestone = 1
     WHERE name IN ('not_started', 'in_progress', 'completed', 'on_hold', 'delayed')
  `);
  console.log(`  [+] forSubMilestone = 1 set for ${metaB?.affectedRows ?? 0} status row(s)`);

  // ── Step 3: forMilestone = 1 for statuses valid at parent-milestone level ──
  // Milestone-level statuses: not_started, in_progress, completed, on_hold,
  // delayed, cancelled. Project-only ones (planning, active, Yet to Start) stay 0.
  const [, metaC] = await sequelize.query(`
    UPDATE pm_statuses
       SET forMilestone = 1
     WHERE name IN ('not_started', 'in_progress', 'completed', 'on_hold', 'delayed', 'cancelled')
  `);
  console.log(`  [+] forMilestone = 1 set for ${metaC?.affectedRows ?? 0} status row(s)`);

  console.log('\n[Migration 029] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 029] FAILED:', err);
  process.exit(1);
});
