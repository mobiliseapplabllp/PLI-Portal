/**
 * Migration 037 — Create pm_member_roles table
 *
 * Replaces the hardcoded MEMBER_ROLES array in the frontend with a
 * DB-backed table that admins can manage from PM Settings → Member Roles.
 *
 * Seeds the 8 default roles that were previously hardcoded.
 *
 *   node backend/migrations/037_create_pm_member_roles.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

const DEFAULT_ROLES = [
  'Project/Product Manager',
  'Project/Product Owner',
  'Account Manager or Sales Executive',
  'Developer',
  'Tester',
  'Designer',
  'Infra',
  'Security',
  'Finance',
];

async function run() {
  console.log('\n[Migration 037] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 037] Connected.\n');

  // ── Create table ────────────────────────────────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_member_roles (
      id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      isActive   TINYINT(1)   NOT NULL DEFAULT 1,
      sortOrder  INT          NOT NULL DEFAULT 0,
      createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('  [+] Table pm_member_roles created (or already exists)');

  // ── Check if already seeded ──────────────────────────────────────────────────
  const [[{ cnt }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM pm_member_roles`
  );

  if (Number(cnt) > 0) {
    console.log(`  [~] Already seeded (${cnt} rows) — skipping seed`);
  } else {
    for (let i = 0; i < DEFAULT_ROLES.length; i++) {
      await sequelize.query(
        `INSERT IGNORE INTO pm_member_roles (name, isActive, sortOrder) VALUES (?, 1, ?)`,
        { replacements: [DEFAULT_ROLES[i], i + 1] }
      );
    }
    console.log(`  [+] Seeded ${DEFAULT_ROLES.length} default roles`);
  }

  console.log('\n[Migration 037] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 037] FAILED:', err.message);
  process.exit(1);
});
