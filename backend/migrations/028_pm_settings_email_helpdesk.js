/**
 * Migration 028 — pm_settings_email_helpdesk
 *
 * Adds email alert toggle flags and helpdesk scheduler settings to the pm_settings table.
 *
 * UAT only — run once:
 *   node backend/migrations/028_pm_settings_email_helpdesk.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 028] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 028] Connected.\n');

  await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN emailAlertOnProjectCreate TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Send email alert when a new project is created'`)
    .catch(e => { if (!e.message.includes('Duplicate column name')) throw e; });
  console.log('  [+] emailAlertOnProjectCreate');

  await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN emailAlertOnMilestoneComplete TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Send email alert when a milestone is completed'`)
    .catch(e => { if (!e.message.includes('Duplicate column name')) throw e; });
  console.log('  [+] emailAlertOnMilestoneComplete');

  await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN emailAlertOnRaidRaised TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Send email alert when a RAID item is raised'`)
    .catch(e => { if (!e.message.includes('Duplicate column name')) throw e; });
  console.log('  [+] emailAlertOnRaidRaised');

  await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN helpdeskDailyReportEnabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Enable helpdesk daily report scheduler'`)
    .catch(e => { if (!e.message.includes('Duplicate column name')) throw e; });
  console.log('  [+] helpdeskDailyReportEnabled');

  await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN helpdeskDailyReportTime VARCHAR(8) NOT NULL DEFAULT '09:00' COMMENT 'Time to send helpdesk daily report (HH:MM format)'`)
    .catch(e => { if (!e.message.includes('Duplicate column name')) throw e; });
  console.log('  [+] helpdeskDailyReportTime');

  console.log('\n[Migration 028] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 028] FAILED:', err);
  process.exit(1);
});
