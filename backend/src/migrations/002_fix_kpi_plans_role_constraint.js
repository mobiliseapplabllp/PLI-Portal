/**
 * Migration: 002_fix_kpi_plans_role_constraint
 *
 * PURPOSE:
 *   - Drops old unique constraints on kpi_plans that don't include the `role` column:
 *       unique_team_plan    → constraint on (financialYear, departmentId)
 *       unique_dept_fy_plan → constraint on (financialYear, departmentId)
 *   - Adds the correct 3-column constraint: unique_dept_fy_role_plan
 *       on (financialYear, departmentId, role)
 *   - Updates any existing plans where role IS NULL → sets role = 'employee'
 *     so they appear when filtering by role in the Edit KPI screen.
 *
 * RUN ONCE before restarting the server:
 *   node backend/src/migrations/002_fix_kpi_plans_role_constraint.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function dropIndexIfExists(name) {
  const [[row]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name   = 'kpi_plans'
       AND index_name   = '${name}'`
  );
  if (Number(row.cnt) > 0) {
    await sequelize.query(`ALTER TABLE kpi_plans DROP INDEX \`${name}\``);
    console.log(`[002] Dropped index: ${name}`);
  } else {
    console.log(`[002] Index not found (skipped): ${name}`);
  }
}

async function addIndexIfMissing() {
  const [[row]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name   = 'kpi_plans'
       AND index_name   = 'unique_dept_fy_role_plan'`
  );
  if (Number(row.cnt) === 0) {
    await sequelize.query(
      `ALTER TABLE kpi_plans
       ADD UNIQUE INDEX \`unique_dept_fy_role_plan\` (financialYear, departmentId, role)`
    );
    console.log('[002] Created index: unique_dept_fy_role_plan');
  } else {
    console.log('[002] Index already exists: unique_dept_fy_role_plan');
  }
}

async function runMigration() {
  console.log('[Migration 002] Starting...');
  try {
    await sequelize.authenticate();
    console.log('[Migration 002] DB connection OK');

    // Step 1 — Add role column if it doesn't exist yet
    const [[roleCol]] = await sequelize.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name   = 'kpi_plans'
         AND column_name  = 'role'`
    );
    if (Number(roleCol.cnt) === 0) {
      await sequelize.query(
        `ALTER TABLE kpi_plans ADD COLUMN \`role\` VARCHAR(128) NULL AFTER departmentId`
      );
      console.log('[002] Added role column');
    } else {
      console.log('[002] role column already exists');
    }

    // Step 2 — Drop legacy constraints (order matters: drop old before adding new)
    await dropIndexIfExists('unique_dept_plan');         // 2-col (dept+fy) — blocks multi-role plans
    await dropIndexIfExists('unique_team_plan');
    await dropIndexIfExists('unique_dept_fy_plan');
    await dropIndexIfExists('unique_dept_fy_role_plan'); // drop so we can re-add cleanly

    // Step 3 — Add correct 3-column unique index
    await addIndexIfMissing();

    // Step 4 — Set NULL roles to 'employee' so existing plans are findable
    const [, meta] = await sequelize.query(
      `UPDATE kpi_plans SET role = 'employee' WHERE role IS NULL OR role = ''`
    );
    const updated = meta?.affectedRows ?? 0;
    if (updated > 0) {
      console.log(`[002] Updated ${updated} plan(s) with NULL role → 'employee'`);
    } else {
      console.log('[002] No NULL-role plans to update');
    }

    console.log('[Migration 002] Completed successfully.');
  } catch (err) {
    console.error('[Migration 002] FAILED:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
