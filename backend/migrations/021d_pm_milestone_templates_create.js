/**
 * Migration 021d — Create pm_milestone_templates table
 *
 * Stores milestone templates per project type.
 * When a new project is created with a projectType, milestone.service.js
 * calls createDefaultMilestones(projectId, projectType) which does:
 *   PmMilestoneTemplate.findAll({ where: { projectType, isActive: true } })
 * and auto-creates the top-level milestones from matching templates.
 *
 * Seeds one template for the 'Demo' project type:
 *   - 'Development'  (0% – 100%, sortOrder 0)
 *
 * This means:
 *   1. New 'Demo' projects automatically get a 'Development' top-level milestone.
 *   2. Migration 033b uses this same name ('Development') when wrapping all 223
 *      existing production milestones under a new parent.
 *
 * Run ORDER: AFTER 021c, BEFORE 022.
 * Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
 *
 *   node backend/migrations/021d_pm_milestone_templates_create.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 021d] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 021d] Connected.\n');

  // ── Step 1: Create pm_milestone_templates table ───────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`pm_milestone_templates\` (
      \`id\`          INT           NOT NULL AUTO_INCREMENT,
      \`projectType\` VARCHAR(100)  NOT NULL COMMENT 'Matches pm_project_types.name',
      \`name\`        VARCHAR(255)  NOT NULL,
      \`minPct\`      DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
      \`maxPct\`      DECIMAL(5,2)  NOT NULL DEFAULT 100.00,
      \`sortOrder\`   INT           NOT NULL DEFAULT 0,
      \`isActive\`    TINYINT(1)    NOT NULL DEFAULT 1,
      \`createdAt\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`idx_pm_milestone_templates_type\` (\`projectType\`),
      KEY \`idx_pm_milestone_templates_active\` (\`isActive\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  [+] pm_milestone_templates table created (or already existed)');

  // ── Step 2: Seed 'Demo' project type template ─────────────────────────────
  // One top-level milestone: 'Development' (covers 0–100% of project scope).
  // More templates (Testing, Deployment, etc.) can be added from PM Settings UI.
  await sequelize.query(`
    INSERT IGNORE INTO \`pm_milestone_templates\`
      (\`projectType\`, \`name\`, \`minPct\`, \`maxPct\`, \`sortOrder\`, \`isActive\`)
    VALUES
      ('Demo', 'Development', 0.00, 100.00, 0, 1)
  `);
  console.log("  [+] Template seeded: Demo / 'Development' (0%–100%, sortOrder 0)");

  console.log('\n[Migration 021d] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 021d] FAILED:', err.message);
  process.exit(1);
});
