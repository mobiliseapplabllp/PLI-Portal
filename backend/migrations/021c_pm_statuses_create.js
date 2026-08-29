/**
 * Migration 021c — Create pm_statuses table
 *
 * Replaces the hard-coded ENUM constraints on pm_projects.status and
 * pm_milestones.status with a managed, user-configurable status table.
 *
 * Seeded statuses are derived EXACTLY from live production data:
 *
 *   PROJECTS (49 rows):  active(28), planning(8), completed(7), cancelled(3), on_hold(3)
 *   MILESTONES (223 rows): completed(94), in_progress(62), not_started(56), delayed(8), on_hold(3)
 *
 * Additionally seeds 'Yet to Start' — the new Project model defaultValue —
 * so new project creation works immediately after migration 032.
 *
 * Scope flags:
 *   forProject      — valid choice in the project status dropdown
 *   forMilestone    — valid choice in the parent milestone status dropdown
 *   forSubMilestone — valid choice in sub-milestone status dropdown
 *
 * All system-seeded statuses have isSystem=1 so they cannot be deleted
 * from the PM Settings > Statuses UI.
 *
 * Run ORDER: AFTER 021b, BEFORE 022.
 * Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE.
 *
 *   node backend/migrations/021c_pm_statuses_create.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

// Seed data — exactly the statuses found in live production data + 'Yet to Start'.
// Columns: name, color, isSystem, sortOrder, forProject, forMilestone, forSubMilestone
const STATUSES = [
  // ── New status for new projects (model defaultValue) ─────────────────────
  ['Yet to Start', '#94A3B8', 1,  0,  1, 0, 0],

  // ── Live project statuses ─────────────────────────────────────────────────
  ['planning',     '#8B5CF6', 1,  1,  1, 0, 0],  // 8 live projects
  ['active',       '#3B82F6', 1,  2,  1, 0, 0],  // 28 live projects
  ['on_hold',      '#F59E0B', 1,  3,  1, 1, 1],  // 3 projects + 3 milestones
  ['completed',    '#10B981', 1,  4,  1, 1, 1],  // 7 projects + 94 milestones
  ['cancelled',    '#EF4444', 1,  5,  1, 1, 0],  // 3 live projects

  // ── Live milestone-only statuses ──────────────────────────────────────────
  ['not_started',  '#6B7280', 1,  6,  0, 1, 1],  // 56 live milestones
  ['in_progress',  '#60A5FA', 1,  7,  0, 1, 1],  // 62 live milestones
  ['delayed',      '#F97316', 1,  8,  0, 1, 1],  // 8 live milestones
];

async function run() {
  console.log('\n[Migration 021c] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 021c] Connected.\n');

  // ── Step 1: Create pm_statuses table ─────────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`pm_statuses\` (
      \`id\`             INT          NOT NULL AUTO_INCREMENT,
      \`name\`           VARCHAR(100) NOT NULL,
      \`color\`          VARCHAR(20)  DEFAULT '#6B7280',
      \`isActive\`       TINYINT(1)   DEFAULT 1,
      \`isSystem\`       TINYINT(1)   DEFAULT 0 COMMENT 'System statuses cannot be deleted',
      \`sortOrder\`      INT          DEFAULT 0,
      \`forProject\`     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Available as project status',
      \`forMilestone\`   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'Available as milestone status',
      \`forSubMilestone\` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT 'Available as sub-milestone status',
      \`createdAt\`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_pm_statuses_name\` (\`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('  [+] pm_statuses table created (or already existed)');

  // ── Step 2: Seed production statuses ─────────────────────────────────────
  for (const [name, color, isSystem, sortOrder, forProject, forMilestone, forSubMilestone] of STATUSES) {
    await sequelize.query(
      `INSERT IGNORE INTO \`pm_statuses\`
         (\`name\`, \`color\`, \`isSystem\`, \`sortOrder\`,
          \`forProject\`, \`forMilestone\`, \`forSubMilestone\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      { replacements: [name, color, isSystem, sortOrder, forProject, forMilestone, forSubMilestone] }
    );
    console.log(`  [+] Status seeded: '${name}'  (project=${forProject} milestone=${forMilestone} sub=${forSubMilestone})`);
  }

  console.log('\n[Migration 021c] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 021c] FAILED:', err.message);
  process.exit(1);
});
