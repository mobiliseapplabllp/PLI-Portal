/**
 * Migration 012 — OTP login
 *
 * Creates login_otps: short-lived one-time passcodes for passwordless sign-in.
 * The passcode is stored only as a bcrypt hash; rows are consumed on use.
 *
 * NOTE: written as a migration (not left to sequelize.sync) because sync
 * aborts on this database — the users table sits at MySQL's 64-index cap, so
 * nothing after it gets applied.
 *
 * Idempotent — safe to re-run. Usage: node backend/src/migrations/012_login_otp.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');

async function up() {
  console.log('— Migration 012: OTP login —');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS login_otps (
      id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      userId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
      codeHash VARCHAR(255) NOT NULL COMMENT 'bcrypt hash of the OTP — never the code itself',
      expiresAt DATETIME NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      consumedAt DATETIME NULL,
      ipAddress VARCHAR(64) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_lo_user (userId),
      KEY idx_lo_expires (expiresAt),
      CONSTRAINT fk_lo_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  ✓ login_otps');

  console.log('— Migration 012 complete —');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration 012 FAILED:', err.message);
    process.exit(1);
  });
