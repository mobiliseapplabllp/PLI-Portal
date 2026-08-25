/**
 * Migration 017 — Backward compatibility: wrap existing milestones under "Development"
 *
 * For every existing project that has at least 1 milestone:
 *   1. INSERT a new "Development" default milestone (isDefault=1, weightPercentage=100)
 *   2. UPDATE all existing milestones for that project:
 *        SET parentMilestoneId = new Development milestone's id
 *
 * Projects with zero milestones are untouched.
 * Already-migrated projects (milestones with parentMilestoneId set) are skipped.
 *
 * UAT only — run once (run AFTER 016):
 *   node backend/migrations/017_pm_backward_compat_milestones.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
const { randomUUID } = require('crypto');

async function run() {
  console.log('\n[Migration 017] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 017] Connected.\n');

  // Get all projects that have at least one milestone
  const [projects] = await sequelize.query(`
    SELECT DISTINCT p.id, p.name
    FROM pm_projects p
    INNER JOIN pm_milestones m ON m.projectId = p.id
    WHERE m.parentMilestoneId IS NULL
      AND m.isDefault = 0
    ORDER BY p.name
  `);

  console.log(`  Found ${projects.length} project(s) with existing top-level milestones to wrap.\n`);

  let migrated = 0;
  let skipped  = 0;

  for (const project of projects) {
    // Double-check: does this project already have a default (isDefault=1) milestone?
    const [existing] = await sequelize.query(`
      SELECT id FROM pm_milestones
      WHERE projectId = '${project.id}' AND isDefault = 1
      LIMIT 1
    `);

    if (existing.length > 0) {
      console.log(`  [~] Project "${project.name}" already has a default milestone — skipping`);
      skipped++;
      continue;
    }

    // Get sort order: place Development before all existing milestones
    const devId = randomUUID();
    const now   = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Insert the "Development" parent milestone
    await sequelize.query(`
      INSERT INTO pm_milestones
        (id, projectId, parentMilestoneId, isDefault, name, description,
         weightPercentage, minPct, maxPct, status, \`order\`, completionPercentage,
         createdAt, updatedAt)
      VALUES
        ('${devId}', '${project.id}', NULL, 1, 'Development',
         'Legacy milestones migrated from previous structure',
         100.00, 100.00, 100.00,
         'not_started', 0, 0,
         '${now}', '${now}')
    `);

    // Update all existing top-level milestones for this project → set parent
    const [updateResult] = await sequelize.query(`
      UPDATE pm_milestones
      SET parentMilestoneId = '${devId}'
      WHERE projectId = '${project.id}'
        AND id != '${devId}'
        AND parentMilestoneId IS NULL
    `);

    const count = updateResult.affectedRows || 0;
    console.log(`  [+] Project "${project.name}" → wrapped ${count} milestone(s) under "Development" (${devId})`);
    migrated++;
  }

  console.log(`\n  Summary: ${migrated} project(s) migrated, ${skipped} skipped.`);
  console.log('\n[Migration 017] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 017] FAILED:', err);
  process.exit(1);
});
