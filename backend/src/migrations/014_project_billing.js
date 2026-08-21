/**
 * Migration 014 — Project billing + Finance role
 *
 * 1. users.role gains 'finance' (kept alongside the legacy 'miscellaneous' value)
 * 2. pm_projects gains the billing fields:
 *      isBillable, isBilled, invoiceNumber, billedDate, billedById, billedAt
 * 3. Repairs notifications.type / referenceType.
 *    The live enums were frozen at the original 9 KPI values while the code grew
 *    to 20, so every PM, CSAT, scoring-config (and now billing) notification was
 *    being rejected by MySQL and swallowed by notification.service's catch —
 *    silently delivering nothing. Both enums are rebuilt from constants here.
 *
 * Idempotent — safe to re-run. Usage: node backend/src/migrations/014_project_billing.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const sequelize = require('../config/database');
const { NOTIFICATION_TYPES } = require('../config/constants');

const quote = (values) => values.map((v) => `'${v}'`).join(',');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [table, column] }
  );
  return rows[0].n > 0;
}

const addColumn = async (table, column, ddl) => {
  if (await columnExists(table, column)) {
    console.log(`  ${table}.${column} already exists — skip`);
    return;
  }
  await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  ✓ ${table}.${column}`);
};

async function up() {
  console.log('— Migration 014: Project billing + Finance role —');

  // 1. Finance role. Existing values are preserved verbatim so no row is orphaned.
  const [[roleCol]] = await sequelize.query(`SHOW COLUMNS FROM users LIKE 'role'`);
  const existingRoles = roleCol.Type.replace(/^enum\(|\)$/g, '').split(',').map((v) => v.replace(/'/g, ''));
  if (existingRoles.includes('finance')) {
    console.log('  users.role already has finance — skip');
  } else {
    const next = [...existingRoles, 'finance'];
    await sequelize.query(`ALTER TABLE users MODIFY COLUMN role ENUM(${quote(next)}) NOT NULL DEFAULT 'employee'`);
    console.log(`  ✓ users.role += finance (${next.length} roles)`);
  }

  // 2. Billing fields on projects
  await addColumn('pm_projects', 'isBillable', 'isBillable TINYINT(1) NOT NULL DEFAULT 0 AFTER notifyClient');
  await addColumn('pm_projects', 'isBilled', 'isBilled TINYINT(1) NOT NULL DEFAULT 0 AFTER isBillable');
  await addColumn('pm_projects', 'invoiceNumber', 'invoiceNumber VARCHAR(64) NULL AFTER isBilled');
  await addColumn('pm_projects', 'billedDate', 'billedDate DATE NULL AFTER invoiceNumber');
  await addColumn(
    'pm_projects',
    'billedById',
    'billedById CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL AFTER billedDate'
  );
  await addColumn('pm_projects', 'billedAt', 'billedAt DATETIME NULL AFTER billedById');

  const [[fk]] = await sequelize.query(
    `SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pm_projects' AND CONSTRAINT_NAME = 'fk_pmp_billedBy'`
  );
  if (fk.n === 0) {
    await sequelize.query(
      `ALTER TABLE pm_projects ADD CONSTRAINT fk_pmp_billedBy
       FOREIGN KEY (billedById) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE`
    );
    console.log('  ✓ pm_projects.billedById → users.id');
  } else {
    console.log('  fk_pmp_billedBy already exists — skip');
  }

  // 3. Repair the notification enums (they were 11 values behind the code)
  const types = Object.values(NOTIFICATION_TYPES);
  await sequelize.query(`ALTER TABLE notifications MODIFY COLUMN type ENUM(${quote(types)}) NOT NULL`);
  console.log(`  ✓ notifications.type rebuilt with ${types.length} values (was 9 — PM/CSAT/scoring/billing alerts were being dropped)`);

  const refTypes = ['kpi_assignment', 'appraisal_cycle', 'user', 'pm_project', 'survey_dispatch', 'roster_week'];
  await sequelize.query(`ALTER TABLE notifications MODIFY COLUMN referenceType ENUM(${quote(refTypes)}) NULL`);
  console.log(`  ✓ notifications.referenceType rebuilt with ${refTypes.length} values`);

  console.log('— Migration 014 complete —');
}

up()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration 014 FAILED:', err.message);
    process.exit(1);
  });
