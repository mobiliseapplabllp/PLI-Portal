/**
 * Migration 049 — Sub-milestone weights auto-split + parent progress roll-up
 *
 * From now on (services/pm/milestone.service.js):
 *   - sub-milestone weight = an EQUAL split of its parent's 100%
 *     (5 subs → 20.00 each; 3 subs → 33.33 / 33.33 / 33.34)
 *   - a parent with sub-milestones takes its progress from them:
 *       parent % = round(Σ sub progress × sub share ÷ 100)
 *
 * This one-off pass brings EXISTING projects in line. No column is added or
 * dropped; it only rewrites pm_milestones.weightPercentage on sub rows and
 * pm_milestones.completionPercentage on parents that have subs. Parents with no
 * subs, top-level weights and every status are left untouched.
 *
 * Idempotent: a second run changes 0 rows. Prints every parent whose progress
 * changed (project, milestone, before → after) so the result can be reviewed.
 *
 *   node backend/migrations/049_milestone_weight_rollup.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');
const { equalSplit, rolledUpProgress } = require('../src/services/pm/milestone.service');

/** @param {{ projectId?: string }} [opts] projectId scopes the pass to one project (tests). */
async function run({ projectId = null } = {}) {
  console.log(`[Migration 049] Sub-milestone weight split + parent progress roll-up${projectId ? ` (project ${projectId} only)` : ''}`);

  const [subs] = await sequelize.query(
    `SELECT s.id, s.parentMilestoneId, s.weightPercentage, s.completionPercentage
       FROM pm_milestones s
       JOIN pm_milestones p ON p.id = s.parentMilestoneId
      ${projectId ? 'WHERE s.projectId = :projectId' : ''}
      ORDER BY s.parentMilestoneId, s.\`order\`, s.createdAt`,
    { replacements: { projectId } }
  );
  const byParent = new Map();
  for (const s of subs) {
    if (!byParent.has(s.parentMilestoneId)) byParent.set(s.parentMilestoneId, []);
    byParent.get(s.parentMilestoneId).push(s);
  }

  const [parents] = byParent.size
    ? await sequelize.query(
        `SELECT m.id, m.name, m.completionPercentage, pr.name AS projectName
           FROM pm_milestones m JOIN pm_projects pr ON pr.id = m.projectId
          WHERE m.id IN (:ids)`,
        { replacements: { ids: [...byParent.keys()] } }
      )
    : [[]];
  const parentById = new Map(parents.map((p) => [p.id, p]));

  let weightsChanged = 0;
  const progressChanges = [];

  const t = await sequelize.transaction();
  try {
    for (const [parentId, group] of byParent) {
      const weights = equalSplit(group.length);
      group.forEach((s, i) => { s.newWeight = weights[i]; });

      for (const s of group) {
        if (s.weightPercentage === null || Number(s.weightPercentage) !== s.newWeight) {
          await sequelize.query(
            'UPDATE pm_milestones SET weightPercentage = ? WHERE id = ?',
            { replacements: [s.newWeight, s.id], transaction: t }
          );
          weightsChanged++;
        }
      }

      const pct = rolledUpProgress(group.map((s) => ({
        completionPercentage: s.completionPercentage, weightPercentage: s.newWeight,
      })));
      const parent = parentById.get(parentId);
      if (parent && Number(parent.completionPercentage) !== pct) {
        await sequelize.query(
          'UPDATE pm_milestones SET completionPercentage = ? WHERE id = ?',
          { replacements: [pct, parentId], transaction: t }
        );
        progressChanges.push({
          project: parent.projectName, milestone: parent.name,
          from: Number(parent.completionPercentage) || 0, to: pct,
        });
      }
    }
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  console.log(`  [i] ${byParent.size} milestone(s) with sub-milestones, ${subs.length} sub-milestone(s)`);
  console.log(`  [=] sub weights rewritten: ${weightsChanged}`);
  console.log(`  [=] parent progress recalculated: ${progressChanges.length}`);
  progressChanges
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .forEach((c) => console.log(`      ${c.project} › ${c.milestone}: ${c.from}% → ${c.to}%`));
  console.log('[Migration 049] done.');
  return { parents: byParent.size, subs: subs.length, weightsChanged, progressChanged: progressChanges.length };
}

module.exports = { run };

if (require.main === module) {
  run()
    .then(() => sequelize.close())
    .catch((err) => { console.error('[Migration 049] FAILED:', err); process.exit(1); });
}
