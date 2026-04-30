/**
 * Migration: 003_add_senior_manager_role
 *
 * PURPOSE:
 *   Adds 'senior_manager' to the users.role ENUM column.
 *
 * RUN ONCE before restarting the server:
 *   node backend/src/migrations/003_add_senior_manager_role.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function runMigration() {
  console.log('[Migration 003] Starting...');
  try {
    await sequelize.authenticate();
    console.log('[Migration 003] DB connection OK');

    await sequelize.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM(
        'employee',
        'manager',
        'senior_manager',
        'hr_admin',
        'final_approver',
        'admin'
      ) NOT NULL DEFAULT 'employee'
    `);
    console.log('[Migration 003] users.role ENUM updated with senior_manager');

    console.log('[Migration 003] Completed successfully.');
  } catch (err) {
    console.error('[Migration 003] FAILED:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
