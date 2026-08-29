/**
 * Migration 021b — Create pm_project_types table
 *
 * New master table for project types (Demo, Fixed Price, T&M, etc.).
 * Seeds the built-in 'Demo' type — used as the default for ALL 47 existing
 * production projects (migration 034 sets pm_projects.projectType = 'Demo').
 *
 * Run ORDER: BEFORE 021c, 021d, and 022.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
 *
 *   node backend/migrations/021b_pm_project_types_create.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 021b] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 021b] Connected.\n');

  // ── Step 1: Create pm_project_types table ─────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`pm_project_types\` (
      \`id\`        INT           NOT NULL AUTO_INCREMENT,
      \`name\`      VARCHAR(100)  NOT NULL,
      \`isActive\`  TINYINT(1)    NOT NULL DEFAULT 1,
      \`sortOrder\` INT           NOT NULL DEFAULT 0,
      \`createdAt\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_pm_project_types_name\` (\`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  [+] pm_project_types table created (or already existed)');

  // ── Step 2: Seed 'Demo' default project type ──────────────────────────────
  // INSERT IGNORE is idempotent — safe to re-run.
  await sequelize.query(`
    INSERT IGNORE INTO \`pm_project_types\` (\`name\`, \`isActive\`, \`sortOrder\`)
    VALUES ('Demo', 1, 0)
  `);
  console.log("  [+] 'Demo' project type seeded (INSERT IGNORE)");

  console.log('\n[Migration 021b] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 021b] FAILED:', err.message);
  process.exit(1);
});
