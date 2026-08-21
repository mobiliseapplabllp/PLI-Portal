/**
 * Migration 013 — Add resolution field to hd_tickets
 * Run: node backend/src/migrations/013_add_ticket_resolution.js
 * Target DB: pli_portal_uat
 *
 * Adds: resolution TEXT NULL — stores the resolved outcome text for closed tickets.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  await sequelize.query(`
    ALTER TABLE hd_tickets
      ADD COLUMN resolution TEXT NULL AFTER urgency;
  `);
  console.log('✓ hd_tickets — added: resolution');

  console.log('\n✅ Migration 013 complete —', process.env.MYSQL_DATABASE);
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Migration failed:', err.message); process.exit(1); });
