/**
 * Migration 033b — DATA MIGRATION: Wrap existing production milestones
 *                  under a 'Development' parent milestone per project
 *
 * ════════════════════════════════════════════════════════════════════
 * WHY THIS MIGRATION EXISTS
 * ════════════════════════════════════════════════════════════════════
 * Production has 223 milestones added directly to 49 projects (flat structure):
 *
 *   BEFORE:
 *     Project A
 *       ├── Milestone: "Requirement Gathering"   (parentMilestoneId = NULL)
 *       ├── Milestone: "Design"                  (parentMilestoneId = NULL)
 *       └── Milestone: "Testing"                 (parentMilestoneId = NULL)
 *
 * The new architecture (getMilestones in milestone.service.js) expects a
 * two-level hierarchy — top-level (isDefault=true) parents with sub-milestones:
 *
 *   AFTER:
 *     Project A
 *       └── Development  (parentMilestoneId=NULL, isDefault=true)   ← NEW
 *             ├── Sub: "Requirement Gathering"   (parentMilestoneId=Development.id)
 *             ├── Sub: "Design"                  (parentMilestoneId=Development.id)
 *             └── Sub: "Testing"                 (parentMilestoneId=Development.id)
 *
 * The 'Development' parent name matches:
 *   - The pm_milestone_templates seed (021d) for project type 'Demo'
 *   - The fallback in createDefaultMilestones() for unknown project types
 *
 * ════════════════════════════════════════════════════════════════════
 * WHAT THIS MIGRATION DOES
 * ════════════════════════════════════════════════════════════════════
 * For each project that HAS milestones (41 of 49):
 *   1. Compute aggregate dates and completion from existing children.
 *   2. INSERT one new 'Development' parent milestone (UUID from MySQL).
 *   3. UPDATE all existing milestones for that project:
 *        SET parentMilestoneId = <new Development id>
 *
 * For each project with NO milestones (up to 8 of 49):
 *   1. INSERT one empty 'Development' shell milestone so the UI
 *      is not broken when the project is opened.
 *
 * PARENT STATUS LOGIC:
 *   avgCompletion = 100  → 'completed'
 *   avgCompletion = 0    → 'not_started'
 *   otherwise            → 'in_progress'
 *
 * ════════════════════════════════════════════════════════════════════
 * IDEMPOTENCY
 * ════════════════════════════════════════════════════════════════════
 * If ANY milestone in pm_milestones already has parentMilestoneId set,
 * the migration assumes it has already run and exits immediately.
 * This prevents double-wrapping on a retry.
 *
 * ════════════════════════════════════════════════════════════════════
 * DEPENDENCIES
 * ════════════════════════════════════════════════════════════════════
 * MUST run AFTER:
 *   024  — renames startDate → plannedStartDate (columns used below)
 *   033  — adds parentMilestoneId, isDefault, weightPercentage, minPct, maxPct
 *
 * Run ORDER: 033b (this file) runs immediately after 033.
 *
 *   node backend/migrations/033b_pm_milestone_wrap_development.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 033b] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 033b] Connected.\n');

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const [[{ alreadyWrapped }]] = await sequelize.query(
    `SELECT COUNT(*) AS alreadyWrapped
     FROM pm_milestones
     WHERE parentMilestoneId IS NOT NULL`
  );
  if (Number(alreadyWrapped) > 0) {
    console.log(`  [~] ${alreadyWrapped} milestone(s) already have parentMilestoneId set.`);
    console.log('  [~] Migration 033b has already run — skipping to avoid double-wrap.\n');
    await sequelize.close();
    return;
  }

  // ── PART A: Projects that already have milestones ─────────────────────────
  const [projectsWithMilestones] = await sequelize.query(`
    SELECT
      m.projectId,
      MIN(m.plannedStartDate)                             AS minStart,
      MAX(m.plannedEndDate)                               AS maxEnd,
      ROUND(AVG(m.completionPercentage))                  AS avgPct,
      CASE
        WHEN MIN(m.completionPercentage) = 100
         AND MAX(m.completionPercentage) = 100 THEN 'completed'
        WHEN MAX(m.completionPercentage) = 0   THEN 'not_started'
        ELSE 'in_progress'
      END                                                  AS parentStatus
    FROM pm_milestones m
    GROUP BY m.projectId
  `);

  console.log(`  [i] ${projectsWithMilestones.length} project(s) have existing milestones to wrap.`);

  for (const p of projectsWithMilestones) {
    // Generate UUID via MySQL — no external uuid package dependency
    const [[{ newId }]] = await sequelize.query(`SELECT UUID() AS newId`);

    // Insert the 'Development' parent milestone
    await sequelize.query(
      `INSERT INTO \`pm_milestones\`
         (\`id\`, \`projectId\`, \`parentMilestoneId\`, \`name\`, \`isDefault\`,
          \`plannedStartDate\`, \`plannedEndDate\`,
          \`status\`, \`order\`, \`completionPercentage\`,
          \`weightPercentage\`, \`minPct\`, \`maxPct\`,
          \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, NULL, 'Development', 1,
               ?, ?,
               ?, 0, ?,
               NULL, 0.00, 100.00,
               NOW(), NOW())`,
      {
        replacements: [
          newId,
          p.projectId,
          p.minStart || null,
          p.maxEnd   || null,
          p.parentStatus,
          Number(p.avgPct) || 0,
        ],
      }
    );

    // Update ALL existing milestones for this project to be children of Development.
    // The newly inserted parent (id = newId) is excluded by the WHERE id != newId guard.
    // Pattern: const [, meta] — Sequelize/mysql2 returns [results, OkPacket] for DML.
    const [, updateMeta] = await sequelize.query(
      `UPDATE \`pm_milestones\`
       SET    \`parentMilestoneId\` = ?,
              \`isDefault\`         = 0
       WHERE  \`projectId\`         = ?
         AND  \`id\`                != ?`,
      { replacements: [newId, p.projectId, newId] }
    );
    const affectedRows = updateMeta?.affectedRows ?? 0;

    console.log(
      `  [+] ${p.projectId}` +
      ` → 'Development' parent ${newId}` +
      ` (status=${p.parentStatus}, wrapped ${affectedRows} milestone(s))`
    );
  }

  // ── PART B: Projects with NO milestones → empty Development shell ─────────
  const [emptyProjects] = await sequelize.query(`
    SELECT p.id, p.startDate, p.endDate
    FROM   \`pm_projects\`  p
    WHERE  p.id NOT IN (
             SELECT DISTINCT projectId FROM \`pm_milestones\`
           )
  `);

  console.log(`\n  [i] ${emptyProjects.length} project(s) have NO milestones — creating empty shells.`);

  for (const p of emptyProjects) {
    const [[{ newId }]] = await sequelize.query(`SELECT UUID() AS newId`);

    await sequelize.query(
      `INSERT INTO \`pm_milestones\`
         (\`id\`, \`projectId\`, \`parentMilestoneId\`, \`name\`, \`isDefault\`,
          \`plannedStartDate\`, \`plannedEndDate\`,
          \`status\`, \`order\`, \`completionPercentage\`,
          \`weightPercentage\`, \`minPct\`, \`maxPct\`,
          \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, NULL, 'Development', 1,
               ?, ?,
               'not_started', 0, 0,
               NULL, 0.00, 100.00,
               NOW(), NOW())`,
      { replacements: [newId, p.id, p.startDate || null, p.endDate || null] }
    );
    console.log(`  [+] ${p.id} → empty 'Development' shell ${newId}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const [[{ total }]] = await sequelize.query(
    `SELECT COUNT(*) AS total FROM pm_milestones WHERE parentMilestoneId IS NOT NULL`
  );
  console.log(`\n  [✓] Wrap complete.`);
  console.log(`      ${projectsWithMilestones.length + emptyProjects.length} Development parent(s) created.`);
  console.log(`      ${total} existing milestone(s) now have parentMilestoneId set.`);

  console.log('\n[Migration 033b] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 033b] FAILED:', err.message);
  process.exit(1);
});
