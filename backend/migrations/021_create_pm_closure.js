/**
 * Migration 021 — Create pm_closure table
 *
 * Stores project closure information and sign-off checklist (one row per project).
 * checklist stored as JSON: array of { label: string, checked: boolean }
 *
 * UAT only — run once:
 *   node backend/migrations/021_create_pm_closure.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

// Default checklist items for all projects
const DEFAULT_CHECKLIST = JSON.stringify([
  { label: 'Client deliverables handed over', checked: false },
  { label: 'Client sign-off received',        checked: false },
  { label: 'Knowledge transfer completed',    checked: false },
  { label: 'Final invoice raised',            checked: false },
  { label: 'Project documentation archived',  checked: false },
  { label: 'Team released from project',      checked: false },
]);

async function run() {
  console.log('\n[Migration 021] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 021] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_closure (
      id              CHAR(36)     NOT NULL PRIMARY KEY,
      projectId       CHAR(36)     NOT NULL UNIQUE,
      closureDate     DATE         NULL,
      closureNotes    TEXT         NULL COMMENT 'Summary of project closure',
      signedOffById   CHAR(36)     NULL COMMENT 'User who signed off',
      signedOffAt     DATETIME     NULL,
      checklist       JSON         NULL COMMENT 'Array of { label, checked }',
      closedAt        DATETIME     NULL COMMENT 'When project was marked closed',
      createdById     CHAR(36)     NULL,
      createdAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_closure_project (projectId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_closure table created (or already exists)');
  console.log(`  [i] Default checklist has ${JSON.parse(DEFAULT_CHECKLIST).length} items`);

  console.log('\n[Migration 021] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 021] FAILED:', err);
  process.exit(1);
});
