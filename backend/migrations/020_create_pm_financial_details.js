/**
 * Migration 020 — Create pm_financial_details table
 *
 * Stores financial information per project (one row per project).
 *
 * UAT only — run once:
 *   node backend/migrations/020_create_pm_financial_details.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function run() {
  console.log('\n[Migration 020] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 020] Connected.\n');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS pm_financial_details (
      id              CHAR(36)        NOT NULL PRIMARY KEY,
      projectId       CHAR(36)        NOT NULL UNIQUE,
      currency        VARCHAR(10)     NOT NULL DEFAULT 'INR',
      budgetAmount    DECIMAL(15,2)   NULL DEFAULT NULL COMMENT 'Approved project budget',
      actualCost      DECIMAL(15,2)   NULL DEFAULT NULL COMMENT 'Actual cost incurred so far',
      invoicedAmount  DECIMAL(15,2)   NULL DEFAULT NULL COMMENT 'Total amount invoiced to client',
      paymentTerms    TEXT            NULL COMMENT 'e.g. Net 30, Milestone-based',
      notes           TEXT            NULL COMMENT 'Additional financial notes',
      updatedById     CHAR(36)        NULL,
      createdAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pm_fin_project (projectId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('  [+] pm_financial_details table created (or already exists)');

  console.log('\n[Migration 020] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 020] FAILED:', err);
  process.exit(1);
});
