/**
 * Migration 011 — Saturday Rostering module
 *
 * 1. Adds users.rosterApplicable (TINYINT(1) DEFAULT 1) — employees excluded from
 *    Saturday rostering get this switched off in Employee Master.
 *    NOTE: this MUST be added here, not via sequelize.sync({alter:true}) — the users
 *    table is at MySQL's 64-index cap (duplicate unique keys from historic alters),
 *    so sync's ALTER on users fails silently and would never add the column.
 * 2. Creates roster_weeks, roster_entries, roster_comp_offs, roster_swap_requests.
 *    All UUID columns are CHAR(36) COLLATE utf8mb4_bin to match users.id so FKs work.
 *
 * Idempotent — safe to re-run. Usage: node backend/src/migrations/011_rostering_tables.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows[0].n > 0;
}

async function up() {
  console.log('— Migration 011: Saturday Rostering —');

  // 1. users.rosterApplicable
  if (await columnExists('users', 'rosterApplicable')) {
    console.log('  users.rosterApplicable already exists — skip');
  } else {
    await sequelize.query(
      `ALTER TABLE users ADD COLUMN rosterApplicable TINYINT(1) NOT NULL DEFAULT 1 AFTER kpiReviewApplicable`
    );
    console.log('  ✓ users.rosterApplicable added');
  }

  // 2. roster_weeks — one row per Saturday
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_weeks (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      saturdayDate DATE NOT NULL,
      label VARCHAR(64) NULL,
      createdById CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_roster_week_date (saturdayDate),
      KEY idx_rw_createdBy (createdById),
      CONSTRAINT fk_rw_createdBy FOREIGN KEY (createdById) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_weeks');

  // 3. roster_entries — one row per employee per Saturday
  //    plannedStatus = original roster; finalStatus = after "changes as per company work requirement"
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_entries (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      rosterWeekId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      employeeId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      managerId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL COMMENT 'employee manager snapshot at entry creation',
      plannedStatus ENUM('working','off') NOT NULL DEFAULT 'working',
      finalStatus ENUM('working','off') NOT NULL DEFAULT 'working',
      changeReason VARCHAR(512) NULL,
      changedById CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      changedAt DATETIME NULL,
      isPublished TINYINT(1) NOT NULL DEFAULT 0,
      publishedAt DATETIME NULL,
      publishedById CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      emailSentAt DATETIME NULL,
      reminderSentAt DATETIME NULL,
      digestSentAt DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_roster_week_employee (rosterWeekId, employeeId),
      KEY idx_re_employee (employeeId),
      KEY idx_re_manager (managerId),
      CONSTRAINT fk_re_week FOREIGN KEY (rosterWeekId) REFERENCES roster_weeks(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_re_employee FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_entries');

  // 4. roster_comp_offs — credit earned when a published Off is flipped to Working
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_comp_offs (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      employeeId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      rosterEntryId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      earnedDate DATE NOT NULL COMMENT 'the Saturday worked',
      reason VARCHAR(512) NULL,
      status ENUM('earned','availed','cancelled') NOT NULL DEFAULT 'earned',
      availedDate DATE NULL,
      grantedById CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rco_employee (employeeId),
      KEY idx_rco_entry (rosterEntryId),
      CONSTRAINT fk_rco_employee FOREIGN KEY (employeeId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rco_entry FOREIGN KEY (rosterEntryId) REFERENCES roster_entries(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_comp_offs');

  // 5. roster_swap_requests — employee ⇄ employee Saturday swap, peer accept then manager approval
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roster_swap_requests (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      rosterWeekId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      requesterId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      targetId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      requesterEntryId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      targetEntryId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      reason VARCHAR(512) NULL,
      status ENUM('pending_peer','pending_manager','approved','rejected','cancelled') NOT NULL DEFAULT 'pending_peer',
      peerAcceptedAt DATETIME NULL,
      decidedById CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
      decidedAt DATETIME NULL,
      decisionComment VARCHAR(512) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_rsr_week (rosterWeekId),
      KEY idx_rsr_requester (requesterId),
      KEY idx_rsr_target (targetId),
      KEY idx_rsr_status (status),
      CONSTRAINT fk_rsr_week FOREIGN KEY (rosterWeekId) REFERENCES roster_weeks(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rsr_requester FOREIGN KEY (requesterId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rsr_target FOREIGN KEY (targetId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rsr_requester_entry FOREIGN KEY (requesterEntryId) REFERENCES roster_entries(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_rsr_target_entry FOREIGN KEY (targetEntryId) REFERENCES roster_entries(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ roster_swap_requests');

  console.log('— Migration 011 complete —');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration 011 FAILED:', err.message);
    process.exit(1);
  });
