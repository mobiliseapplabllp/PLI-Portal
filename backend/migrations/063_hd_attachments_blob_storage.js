/**
 * Migration 063 — switch hd_attachments to blob storage, going forward.
 *
 * Same pattern as migration 061 (hd_documents): adds a nullable file_blob
 * LONGBLOB column. New uploads (conversation-reply attachments, via
 * attachment.controller.js / conversation.controller.js) store bytes
 * directly in the database instead of writing to disk under uploads/.
 *
 * Existing rows (file on disk, stored_name set, file_blob NULL) are left
 * completely untouched. The serve endpoint checks file_blob first, falls
 * back to the disk file exactly as before — old attachments keep working
 * forever, only new uploads change path.
 *
 * stored_name is relaxed to nullable, since a blob-stored row has no file
 * on disk to name.
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
  console.log('=== Migration 063: hd_attachments blob storage ===\n');

  if (!(await columnExists('hd_attachments', 'file_blob'))) {
    await sequelize.query(`
      ALTER TABLE hd_attachments
      ADD COLUMN file_blob LONGBLOB NULL COMMENT 'New uploads store bytes here. NULL = legacy row, read from disk via stored_name instead.'
    `);
    console.log('Added hd_attachments.file_blob');
  } else {
    console.log('hd_attachments.file_blob already exists — skipping');
  }

  if (!(await isNullable('hd_attachments', 'stored_name'))) {
    await sequelize.query(`ALTER TABLE hd_attachments MODIFY stored_name VARCHAR(300) NULL`);
    console.log('Relaxed hd_attachments.stored_name to nullable');
  } else {
    console.log('hd_attachments.stored_name already nullable — skipping');
  }

  console.log('\n=== Migration 063 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 063 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
