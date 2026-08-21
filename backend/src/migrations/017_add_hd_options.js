/**
 * Migration 017 — Helpdesk Options Table
 * Stores configurable dropdown values for ticket fields:
 *   category, status, level, mode, impact, urgency, priority, request_type, team, site
 *
 * Run: node backend/src/migrations/017_add_hd_options.js
 * Target DB: pli_portal_uat
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS hd_options (
      id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      type        VARCHAR(50)  NOT NULL COMMENT 'category|status|level|mode|impact|urgency|priority|request_type|team|site',
      name        VARCHAR(200) NOT NULL,
      description TEXT NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_hd_option_type_name (type, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('✓ hd_options table created');

  // Seed default values so the UI is populated immediately
  const defaults = [
    // Categories
    ['category', 'General',           null],
    ['category', 'Hardware',          null],
    ['category', 'Software',          null],
    ['category', 'Network',           null],
    ['category', 'Access & Security', null],
    ['category', 'HR',                null],
    ['category', 'Finance',           null],
    // Modes
    ['mode', 'Web Form',   null],
    ['mode', 'E-Mail',     null],
    ['mode', 'Phone Call', null],
    // Impact
    ['impact', 'Low',    null],
    ['impact', 'Medium', null],
    ['impact', 'High',   null],
    // Urgency
    ['urgency', 'Low',    null],
    ['urgency', 'Medium', null],
    ['urgency', 'High',   null],
    // Priority
    ['priority', 'Low',      null],
    ['priority', 'Medium',   null],
    ['priority', 'High',     null],
    ['priority', 'Critical', null],
    // Request Types
    ['request_type', 'Incident',        null],
    ['request_type', 'Service Request', null],
    // Level
    ['level', 'L1', null],
    ['level', 'L2', null],
    ['level', 'L3', null],
    // Sites
    ['site', 'Base Site', null],
    // Teams (Raised by Team) — empty by default, admins add their own
  ];

  for (const [type, name, description] of defaults) {
    await sequelize.query(
      `INSERT IGNORE INTO hd_options (type, name, description) VALUES (?, ?, ?)`,
      { replacements: [type, name, description] }
    );
  }
  console.log('✓ Default options seeded');

  await sequelize.close();
  console.log('\nMigration 017 complete.');
}

up().catch((err) => {
  console.error('Migration 017 failed:', err.message);
  process.exit(1);
});
