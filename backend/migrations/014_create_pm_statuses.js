/**
 * Migration 014 — Create pm_statuses table
 *
 * Stores configurable project statuses.
 * Seeds defaults and links to pm_projects.status (now VARCHAR after Migration 012).
 *
 * UAT only — run once (run AFTER 012):
 *   node backend/migrations/014_create_pm_statuses.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 014] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 014] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_statuses (
      id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(100) NOT NULL,
      color      VARCHAR(20)  NULL DEFAULT '#6B7280',
      isActive   TINYINT(1)   NOT NULL DEFAULT 1,
      isSystem   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'System statuses cannot be deleted',
      sortOrder  INT          NOT NULL DEFAULT 0,
      createdAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pm_statuses_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_statuses table created (or already exists)');

  // Seed default statuses (isSystem=1 means they cannot be deleted by admin)
  await sequelize.query(`
    INSERT IGNORE INTO pm_statuses (name, color, isActive, isSystem, sortOrder) VALUES
      ('Yet to Start', '#6B7280', 1, 1, 1),
      ('Active',       '#2563EB', 1, 1, 2),
      ('On Track',     '#16A34A', 1, 0, 3),
      ('On Hold',      '#D97706', 1, 1, 4),
      ('Delayed',      '#DC2626', 1, 0, 5),
      ('Completed',    '#7C3AED', 1, 1, 6),
      ('Cancelled',    '#374151', 1, 1, 7)
  `);
  console.log('  [+] Default project statuses seeded');

  console.log('\n[Migration 014] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 014] FAILED:', err);
  process.exit(1);
});
