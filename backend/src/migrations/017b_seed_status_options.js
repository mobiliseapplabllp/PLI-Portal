/**
 * Migration 017b — Seed status options into hd_options
 * Adds the 5 fixed ticket statuses as display-only reference values.
 *
 * NOTE: These are READ-ONLY in the UI — adding new statuses here does NOT
 * create new valid statuses. The hd_tickets.status column is a MySQL ENUM;
 * only a DB migration (ALTER TABLE) can add new statuses.
 *
 * Run: node backend/src/migrations/017b_seed_status_options.js
 * Target DB: pli_portal_uat
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  await sequelize.authenticate();
  console.log('Connected to DB:', process.env.MYSQL_DATABASE);

  const statuses = [
    ['status', 'open',        'New ticket — not yet picked up by an agent'],
    ['status', 'in-progress', 'Agent is actively working on this ticket'],
    ['status', 'pending',     'Awaiting response from requester or a third party'],
    ['status', 'resolved',    'Solution provided — awaiting requester confirmation'],
    ['status', 'closed',      'Ticket fully closed, no further action needed'],
  ];

  for (const [type, name, description] of statuses) {
    await sequelize.query(
      'INSERT IGNORE INTO hd_options (type, name, description) VALUES (?, ?, ?)',
      { replacements: [type, name, description] }
    );
  }

  const [[{ c }]] = await sequelize.query("SELECT COUNT(*) as c FROM hd_options WHERE type='status'");
  console.log(`✓ Status options in DB: ${c}`);

  await sequelize.close();
  console.log('\nMigration 017b complete.');
}

up().catch((err) => {
  console.error('Migration 017b failed:', err.message);
  process.exit(1);
});
