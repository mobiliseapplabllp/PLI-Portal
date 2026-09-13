/**
 * Migration 042 — Allocation type: hours/day OR total hours
 *
 * The user picks an allocation type and enters either hours per day or total
 * hours for the window. The engine still runs on hoursPerDay — total is
 * converted once at save time (total ÷ working days in the window) — but we
 * store the type and the typed value so forms reopen the same way and cards
 * can show "120h total · 2.8 h/day".
 *
 * Adds to pm_project_members, pm_allocation_approvals (camelCase):
 *   allocationMode        ENUM('per_day','total') NOT NULL DEFAULT 'per_day'
 *   allocationTotalHours  DECIMAL(6,1) NULL
 * Adds to hd_tickets (snake_case, matching the table):
 *   allocation_mode        ENUM('per_day','total') NOT NULL DEFAULT 'total'
 *   allocation_total_hours DECIMAL(6,1) NULL
 *
 * Existing rows keep working as per_day (their hoursPerDay is untouched).
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/042_allocation_mode.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function hasColumn(table, column) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return Number(cnt) > 0;
}
async function addColumn(table, column, ddl) {
  if (await hasColumn(table, column)) { console.log(`  [~] ${table}.${column} already exists — skipping`); return; }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
}

async function run() {
  console.log('\n[Migration 042] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 042] Connected.\n');

  const MODE_PM = `ENUM('per_day','total') NOT NULL DEFAULT 'per_day' COMMENT 'What the user typed: hours per day, or total hours for the window'`;
  const MODE_HD = `ENUM('per_day','total') NOT NULL DEFAULT 'total'   COMMENT 'What the user typed: hours per day, or total hours for the window'`;
  const TOTAL   = `DECIMAL(6,1) NULL DEFAULT NULL COMMENT 'Total hours across the window (typed in total mode, derived in per_day mode)'`;

  await addColumn('pm_project_members',      'allocationMode',       MODE_PM);
  await addColumn('pm_project_members',      'allocationTotalHours', TOTAL);
  await addColumn('pm_allocation_approvals', 'allocationMode',       MODE_PM);
  await addColumn('pm_allocation_approvals', 'allocationTotalHours', TOTAL);
  await addColumn('hd_tickets',              'allocation_mode',        MODE_HD);
  await addColumn('hd_tickets',              'allocation_total_hours', TOTAL);

  const [[a]] = await sequelize.query(`SELECT COUNT(*) n FROM pm_project_members WHERE allocationMode='per_day'`);
  const [[b]] = await sequelize.query(`SELECT COUNT(*) n FROM hd_tickets WHERE allocation_mode='total'`);
  console.log(`\n  [✓] ${a.n} member row(s) default per_day · ${b.n} ticket row(s) default total`);
  console.log('\n[Migration 042] Done.\n');
  await sequelize.close();
}

run().catch(err => { console.error('[Migration 042] FAILED:', err.message); process.exit(1); });
