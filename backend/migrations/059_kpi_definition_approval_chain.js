/**
 * Migration 059 — multi-stage KPI definition approval chain.
 *
 * Today, a publish request has exactly ONE approver (the department's
 * Approver, or admin as fallback). This adds support for a CHAIN of
 * approvers, built from the existing kpi_definers.grantedById links:
 *
 *   Admin grants Renosh Definer rights for Sales (directly).
 *   Renosh sub-grants Neha Definer rights for Sales.
 *   Neha publishes  -> chain = [Renosh, admin]. Renosh approves first,
 *                       THEN admin gives the final sign-off that actually
 *                       publishes. Admin's approval always finalizes
 *                       immediately regardless of chain position.
 *   Renosh publishes -> chain = [] (Renosh was granted directly by admin,
 *                       so there's no intermediate stage) -> admin only.
 *
 * Purely additive — 2 new nullable columns on kpi_definition_change_requests.
 * Existing rows (currentStage defaults to 0, approvalChain defaults to an
 * empty array) behave exactly as the old single-approver model did.
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

async function run() {
  console.log('=== Migration 059: KPI definition approval chain ===\n');

  if (!(await columnExists('kpi_definition_change_requests', 'approvalChain'))) {
    await sequelize.query(`
      ALTER TABLE kpi_definition_change_requests
      ADD COLUMN approvalChain JSON NULL COMMENT 'ordered list of intermediate approver user ids; admin is always the implicit final stage'
    `);
    console.log('Added kpi_definition_change_requests.approvalChain');
  } else {
    console.log('kpi_definition_change_requests.approvalChain already exists — skipping');
  }

  if (!(await columnExists('kpi_definition_change_requests', 'currentStage'))) {
    await sequelize.query(`
      ALTER TABLE kpi_definition_change_requests
      ADD COLUMN currentStage INT NOT NULL DEFAULT 0 COMMENT 'index into approvalChain; reaching the end means only admin can finalize'
    `);
    console.log('Added kpi_definition_change_requests.currentStage');
  } else {
    console.log('kpi_definition_change_requests.currentStage already exists — skipping');
  }

  console.log('\n=== Migration 059 complete ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Migration 059 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
