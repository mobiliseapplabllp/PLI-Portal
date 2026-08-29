/**
 * Migration 031 — Change pm_milestones.status from ENUM to VARCHAR(100)
 *
 * The ENUM is too rigid for custom statuses configured in PM settings.
 * Switching to VARCHAR(100) allows arbitrary status values while preserving
 * the existing default ('not_started').
 *
 * Safe to re-run (MODIFY errors for a VARCHAR column that already exists
 * are caught and skipped).
 *   node backend/migrations/031_pm_milestone_status_string.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 031] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 031] Connected to:', process.env.MYSQL_DATABASE);

  // MySQL accepts MODIFY COLUMN on an already-VARCHAR column without error (idempotent by nature).
  await sequelize.query(
    `ALTER TABLE pm_milestones MODIFY COLUMN status VARCHAR(100) DEFAULT 'not_started'`
  );
  console.log('  ✅ pm_milestones.status ensured as VARCHAR(100)');

  console.log('\n[Migration 031] Done.\n');
  await sequelize.close();
}

run().catch(e => {
  console.error('[Migration 031] Failed:', e.message);
  process.exit(1);
});
