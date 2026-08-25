/**
 * Migration 012 — Alter pm_projects for PM Module Redesign
 *
 * Changes:
 *  1. ADD billingType  (copy existing projectType Billable/Non-Billable values)
 *  2. MODIFY projectType → VARCHAR(100)  (repurpose for Signed/Unsigned/Contract/Demo)
 *  3. ADD accountManagerId (copy from ownerId — rename label only)
 *  4. MODIFY status → VARCHAR(100) + migrate existing ENUM values to new labels
 *
 * UAT only — run once:
 *   node backend/migrations/012_alter_pm_projects.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function columnExists(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = '${table}'
      AND COLUMN_NAME  = '${column}'
  `);
  return rows[0].cnt > 0;
}

async function getColumnType(table, column) {
  const [rows] = await sequelize.query(`
    SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = '${table}'
      AND COLUMN_NAME  = '${column}'
    LIMIT 1
  `);
  return rows[0] ? rows[0].COLUMN_TYPE : null;
}

async function run() {
  console.log('\n[Migration 012] Connecting...');
  await sequelize.authenticate();
  console.log('[Migration 012] Connected.\n');

  // ── Step 1: ADD billingType column ─────────────────────────────────────────
  if (await columnExists('pm_projects', 'billingType')) {
    console.log('  [~] billingType already exists — skipping add');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_projects
      ADD COLUMN billingType ENUM('Billable','Non-Billable') NOT NULL DEFAULT 'Non-Billable'
      AFTER status
    `);
    console.log('  [+] billingType column added');

    // Copy existing projectType (Billable/Non-Billable) values → billingType
    await sequelize.query(`
      UPDATE pm_projects
      SET billingType = projectType
      WHERE projectType IN ('Billable', 'Non-Billable')
    `);
    console.log('  [+] billingType values copied from projectType');
  }

  // ── Step 2: MODIFY projectType from ENUM → VARCHAR(100) ───────────────────
  const ptType = await getColumnType('pm_projects', 'projectType');
  if (ptType && ptType.toLowerCase().startsWith('enum')) {
    await sequelize.query(`
      ALTER TABLE pm_projects
      MODIFY COLUMN projectType VARCHAR(100) NULL DEFAULT NULL
    `);
    // Clear old Billable/Non-Billable values — now stored in billingType
    await sequelize.query(`
      UPDATE pm_projects
      SET projectType = NULL
      WHERE projectType IN ('Billable', 'Non-Billable')
    `);
    console.log('  [+] projectType changed to VARCHAR(100) and old values cleared');
  } else {
    console.log('  [~] projectType already VARCHAR — skipping modify');
  }

  // ── Step 3: ADD accountManagerId (copy from ownerId) ──────────────────────
  if (await columnExists('pm_projects', 'accountManagerId')) {
    console.log('  [~] accountManagerId already exists — skipping add');
  } else {
    await sequelize.query(`
      ALTER TABLE pm_projects
      ADD COLUMN accountManagerId CHAR(36) NULL DEFAULT NULL
      AFTER managerId
    `);
    await sequelize.query(`
      UPDATE pm_projects SET accountManagerId = ownerId WHERE ownerId IS NOT NULL
    `);
    console.log('  [+] accountManagerId added and populated from ownerId');
  }

  // ── Step 4: MODIFY status ENUM → VARCHAR(100) + migrate values ────────────
  const stType = await getColumnType('pm_projects', 'status');
  if (stType && stType.toLowerCase().startsWith('enum')) {
    await sequelize.query(`
      ALTER TABLE pm_projects
      MODIFY COLUMN status VARCHAR(100) NOT NULL DEFAULT 'Yet to Start'
    `);
    console.log('  [+] status changed to VARCHAR(100)');

    // Migrate existing ENUM values to new display labels
    await sequelize.query(`
      UPDATE pm_projects SET status = 'Yet to Start' WHERE status = 'planning'
    `);
    await sequelize.query(`
      UPDATE pm_projects SET status = 'Active'       WHERE status = 'active'
    `);
    await sequelize.query(`
      UPDATE pm_projects SET status = 'On Hold'      WHERE status = 'on_hold'
    `);
    await sequelize.query(`
      UPDATE pm_projects SET status = 'Completed'    WHERE status = 'completed'
    `);
    await sequelize.query(`
      UPDATE pm_projects SET status = 'Cancelled'    WHERE status = 'cancelled'
    `);
    console.log('  [+] Existing status values migrated to new labels');
  } else {
    console.log('  [~] status already VARCHAR — skipping modify');
  }

  // ── Step 5: Make endDate nullable (safety check) ──────────────────────────
  const edType = await getColumnType('pm_projects', 'endDate');
  if (edType && edType.includes('NOT NULL')) {
    await sequelize.query(`ALTER TABLE pm_projects MODIFY COLUMN endDate DATE NULL`);
    console.log('  [+] endDate made nullable');
  } else {
    console.log('  [~] endDate already nullable — skipping');
  }

  console.log('\n[Migration 012] Done.\n');
  await sequelize.close();
}

run().catch(err => {
  console.error('[Migration 012] FAILED:', err);
  process.exit(1);
});
