/**
 * Migration 014 — Add hd_group_id to users table
 * Adds a nullable FK column linking PLI users to helpdesk groups.
 * Run: node backend/src/migrations/014_add_hd_group_to_users.js
 * Target DB: pli_portal_uat
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  await sequelize.query(`
    ALTER TABLE users
      ADD COLUMN hd_group_id INT NULL DEFAULT NULL
      REFERENCES hd_groups(id) ON DELETE SET NULL ON UPDATE CASCADE;
  `);
  console.log('✓ users — added: hd_group_id');

  console.log('\n✅ Migration 014 complete —', process.env.MYSQL_DATABASE);
}

up()
  .then(() => process.exit(0))
  .catch((err) => { console.error('❌ Migration failed:', err.message); process.exit(1); });
