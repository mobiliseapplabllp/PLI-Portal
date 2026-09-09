/**
 * Migration 036b — Make pm_projects.projectType nullable
 *
 * Migration 034 set projectType as NOT NULL DEFAULT 'Demo'.
 * The app sends NULL when no project type is selected → INSERT fails.
 * This makes the column nullable so project creation works correctly.
 *
 *   node backend/migrations/036b_fix_project_type_nullable.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 036b] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 036b] Connected.\n');

  // Check current column definition
  const [[col]] = await sequelize.query(`
    SELECT IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'pm_projects'
      AND COLUMN_NAME  = 'projectType'
  `);

  if (col && col.IS_NULLABLE === 'YES') {
    console.log('  [~] pm_projects.projectType is already nullable — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_projects
      MODIFY COLUMN projectType VARCHAR(100) NULL DEFAULT 'Demo'
    `);
    console.log("  [+] pm_projects.projectType → VARCHAR(100) NULL DEFAULT 'Demo'");
  }

  console.log('\n[Migration 036b] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 036b] FAILED:', err.message);
  process.exit(1);
});
