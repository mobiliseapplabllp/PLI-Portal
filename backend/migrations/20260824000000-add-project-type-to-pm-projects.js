/**
 * Migration 20260824 — Add projectType column to pm_projects
 *
 * Adds projectType ENUM('Billable','Non-Billable') column to pm_projects table.
 * Safe to re-run — skips the column if it already exists.
 *
 * RUN ONCE before deploying the backend code that references projectType:
 *   node backend/migrations/20260824000000-add-project-type-to-pm-projects.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function addColumnIfMissing(table, column, definition) {
  try {
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  [+] ${table}.${column}`);
  } catch (err) {
    if (err.message.includes('Duplicate column name')) {
      console.log(`  [=] ${table}.${column} — already exists, skipped`);
    } else {
      throw err;
    }
  }
}

async function run() {
  console.log('\n[Migration 20260824] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 20260824] Connected.\n');

  console.log('--- pm_projects ---');
  await addColumnIfMissing(
    'pm_projects',
    'projectType',
    "ENUM('Billable', 'Non-Billable') NOT NULL DEFAULT 'Non-Billable' AFTER `status`"
  );

  console.log('\n[Migration 20260824] Completed successfully.\n');
  await sequelize.close();
}

run().catch((err) => {
  console.error('\n[Migration 20260824] FAILED:', err.message);
  process.exit(1);
});
