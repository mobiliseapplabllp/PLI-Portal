/**
 * Migration: 001_rename_final_reviewed_to_final_approved
 *
 * PURPOSE:
 *   - Adds new ENUM values to kpi_assignments.status: commitment_submitted, final_approved
 *   - Migrates all existing 'final_reviewed' records to 'final_approved'
 *   - Adds new role ENUM values to users.role: hr_admin, final_approver
 *   - Adds commitmentDeadline column to appraisal_cycles
 *
 * RUN THIS SCRIPT ONCE BEFORE DEPLOYING NEW CODE TO A LIVE DATABASE.
 * It is safe to run multiple times (uses IF NOT EXISTS / UPDATE with WHERE).
 *
 * Usage:
 *   node backend/src/migrations/001_rename_final_reviewed_to_final_approved.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function runMigration() {
  const qi = sequelize.getQueryInterface();

  console.log('[Migration 001] Starting...');

  try {
    await sequelize.authenticate();
    console.log('[Migration 001] DB connection OK');

    // ─── Step 1: Expand kpi_assignments.status ENUM ─────────────────────────
    console.log('[Migration 001] Step 1: Expanding kpi_assignments.status ENUM...');
    await sequelize.query(`
      ALTER TABLE kpi_assignments
        MODIFY COLUMN status ENUM(
          'draft',
          'assigned',
          'commitment_submitted',
          'employee_submitted',
          'manager_reviewed',
          'final_reviewed',
          'final_approved',
          'locked'
        ) NOT NULL DEFAULT 'draft';
    `);
    console.log('[Migration 001] Step 1 done.');

    // ─── Step 2: Migrate final_reviewed → final_approved ────────────────────
    console.log('[Migration 001] Step 2: Migrating final_reviewed → final_approved...');
    const [, meta] = await sequelize.query(`
      UPDATE kpi_assignments
        SET status = 'final_approved'
      WHERE status = 'final_reviewed';
    `);
    const affected = meta?.affectedRows ?? 0;
    console.log(`[Migration 001] Step 2 done. ${affected} row(s) updated.`);

    // ─── Step 3: Expand users.role ENUM ─────────────────────────────────────
    console.log('[Migration 001] Step 3: Expanding users.role ENUM...');
    await sequelize.query(`
      ALTER TABLE users
        MODIFY COLUMN role ENUM(
          'employee',
          'manager',
          'hr_admin',
          'final_approver',
          'admin'
        ) NOT NULL DEFAULT 'employee';
    `);
    console.log('[Migration 001] Step 3 done.');

    // ─── Step 4: Add commitmentDeadline to appraisal_cycles ─────────────────
    console.log('[Migration 001] Step 4: Adding commitmentDeadline column...');
    const [cycleColumns] = await sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'appraisal_cycles'
        AND COLUMN_NAME = 'commitmentDeadline';
    `);
    if (cycleColumns.length === 0) {
      await sequelize.query(`
        ALTER TABLE appraisal_cycles
          ADD COLUMN commitmentDeadline DATE DEFAULT NULL
          AFTER financialYear;
      `);
      console.log('[Migration 001] Step 4 done: commitmentDeadline added.');
    } else {
      console.log('[Migration 001] Step 4 skipped: commitmentDeadline already exists.');
    }

    // ─── Step 5: Verify ──────────────────────────────────────────────────────
    const [[{ remaining }]] = await sequelize.query(`
      SELECT COUNT(*) AS remaining FROM kpi_assignments WHERE status = 'final_reviewed';
    `);
    if (Number(remaining) > 0) {
      console.warn(`[Migration 001] WARNING: ${remaining} records still have status='final_reviewed'. Check for errors.`);
    } else {
      console.log('[Migration 001] Verification OK: no remaining final_reviewed records.');
    }

    console.log('[Migration 001] All steps completed successfully.');
  } catch (err) {
    console.error('[Migration 001] FAILED:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
