/**
 * Migration 005 — Production Schema Additions
 *
 * Adds all columns that exist in models but may not yet be in the production DB.
 * Every ALTER uses addColumnIfMissing — safe to re-run, skips already-existing columns.
 *
 * RUN ONCE on production BEFORE deploying new backend code:
 *   node backend/migrations/005_production_schema_additions.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function addColumnIfMissing(table, column, definition) {
  try {
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${definition}`);
    console.log(`  [+] ${table}.${column}`);
  } catch (err) {
    if (err.message.includes('Duplicate column name')) {
      console.log(`  [=] ${table}.${column} — already exists, skipped`);
    } else {
      throw err;
    }
  }
}

async function run() {
  console.log('\n[Migration 005] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 005] Connected.\n');

  // ── kpi_items ──────────────────────────────────────────────────────────────
  console.log('--- kpi_items ---');

  // Quarterly weightage (annual / 4)
  await addColumnIfMissing('kpi_items', 'quarterlyWeightage', 'DECIMAL(10,2) NULL AFTER weightage');

  // Commitment fields
  await addColumnIfMissing('kpi_items', 'commitValue',               'TEXT NULL');
  await addColumnIfMissing('kpi_items', 'employeeCommitmentStatus',  "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('kpi_items', 'employeeCommitmentComment', 'TEXT NULL');
  await addColumnIfMissing('kpi_items', 'committedAt',               'DATETIME NULL');

  // Manager commitment review
  await addColumnIfMissing('kpi_items', 'managerCommitmentApproval', "ENUM('approved','rejected') NULL");
  await addColumnIfMissing('kpi_items', 'managerCommitmentComment',  'TEXT NULL');

  // Employee self-review achievement
  await addColumnIfMissing('kpi_items', 'employeeStatus',  "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('kpi_items', 'employeeComment', 'TEXT NULL');

  // Manager review
  await addColumnIfMissing('kpi_items', 'managerStatus',         "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('kpi_items', 'managerComment',        'TEXT NULL');
  await addColumnIfMissing('kpi_items', 'managerMonthlyNumeric', 'TINYINT NULL');

  // Final approver monthly fields
  await addColumnIfMissing('kpi_items', 'finalApproverStatus',             "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('kpi_items', 'finalApproverValue',              'DECIMAL(14,4) NULL');
  await addColumnIfMissing('kpi_items', 'finalApproverAchievedWeightage',  'DECIMAL(10,2) NULL');
  await addColumnIfMissing('kpi_items', 'finalApproverComment',            'TEXT NULL');
  await addColumnIfMissing('kpi_items', 'finalApprovedAt',                 'DATETIME NULL');
  await addColumnIfMissing('kpi_items', 'finalApprovedById',               'CHAR(36) NULL');

  // Plan item reference
  await addColumnIfMissing('kpi_items', 'kpiPlanItemId', 'CHAR(36) NULL');

  // Per-item self-review attachment (LONGBLOB for binary storage)
  await addColumnIfMissing('kpi_items', 'selfReviewAttachmentBlob', 'LONGBLOB NULL');
  await addColumnIfMissing('kpi_items', 'selfReviewAttachmentName', 'VARCHAR(255) NULL');
  await addColumnIfMissing('kpi_items', 'selfReviewAttachmentMime', 'VARCHAR(128) NULL');

  // ── kpi_assignments ────────────────────────────────────────────────────────
  console.log('\n--- kpi_assignments ---');

  // Assignment-level attachments (employee + manager)
  await addColumnIfMissing('kpi_assignments', 'employeeAttachmentBlob', 'LONGBLOB NULL');
  await addColumnIfMissing('kpi_assignments', 'employeeAttachmentName', 'VARCHAR(255) NULL');
  await addColumnIfMissing('kpi_assignments', 'employeeAttachmentMime', 'VARCHAR(128) NULL');
  await addColumnIfMissing('kpi_assignments', 'managerAttachmentBlob',  'LONGBLOB NULL');
  await addColumnIfMissing('kpi_assignments', 'managerAttachmentName',  'VARCHAR(255) NULL');
  await addColumnIfMissing('kpi_assignments', 'managerAttachmentMime',  'VARCHAR(128) NULL');

  // Self-review revert audit fields (also covered by migration 004 — safe to re-run)
  await addColumnIfMissing('kpi_assignments', 'selfReviewRevertComment',  'TEXT NULL');
  await addColumnIfMissing('kpi_assignments', 'selfReviewRevertedById',   'CHAR(36) NULL');
  await addColumnIfMissing('kpi_assignments', 'selfReviewRevertedAt',     'DATETIME NULL');

  // Score and timestamps
  await addColumnIfMissing('kpi_assignments', 'monthlyWeightedScore', 'DECIMAL(10,4) NULL');
  await addColumnIfMissing('kpi_assignments', 'employeeSubmittedAt',  'DATETIME NULL');
  await addColumnIfMissing('kpi_assignments', 'managerReviewedAt',    'DATETIME NULL');
  await addColumnIfMissing('kpi_assignments', 'finalApprovedAt',      'DATETIME NULL');
  await addColumnIfMissing('kpi_assignments', 'committedAt',          'DATETIME NULL');
  await addColumnIfMissing('kpi_assignments', 'lockedAt',             'DATETIME NULL');
  await addColumnIfMissing('kpi_assignments', 'lockedById',           'CHAR(36) NULL');

  // ── quarterly_approval_items ───────────────────────────────────────────────
  console.log('\n--- quarterly_approval_items ---');

  await addColumnIfMissing('quarterly_approval_items', 'kpiHead',                   'VARCHAR(64) NULL');
  await addColumnIfMissing('quarterly_approval_items', 'kpiPlanItemId',             'CHAR(36) NULL');
  await addColumnIfMissing('quarterly_approval_items', 'month1_managerStatus',      "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('quarterly_approval_items', 'month2_managerStatus',      "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('quarterly_approval_items', 'month3_managerStatus',      "ENUM('Meets','Exceeds','Below') NULL");
  await addColumnIfMissing('quarterly_approval_items', 'month1_numeric',            'TINYINT NULL');
  await addColumnIfMissing('quarterly_approval_items', 'month2_numeric',            'TINYINT NULL');
  await addColumnIfMissing('quarterly_approval_items', 'month3_numeric',            'TINYINT NULL');
  await addColumnIfMissing('quarterly_approval_items', 'quarterlyNumericSum',       'TINYINT NULL');
  await addColumnIfMissing('quarterly_approval_items', 'isAutoCalculated',          'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('quarterly_approval_items', 'month1_actual',             'DECIMAL(10,4) NULL');
  await addColumnIfMissing('quarterly_approval_items', 'month2_actual',             'DECIMAL(10,4) NULL');
  await addColumnIfMissing('quarterly_approval_items', 'month3_actual',             'DECIMAL(10,4) NULL');
  await addColumnIfMissing('quarterly_approval_items', 'calculatedQuarterlyActual', 'DECIMAL(10,4) NULL');

  // ── quarterly_approvals ────────────────────────────────────────────────────
  console.log('\n--- quarterly_approvals ---');

  await addColumnIfMissing('quarterly_approvals', 'calculatedQuarterlyScore', 'DECIMAL(10,4) NULL');
  await addColumnIfMissing('quarterly_approvals', 'departmentId',             'CHAR(36) NULL');
  // scoringConfigId is in 20260713_scoring_config_fy_only.sql — safe to re-run
  await addColumnIfMissing('quarterly_approvals', 'scoringConfigId',          'CHAR(36) NULL');

  // ── scoring_configs (new table — create if not exists) ─────────────────────
  console.log('\n--- scoring_configs ---');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS scoring_configs (
      id              CHAR(36)       NOT NULL PRIMARY KEY,
      financialYear   VARCHAR(16)    NOT NULL,
      meetsMultiplier   DECIMAL(6,3) NOT NULL DEFAULT 1.000,
      belowMultiplier   DECIMAL(6,3) NOT NULL DEFAULT -0.500,
      exceedsMultiplier DECIMAL(6,3) NOT NULL DEFAULT 1.500,
      isActive        TINYINT(1)     NOT NULL DEFAULT 1,
      createdById     CHAR(36)       NULL,
      createdAt       DATETIME       NOT NULL,
      updatedAt       DATETIME       NOT NULL,
      UNIQUE KEY uq_scoring_config_fy (financialYear)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log('  [=] scoring_configs table ensured');

  console.log('\n[Migration 005] Completed successfully.\n');
  await sequelize.close();
}

run().catch((err) => {
  console.error('\n[Migration 005] FAILED:', err.message);
  process.exit(1);
});
