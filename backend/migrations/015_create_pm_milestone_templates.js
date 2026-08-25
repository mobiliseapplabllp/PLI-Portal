/**
 * Migration 015 — Create pm_milestone_templates table
 *
 * Stores default milestone definitions per project type.
 * Each row defines one default milestone:
 *   - projectType  : matches pm_project_types.name (VARCHAR, not FK for safety)
 *   - name         : milestone display name
 *   - minPct       : minimum allowed % (PM must assign within this range)
 *   - maxPct       : maximum allowed %
 *   - sortOrder    : display order within the project type
 *
 * Admin configures these in PM Settings → Milestone Templates tab.
 *
 * UAT only — run once:
 *   node backend/migrations/015_create_pm_milestone_templates.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 015] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 015] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_milestone_templates (
      id          INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectType VARCHAR(100)   NOT NULL COMMENT 'Matches pm_project_types.name',
      name        VARCHAR(255)   NOT NULL,
      minPct      DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT 'Min % PM can assign',
      maxPct      DECIMAL(5,2)   NOT NULL DEFAULT 100.00 COMMENT 'Max % PM can assign',
      sortOrder   INT            NOT NULL DEFAULT 0,
      isActive    TINYINT(1)     NOT NULL DEFAULT 1,
      createdAt   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_mst_type (projectType)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_milestone_templates table created (or already exists)');

  // Seed example templates for "Demo Prototype" project type
  // Admin can configure templates for other types from the settings UI
  await sequelize.query(`
    INSERT IGNORE INTO pm_milestone_templates
      (projectType, name, minPct, maxPct, sortOrder) VALUES
      ('Demo Prototype', 'Requirements Gathering', 5,  10, 1),
      ('Demo Prototype', 'Design',                15,  20, 2),
      ('Demo Prototype', 'Development',           50,  60, 3),
      ('Demo Prototype', 'Testing',               10,  15, 4),
      ('Demo Prototype', 'Delivery',               5,  10, 5)
  `);
  console.log('  [+] Example milestone template seeded for "Demo Prototype"');

  // Seed templates for "Signed" project type
  await sequelize.query(`
    INSERT IGNORE INTO pm_milestone_templates
      (projectType, name, minPct, maxPct, sortOrder) VALUES
      ('Signed', 'Kick-off & Requirements', 5,  10, 1),
      ('Signed', 'Design & Architecture',  15,  20, 2),
      ('Signed', 'Development',            50,  60, 3),
      ('Signed', 'Testing & QA',           10,  15, 4),
      ('Signed', 'Deployment & Handover',   5,  10, 5)
  `);
  console.log('  [+] Example milestone template seeded for "Signed"');

  console.log('\n[Migration 015] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 015] FAILED:', err);
  process.exit(1);
});
