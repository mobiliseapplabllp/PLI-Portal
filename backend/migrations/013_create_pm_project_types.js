/**
 * Migration 013 — Create pm_project_types table
 *
 * Stores configurable project types (Signed, Unsigned, Contract, Demo Prototype).
 * Seeded with 4 defaults. Admin can add/edit/disable from PM Configuration settings.
 *
 * UAT only — run once:
 *   node backend/migrations/013_create_pm_project_types.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 013] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 013] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_project_types (
      id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      isActive   TINYINT(1)   NOT NULL DEFAULT 1,
      sortOrder  INT          NOT NULL DEFAULT 0,
      createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pm_project_types_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_project_types table created (or already exists)');

  // Seed default project types
  await sequelize.query(`
    INSERT IGNORE INTO pm_project_types (name, isActive, sortOrder) VALUES
      ('Signed',           1, 1),
      ('Unsigned',         1, 2),
      ('Contract',         1, 3),
      ('Demo Prototype',   1, 4)
  `);
  console.log('  [+] Default project types seeded');

  console.log('\n[Migration 013] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 013] FAILED:', err);
  process.exit(1);
});
