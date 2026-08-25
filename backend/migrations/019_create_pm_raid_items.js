/**
 * Migration 019 — Create pm_raid_items table
 *
 * RAID = Risk / Assumption / Issue / Dependency
 * Stores the RAID register per project.
 *
 * UAT only — run once:
 *   node backend/migrations/019_create_pm_raid_items.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 019] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 019] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_raid_items (
      id           CHAR(36)     NOT NULL PRIMARY KEY,
      projectId    CHAR(36)     NOT NULL,
      type         ENUM('Risk','Assumption','Issue','Dependency')
                                NOT NULL DEFAULT 'Risk',
      title        VARCHAR(255) NOT NULL,
      description  TEXT         NULL,
      impact       ENUM('High','Medium','Low')
                                NOT NULL DEFAULT 'Medium',
      probability  ENUM('High','Medium','Low')
                                NULL COMMENT 'For Risks only',
      status       ENUM('Open','In Progress','Closed','Deferred')
                                NOT NULL DEFAULT 'Open',
      owner        VARCHAR(255) NULL COMMENT 'Name or role responsible',
      ownerId      CHAR(36)     NULL COMMENT 'User FK (optional)',
      raisedDate   DATE         NULL,
      targetDate   DATE         NULL,
      closedDate   DATE         NULL,
      mitigationPlan TEXT       NULL COMMENT 'For Risks — how to mitigate',
      createdById  CHAR(36)     NULL,
      createdAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_raid_project (projectId),
      INDEX idx_pm_raid_type    (type),
      INDEX idx_pm_raid_status  (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_raid_items table created (or already exists)');

  console.log('\n[Migration 019] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 019] FAILED:', err);
  process.exit(1);
});
