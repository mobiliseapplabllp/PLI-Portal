/**
 * Migration 030 — Add actualStartDate + actualEndDate to pm_projects
 *
 * plannedStartDate / plannedEndDate continue to live in the existing
 * startDate / endDate columns (labels only change in the UI).
 * Actual dates are new columns filled post-creation.
 *
 * Safe to re-run (duplicate-column errors are caught).
 *   node backend/migrations/030_pm_project_actual_dates.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 030] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 030] Connected to:', process.env.MYSQL_DATABASE);

  const q = (sql) => sequelize.query(sql);

  const addCol = async (col, def) => {
    try {
      await q(`ALTER TABLE pm_projects ADD COLUMN ${col} ${def}`);
      console.log(`  ✅ Added column: ${col}`);
    } catch (e) {
      if (e.message.includes('Duplicate column')) {
        console.log(`  ⏭  Skip ${col} — already exists`);
      } else {
        throw e;
      }
    }
  };

  await addCol('actualStartDate', 'DATE NULL AFTER endDate');
  await addCol('actualEndDate',   'DATE NULL AFTER actualStartDate');

  console.log('\n[Migration 030] Done.\n');
  await sequelize.close();
}

run().catch(e => {
  console.error('[Migration 030] Failed:', e.message);
  process.exit(1);
});
