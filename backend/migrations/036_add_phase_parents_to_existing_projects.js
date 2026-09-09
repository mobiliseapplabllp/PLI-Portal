/**
 * Migration 036 — Add missing phase parent milestones to all existing projects
 *
 * ════════════════════════════════════════════════════════════════════
 * CONTEXT
 * ════════════════════════════════════════════════════════════════════
 * Migration 033b created ONE "Development" parent per project and
 * moved all old flat milestones under it as sub-milestones.
 *
 * This migration adds the 7 remaining phase parents from the Demo
 * template so every project shows the full 8-phase structure:
 *
 *   1. Requirement Gathering /Understanding  [Default] ← NEW (empty)
 *   2. Figma Design                          [Default] ← NEW (empty)
 *   3. Development                           [Default] ← EXISTING (keeps sub-milestones)
 *        ↳ old sub-milestone 1
 *        ↳ old sub-milestone 2
 *        ↳ ...
 *   4. Testing                               [Default] ← NEW (empty)
 *   5. Detect Fixes                          [Default] ← NEW (empty)
 *   6. Client Demo                           [Default] ← NEW (empty)
 *   7. Client Feedback                       [Default] ← NEW (empty)
 *   8. Client Sign-Off                       [Default] ← NEW (empty)
 *
 * Existing sub-milestones remain under Development untouched.
 * PMs can manually add sub-milestones to the new empty parents.
 *
 * ════════════════════════════════════════════════════════════════════
 * IDEMPOTENCY
 * ════════════════════════════════════════════════════════════════════
 * If a project already has MORE THAN 1 top-level milestone (parentMilestoneId IS NULL),
 * it is skipped — migration has already run for that project.
 *
 * ════════════════════════════════════════════════════════════════════
 * DEPENDENCIES
 * ════════════════════════════════════════════════════════════════════
 * Must run AFTER: 033b (which created the Development parent)
 *
 *   node backend/migrations/036_add_phase_parents_to_existing_projects.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

// The 7 NEW phase parents to add (Development already exists at order 3)
const NEW_PHASES = [
  { name: 'Requirement Gathering /Understanding', order: 1, minPct: 15.00, maxPct: 20.00 },
  { name: 'Figma Design',                         order: 2, minPct: 10.00, maxPct: 15.00 },
  // order 3 = Development (already exists — we update its order below)
  { name: 'Testing',                              order: 4, minPct:  5.00, maxPct: 10.00 },
  { name: 'Detect Fixes',                         order: 5, minPct:  5.00, maxPct: 10.00 },
  { name: 'Client Demo',                          order: 6, minPct:  5.00, maxPct: 10.00 },
  { name: 'Client Feedback',                      order: 7, minPct:  5.00, maxPct: 10.00 },
  { name: 'Client Sign-Off',                      order: 8, minPct:  5.00, maxPct: 10.00 },
];

async function run() {
  console.log('\n[Migration 036] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 036] Connected.\n');

  // Fetch all projects
  const [projects] = await sequelize.query(`SELECT id FROM pm_projects ORDER BY createdAt ASC`);
  console.log(`  [i] ${projects.length} project(s) to process\n`);

  let processed = 0;
  let skipped   = 0;

  for (const p of projects) {
    // ── Idempotency guard ─────────────────────────────────────────
    const [[{ parentCount }]] = await sequelize.query(
      `SELECT COUNT(*) AS parentCount
       FROM pm_milestones
       WHERE projectId = ? AND parentMilestoneId IS NULL`,
      { replacements: [p.id] }
    );

    if (Number(parentCount) > 1) {
      // Already has multiple parents → already processed
      skipped++;
      continue;
    }

    // ── Fix Development order to 3 ────────────────────────────────
    await sequelize.query(
      `UPDATE pm_milestones
       SET    \`order\` = 3
       WHERE  projectId         = ?
         AND  parentMilestoneId IS NULL
         AND  name              = 'Development'`,
      { replacements: [p.id] }
    );

    // ── Insert 7 new phase parents + 1 default sub-milestone each ──
    for (const phase of NEW_PHASES) {
      // Create parent
      const [[{ newId }]] = await sequelize.query(`SELECT UUID() AS newId`);
      await sequelize.query(
        `INSERT INTO pm_milestones
           (\`id\`, \`projectId\`, \`parentMilestoneId\`, \`name\`, \`isDefault\`,
            \`status\`, \`order\`, \`completionPercentage\`,
            \`weightPercentage\`, \`minPct\`, \`maxPct\`,
            \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, NULL, ?, 1,
                 'not_started', ?, 0,
                 NULL, ?, ?,
                 NOW(), NOW())`,
        { replacements: [newId, p.id, phase.name, phase.order, phase.minPct, phase.maxPct] }
      );

      // Create 1 default sub-milestone under this parent (same name)
      const [[{ subId }]] = await sequelize.query(`SELECT UUID() AS subId`);
      await sequelize.query(
        `INSERT INTO pm_milestones
           (\`id\`, \`projectId\`, \`parentMilestoneId\`, \`name\`, \`isDefault\`,
            \`status\`, \`order\`, \`completionPercentage\`,
            \`weightPercentage\`, \`minPct\`, \`maxPct\`,
            \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, 0,
                 'not_started', 1, 0,
                 NULL, NULL, NULL,
                 NOW(), NOW())`,
        { replacements: [subId, p.id, newId, phase.name] }
      );
    }

    console.log(`  [+] ${p.id} → Development set to order 3, added 7 phase parents`);
    processed++;
  }

  console.log(`\n  [✓] Migration 036 complete.`);
  console.log(`      ${processed} project(s) updated with 7 new phase parents.`);
  console.log(`      ${skipped}   project(s) skipped (already had multiple parents).`);
  console.log('\n[Migration 036] Done.\n');

  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 036] FAILED:', err.message);
  process.exit(1);
});
