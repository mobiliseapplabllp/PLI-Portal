/**
 * Migration 012 — Add supplementary fields to hd_tickets
 * Run: node backend/src/migrations/012_add_ticket_fields.js
 * Target DB: pli_portal_uat
 *
 * Adds columns: request_type, mode, impact, urgency, site, raised_by_team
 * NOTE: requester_name / requester_email are already covered by widget_name /
 *       widget_email; this migration does NOT duplicate them.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  // ADD COLUMN statements are intentionally separate so MySQL 5.7 can report
  // the exact column that caused a failure (no IF NOT EXISTS — 5.7 compat).

  await sequelize.query(`
    ALTER TABLE hd_tickets
      ADD COLUMN request_type  VARCHAR(50)  NULL AFTER category,
      ADD COLUMN mode          VARCHAR(50)  NULL AFTER request_type,
      ADD COLUMN impact        VARCHAR(20)  NULL AFTER mode,
      ADD COLUMN urgency       VARCHAR(20)  NULL AFTER impact,
      ADD COLUMN site          VARCHAR(100) NULL AFTER urgency,
      ADD COLUMN raised_by_team VARCHAR(100) NULL AFTER site;
  `);
  console.log('✓ hd_tickets — added: request_type, mode, impact, urgency, site, raised_by_team');

  console.log('\n✅ Migration 012 complete —', process.env.MYSQL_DATABASE);
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Migration failed:', err.message); process.exit(1); });
