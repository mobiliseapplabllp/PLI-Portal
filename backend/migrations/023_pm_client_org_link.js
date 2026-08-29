/**
 * Migration 023 — pm_client_org_link
 *
 * Adds a clientOrgId column to pm_projects so each project can be linked
 * to a client organisation (client_organisations table, CSAT module).
 *
 * No FK constraint is added — client_organisations uses a UUID primary key
 * (CHAR(36)) and referential integrity is enforced at the application level.
 *
 * Changes:
 *   pm_projects.clientOrgId  CHAR(36) NULL  (after managerId)
 *   INDEX idx_pm_projects_clientOrg ON pm_projects(clientOrgId)
 *
 * UAT only — safe to re-run (duplicate column/key errors are caught):
 *   node backend/migrations/023_pm_client_org_link.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 023] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 023] Connected.\n');

  // --- clientOrgId column ---
  await sequelize.query(`
    ALTER TABLE pm_projects
      ADD COLUMN clientOrgId CHAR(36) NULL
        COMMENT 'FK to client_organisations (application-level integrity)'
        AFTER managerId
  `).catch(err => {
    if (err.message.includes('Duplicate column name')) {
      console.log('  [~] clientOrgId column already exists — skipping');
    } else {
      throw err;
    }
  });
  console.log('  [+] clientOrgId column ensured on pm_projects');

  // --- Index for clientOrgId lookups ---
  await sequelize.query(`
    CREATE INDEX idx_pm_projects_clientOrg ON pm_projects(clientOrgId)
  `).catch(err => {
    if (err.message.includes('Duplicate key name')) {
      console.log('  [~] idx_pm_projects_clientOrg index already exists — skipping');
    } else {
      throw err;
    }
  });
  console.log('  [+] idx_pm_projects_clientOrg index ensured');

  console.log('\n[Migration 023] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 023] FAILED:', err);
  process.exit(1);
});
