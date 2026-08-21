/**
 * Migration 013 — OTP-only authentication
 *
 * Password sign-in is removed from the product. This migration makes the schema
 * match that reality:
 *   1. users.passwordHash  -> NULLABLE (new users are created without a password)
 *   2. users.mustChangePassword -> DEFAULT 0 and cleared on every row
 *      (the forced password-change flow no longer exists)
 *   3. login_otps gains a lockedUntil marker used by the per-account throttle
 *
 * Existing bcrypt hashes are deliberately LEFT IN PLACE — nothing reads them any
 * more (the password route is gone), and keeping them makes a rollback possible.
 * To destroy them permanently, run separately and irreversibly:
 *     UPDATE users SET passwordHash = NULL;
 *
 * Idempotent — safe to re-run. Usage: node backend/src/migrations/013_otp_only_auth.js
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
  console.log('— Migration 013: OTP-only authentication —');

  // 1. passwordHash becomes optional
  await sequelize.query(`ALTER TABLE users MODIFY COLUMN passwordHash VARCHAR(255) NULL`);
  console.log('  ✓ users.passwordHash is now nullable');

  // 2. mustChangePassword is meaningless without passwords
  await sequelize.query(`ALTER TABLE users MODIFY COLUMN mustChangePassword TINYINT(1) NOT NULL DEFAULT 0`);
  const [res] = await sequelize.query(`UPDATE users SET mustChangePassword = 0 WHERE mustChangePassword <> 0`);
  console.log(`  ✓ users.mustChangePassword defaulted to 0 (${res.affectedRows || 0} row(s) cleared)`);

  // 3. Per-account lockout marker for the OTP throttle
  if (await columnExists('login_otps', 'lockedUntil')) {
    console.log('  login_otps.lockedUntil already exists — skip');
  } else {
    await sequelize.query(`ALTER TABLE login_otps ADD COLUMN lockedUntil DATETIME NULL AFTER attempts`);
    console.log('  ✓ login_otps.lockedUntil added');
  }

  console.log('— Migration 013 complete —');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration 013 FAILED:', err.message);
    process.exit(1);
  });
