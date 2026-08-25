/**
 * Migration 008 — Create pm_documents table
 *
 * Stores metadata for documents attached to PM projects or milestones.
 * Files themselves live on disk under UPLOAD_DIR (default: uploads/).
 *
 * RUN ONCE before deploying new backend code:
 *   node backend/migrations/008_create_pm_documents.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 008] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 008] Connected.\n');

  console.log('--- pm_documents ---');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_documents (
      id             CHAR(36)     NOT NULL PRIMARY KEY,
      entity_type    ENUM('project','milestone') NOT NULL,
      entity_id      CHAR(36)     NOT NULL,
      category       ENUM('Contract','SOW','Deliverable','Invoice','Meeting Notes','Other')
                                  NOT NULL DEFAULT 'Other',
      filename       VARCHAR(255) NOT NULL COMMENT 'Original filename from the uploader',
      stored_name    VARCHAR(255) NOT NULL COMMENT 'UUID-based filename on disk',
      mime_type      VARCHAR(100) NULL,
      size_bytes     INT          NULL,
      uploaded_by_id CHAR(36)     NULL,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_documents_entity (entity_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('  [+] pm_documents table created (or already exists)');
  console.log('\n[Migration 008] Done.\n');
  await sequelize.close();
}

run().catch((err) => {
  console.error('[Migration 008] FAILED:', err);
  process.exit(1);
});
