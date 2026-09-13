/**
 * Migration 039 — Phase 0: hours/day allocation
 *
 * Allocation input changes from a percentage to hours per day. Percent is
 * kept as a legacy column and becomes a derived, read-only display value
 * (hoursPerDay / workingHoursPerDay).
 *
 * Adds:
 *   pm_settings.workingHoursPerDay          DECIMAL(3,1) DEFAULT 8.0
 *   pm_project_members.hoursPerDay          DECIMAL(3,1) NULL
 *   pm_project_members.hoursConfirmed       TINYINT(1)   DEFAULT 0
 *   pm_allocation_approvals.hoursPerDay     DECIMAL(3,1) NULL
 *
 * Pre-fill (PM review condition #1): existing rows get
 *   hoursPerDay = ROUND(allocationPct * workingHoursPerDay / 100, 1)
 * with hoursConfirmed = 0. The conversion is exact, so nothing is guessed —
 * it is simply not yet confirmed by the PM. allocationPct is never dropped.
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/039_pm_hours_per_day_allocation.js
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
  if (await hasColumn(table, column)) {
    console.log(`  [~] ${table}.${column} already exists — skipping`);
    return false;
  }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  console.log(`  [+] ${table}.${column} added`);
  return true;
}

async function run() {
  console.log('\n[Migration 039] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 039] Connected.\n');

  // ── 1. Global working hours per day (the only calendar setting Phase 0 needs)
  await addColumn('pm_settings', 'workingHoursPerDay',
    `DECIMAL(3,1) NOT NULL DEFAULT 8.0 COMMENT 'Capacity per person per working day; % is derived from this'`);

  // ── 2. Member allocation in hours/day, plus a confirmed flag
  const addedHours = await addColumn('pm_project_members', 'hoursPerDay',
    `DECIMAL(3,1) NULL DEFAULT NULL COMMENT 'Hours/day committed to this project. NULL only for rows never converted'`);
  await addColumn('pm_project_members', 'hoursConfirmed',
    `TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 = pre-filled from legacy allocationPct, awaiting PM confirmation'`);

  // ── 3. Approval requests carry hours too
  await addColumn('pm_allocation_approvals', 'hoursPerDay',
    `DECIMAL(3,1) NULL DEFAULT NULL COMMENT 'Requested hours/day (legacy rows: derive from allocationPct)'`);

  // ── 4. Pre-fill legacy members from allocationPct (exact conversion)
  const [[{ hpd }]] = await sequelize.query(
    `SELECT workingHoursPerDay AS hpd FROM pm_settings WHERE id = 1`
  ).catch(() => [[{ hpd: 8 }]]);
  const hoursPerDay = Number(hpd) || 8;

  const [, meta] = await sequelize.query(`
    UPDATE pm_project_members
       SET hoursPerDay    = ROUND(allocationPct * ? / 100, 1),
           hoursConfirmed = 0
     WHERE hoursPerDay IS NULL
       AND allocationPct IS NOT NULL
  `, { replacements: [hoursPerDay] });
  const filled = meta?.affectedRows ?? 0;
  console.log(`  [+] Pre-filled hoursPerDay on ${filled} member row(s) from allocationPct × ${hoursPerDay} / 100 (unconfirmed)`);

  // Same for pending approvals so the compare never sees NULL (PM condition #3)
  const [, meta2] = await sequelize.query(`
    UPDATE pm_allocation_approvals
       SET hoursPerDay = ROUND(allocationPct * ? / 100, 1)
     WHERE hoursPerDay IS NULL
       AND allocationPct IS NOT NULL
  `, { replacements: [hoursPerDay] });
  console.log(`  [+] Pre-filled hoursPerDay on ${meta2?.affectedRows ?? 0} approval row(s)`);

  // ── 5. Verify
  const [[{ total, withHours, unconfirmed }]] = await sequelize.query(`
    SELECT COUNT(*) AS total,
           SUM(hoursPerDay IS NOT NULL) AS withHours,
           SUM(hoursConfirmed = 0 AND hoursPerDay IS NOT NULL) AS unconfirmed
      FROM pm_project_members
  `);
  console.log(`\n  [✓] pm_project_members: ${total} rows, ${withHours} with hours, ${unconfirmed} awaiting PM confirmation`);

  console.log('\n[Migration 039] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 039] FAILED:', err.message);
  process.exit(1);
});
