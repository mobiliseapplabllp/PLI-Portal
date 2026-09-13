/**
 * Migration 040 — Phase 1: Working Calendar
 *
 * Adds the calendar inputs the capacity engine needs to compute real monthly
 * capacity instead of "every day but Sunday":
 *
 *   pm_settings.workingSaturdays   JSON  — which Saturdays of the month work, e.g. [2,4]
 *   pm_holidays                    table — public holiday list (Excel upload / inline add)
 *
 * Sunday-off is a hard rule in the engine and needs no column.
 * hoursPerDay already exists from migration 039.
 *
 * Default workingSaturdays = [2,4] (2nd and 4th Saturday working — the most
 * common Indian IT pattern). Admin can change it in PM Settings → Working Calendar.
 *
 * Idempotent — safe to re-run.
 *
 *   node backend/migrations/040_pm_working_calendar.js
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
async function hasTable(table) {
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [table] }
  );
  return Number(cnt) > 0;
}

async function run() {
  console.log('\n[Migration 040] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 040] Connected.\n');

  // ── 1. Saturday policy on the settings singleton ─────────────────────────
  if (await hasColumn('pm_settings', 'workingSaturdays')) {
    console.log('  [~] pm_settings.workingSaturdays already exists — skipping');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_settings
        ADD COLUMN workingSaturdays JSON NULL
        COMMENT 'Ordinals (1-5) of the Saturdays in a month that are working days, e.g. [2,4]'
    `);
    await sequelize.query(`UPDATE pm_settings SET workingSaturdays = JSON_ARRAY(2, 4) WHERE id = 1 AND workingSaturdays IS NULL`);
    console.log('  [+] pm_settings.workingSaturdays added, default [2,4]');
  }

  // ── 2. Holiday list ──────────────────────────────────────────────────────
  if (await hasTable('pm_holidays')) {
    console.log('  [~] pm_holidays already exists — skipping');
  } else {
    await sequelize.query(`
      CREATE TABLE pm_holidays (
        id          CHAR(36)     NOT NULL PRIMARY KEY,
        date        DATE         NOT NULL,
        name        VARCHAR(150) NOT NULL,
        year        SMALLINT     NOT NULL,
        isOptional  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = restricted/optional holiday; does NOT reduce capacity',
        createdById CHAR(36)     NULL,
        createdAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_holiday_date (date),
        KEY idx_holiday_year (year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  [+] pm_holidays table created');
  }

  // ── 3. Verify ────────────────────────────────────────────────────────────
  const [[s]] = await sequelize.query(`SELECT workingHoursPerDay, workingSaturdays FROM pm_settings WHERE id = 1`);
  const [[h]] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM pm_holidays`);
  console.log(`\n  [✓] calendar: ${s.workingHoursPerDay} h/day, working Saturdays ${JSON.stringify(s.workingSaturdays)}, ${h.cnt} holiday(s)`);

  console.log('\n[Migration 040] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 040] FAILED:', err.message);
  process.exit(1);
});
