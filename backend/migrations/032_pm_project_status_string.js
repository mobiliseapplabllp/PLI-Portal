/**
 * Migration 032 — Convert pm_projects.status from ENUM to VARCHAR(100)
 *
 * PROBLEM: Production pm_projects has:
 *   `status` ENUM('planning','active','on_hold','completed','cancelled') DEFAULT 'planning'
 *
 * The new Project.js model uses:
 *   status: DataTypes.STRING(100), defaultValue: 'Yet to Start'
 *
 * 'Yet to Start' is NOT a member of the ENUM, so any new project INSERT
 * raises: ERROR 1265 Data truncated for column 'status'.
 *
 * WHAT THIS MIGRATION DOES:
 *   MODIFY COLUMN status VARCHAR(100) DEFAULT 'Yet to Start'
 *
 * DATA SAFETY:
 *   MySQL converts ENUM → VARCHAR verbatim. All 49 existing project status
 *   values ('active', 'planning', 'on_hold', 'completed', 'cancelled') are
 *   preserved exactly as strings. Zero data loss.
 *
 *   Status values are now validated against pm_statuses (seeded in 021c)
 *   rather than the hard-coded ENUM.
 *
 * Run ORDER: AFTER 031 (milestone status varchar).
 *
 *   node backend/migrations/032_pm_project_status_string.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 032] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 032] Connected.\n');

  // Check current column type
  const [[col]] = await sequelize.query(`
    SELECT COLUMN_TYPE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'pm_projects'
      AND COLUMN_NAME  = 'status'
  `);

  if (col && col.COLUMN_TYPE.toLowerCase().startsWith('varchar')) {
    console.log(`  [~] pm_projects.status is already VARCHAR (${col.COLUMN_TYPE}) — skipping MODIFY`);
  } else {
    console.log(`  [i] Current type: ${col ? col.COLUMN_TYPE : 'unknown'} → converting to VARCHAR(100)`);
    await sequelize.query(`
      ALTER TABLE \`pm_projects\`
      MODIFY COLUMN \`status\` VARCHAR(100) DEFAULT 'Yet to Start'
    `);
    console.log("  [+] pm_projects.status → VARCHAR(100) DEFAULT 'Yet to Start'");
    console.log('  [i] All 49 existing project status strings preserved (no data loss)');
  }

  console.log('\n[Migration 032] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 032] FAILED:', err.message);
  process.exit(1);
});
