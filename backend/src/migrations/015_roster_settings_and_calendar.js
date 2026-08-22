/**
 * Migration 015 — Rostering: settings, calendar awareness and change history
 *
 * 1. roster_settings      — singleton config (digest/reminder schedule, the
 *                           5th-Saturday rule, auto-creation, coverage floor)
 * 2. roster_holidays      — company holidays; a Saturday that falls on one is
 *                           an off-day for everybody
 * 3. roster_leaves        — per-employee leave ranges, so someone on leave is
 *                           never rostered Working
 * 4. roster_entry_changes — append-only history. roster_entries keeps only the
 *                           latest change, so "who changed my Saturday, and
 *                           why" was unanswerable after a second edit
 *
 * Idempotent — safe to re-run.
 * Usage: node backend/src/migrations/015_roster_settings_and_calendar.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

const UUID = 'CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin';

async function up() {
  console.log('— Migration 015: Roster settings, calendar and change history —');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_settings (
      id INT NOT NULL DEFAULT 1,
      digestEnabled TINYINT(1) NOT NULL DEFAULT 1,
      digestDay TINYINT NOT NULL DEFAULT 3 COMMENT '0=Sun .. 6=Sat, default Wednesday',
      digestTime VARCHAR(5) NOT NULL DEFAULT '10:30' COMMENT 'HH:MM IST',
      reminderEnabled TINYINT(1) NOT NULL DEFAULT 1,
      reminderDay TINYINT NOT NULL DEFAULT 5 COMMENT 'default Friday',
      reminderTime VARCHAR(5) NOT NULL DEFAULT '10:00',
      fifthSaturdayWorking TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'a month with 5 Saturdays is all-hands',
      autoCreateEnabled TINYINT(1) NOT NULL DEFAULT 1,
      autoCreateWeeksAhead TINYINT NOT NULL DEFAULT 2,
      minCoveragePercent TINYINT NOT NULL DEFAULT 0 COMMENT '0 disables the guardrail',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_settings');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_holidays (
      id ${UUID} NOT NULL,
      holidayDate DATE NOT NULL,
      name VARCHAR(255) NOT NULL,
      createdById ${UUID} NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_holiday_date (holidayDate),
      CONSTRAINT fk_rh_createdBy FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_holidays');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_leaves (
      id ${UUID} NOT NULL,
      employeeId ${UUID} NOT NULL,
      fromDate DATE NOT NULL,
      toDate DATE NOT NULL,
      reason VARCHAR(255) NULL,
      createdById ${UUID} NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rl_employee_range (employeeId, fromDate, toDate),
      CONSTRAINT fk_rl_employee FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rl_createdBy FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_leaves');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_entry_changes (
      id ${UUID} NOT NULL,
      rosterEntryId ${UUID} NOT NULL,
      fromStatus ENUM('working','off') NULL,
      toStatus ENUM('working','off') NOT NULL,
      reason VARCHAR(512) NULL,
      source VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT 'manual | swap | bulk | leave | holiday | auto',
      changedById ${UUID} NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rec_entry (rosterEntryId),
      CONSTRAINT fk_rec_entry FOREIGN KEY (rosterEntryId) REFERENCES roster_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rec_changedBy FOREIGN KEY (changedById) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_entry_changes');

  // Flags on the entry itself so the board can explain *why* someone is Off
  const [cols] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roster_entries'`
  );
  const have = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!have.has('onLeave')) {
    await sequelize.query(`ALTER TABLE roster_entries ADD COLUMN onLeave TINYINT(1) NOT NULL DEFAULT 0 AFTER finalStatus`);
    console.log('  ✓ roster_entries.onLeave');
  }
  if (!have.has('isHoliday')) {
    await sequelize.query(`ALTER TABLE roster_entries ADD COLUMN isHoliday TINYINT(1) NOT NULL DEFAULT 0 AFTER onLeave`);
    console.log('  ✓ roster_entries.isHoliday');
  }

  await sequelize.query(`INSERT IGNORE INTO roster_settings (id) VALUES (1)`);
  console.log('  ✓ default settings row');

  console.log('— Migration 015 complete —');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration 015 FAILED:', err.message);
    process.exit(1);
  });
