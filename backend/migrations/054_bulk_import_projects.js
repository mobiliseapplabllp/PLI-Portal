/**
 * Migration 054 — bulk project import (Client + Project Name spreadsheet).
 *
 * - pm_settings.defaultBulkImportProjectTypeId — admin-configurable project type
 *   applied to every bulk-imported (Operations-only) project.
 * - pm_projects.importBatchId / client_organisations.importBatchId — tags every
 *   row created by one import run, so a bad import can be bulk-undone by batch id.
 * - pm_import_logs — one row per import run: who, when, file name, batch id,
 *   and result counts, for an at-a-glance import history.
 *
 * Idempotent: safe to re-run.
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

async function tableExists(table) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
  `, { replacements: [table] });
  return rows[0].cnt > 0;
}

async function run() {
  console.log('=== Migration 054: bulk project import support ===\n');

  if (!(await columnExists('pm_settings', 'defaultBulkImportProjectTypeId'))) {
    await sequelize.query(`ALTER TABLE pm_settings ADD COLUMN defaultBulkImportProjectTypeId INT NULL`);
    console.log('Added pm_settings.defaultBulkImportProjectTypeId');
  } else {
    console.log('pm_settings.defaultBulkImportProjectTypeId already exists — skipping');
  }

  if (!(await columnExists('pm_projects', 'importBatchId'))) {
    await sequelize.query(`ALTER TABLE pm_projects ADD COLUMN importBatchId CHAR(36) NULL`);
    await sequelize.query(`CREATE INDEX idx_pm_projects_import_batch_id ON pm_projects (importBatchId)`);
    console.log('Added pm_projects.importBatchId (+ index)');
  } else {
    console.log('pm_projects.importBatchId already exists — skipping');
  }

  if (!(await columnExists('client_organisations', 'importBatchId'))) {
    await sequelize.query(`ALTER TABLE client_organisations ADD COLUMN importBatchId CHAR(36) NULL`);
    await sequelize.query(`CREATE INDEX idx_client_orgs_import_batch_id ON client_organisations (importBatchId)`);
    console.log('Added client_organisations.importBatchId (+ index)');
  } else {
    console.log('client_organisations.importBatchId already exists — skipping');
  }

  if (!(await tableExists('pm_import_logs'))) {
    await sequelize.query(`
      CREATE TABLE pm_import_logs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        batchId CHAR(36) NOT NULL,
        fileName VARCHAR(255) NULL,
        importedById CHAR(36) NULL,
        orgsCreated INT NOT NULL DEFAULT 0,
        orgsReused INT NOT NULL DEFAULT 0,
        projectsCreated INT NOT NULL DEFAULT 0,
        projectsSkipped INT NOT NULL DEFAULT 0,
        rowErrors JSON NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        createdAt DATETIME NOT NULL,
        updatedAt DATETIME NOT NULL,
        INDEX idx_pm_import_logs_batch_id (batchId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('Created pm_import_logs table');
  } else {
    console.log('pm_import_logs already exists — skipping');
  }

  console.log('\n=== Migration 054 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 054 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
