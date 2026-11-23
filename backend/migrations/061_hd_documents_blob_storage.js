/**
 * Migration 061 — switch hd_documents to blob storage, going forward.
 *
 * Adds a nullable `file_blob` LONGBLOB column — new uploads store the file's
 * bytes directly in the database (same pattern already used for KPI
 * assignment attachments: employeeAttachmentBlob/managerAttachmentBlob on
 * kpi_assignments), instead of writing to disk under uploads/.
 *
 * Existing rows (file on disk, stored_name set, file_blob NULL) are left
 * completely untouched — nothing is migrated, nothing on disk is read or
 * moved. The download endpoint serves from file_blob when present,
 * otherwise falls back to the disk file exactly as it does today. Old
 * documents keep working forever; only new uploads change path.
 *
 * `stored_name` is relaxed to nullable, since a new blob-stored row has no
 * file on disk to name.
 *
 * Schema-only — never touches existing row data. Idempotent: safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0].cnt > 0;
}

async function isNullable(table, column) {
  const [rows] = await sequelize.query(`
    SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, { replacements: [table, column] });
  return rows[0]?.IS_NULLABLE === 'YES';
}

async function run() {
  console.log('=== Migration 061: hd_documents blob storage ===\n');

  if (!(await columnExists('hd_documents', 'file_blob'))) {
    await sequelize.query(`
      ALTER TABLE hd_documents
      ADD COLUMN file_blob LONGBLOB NULL COMMENT 'New uploads store bytes here. NULL = legacy row, read from disk via stored_name instead.'
    `);
    console.log('Added hd_documents.file_blob');
  } else {
    console.log('hd_documents.file_blob already exists — skipping');
  }

  if (!(await isNullable('hd_documents', 'stored_name'))) {
    await sequelize.query(`ALTER TABLE hd_documents MODIFY stored_name VARCHAR(255) NULL`);
    console.log('Relaxed hd_documents.stored_name to nullable');
  } else {
    console.log('hd_documents.stored_name already nullable — skipping');
  }

  console.log('\n=== Migration 061 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 061 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
