/**
 * Phase 1 Verification — confirms all migration 012-021 changes are in place
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const sequelize = require('../src/config/database');

async function tableExists(name) {
  const [r] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${name}'`
  );
  return r[0].cnt > 0;
}
async function columnExists(table, col) {
  const [r] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='${table}' AND COLUMN_NAME='${col}'`
  );
  return r[0].cnt > 0;
}

async function run() {
  await sequelize.authenticate();
  console.log('\n=== PHASE 1 VERIFICATION ===\n');

  const checks = [
    // Migration 012
    { label: 'pm_projects.billingType',       ok: await columnExists('pm_projects', 'billingType') },
    { label: 'pm_projects.accountManagerId',  ok: await columnExists('pm_projects', 'accountManagerId') },
    // Migration 013
    { label: 'pm_project_types table',        ok: await tableExists('pm_project_types') },
    // Migration 014
    { label: 'pm_statuses table',             ok: await tableExists('pm_statuses') },
    // Migration 015
    { label: 'pm_milestone_templates table',  ok: await tableExists('pm_milestone_templates') },
    // Migration 016
    { label: 'pm_milestones.parentMilestoneId', ok: await columnExists('pm_milestones', 'parentMilestoneId') },
    { label: 'pm_milestones.isDefault',         ok: await columnExists('pm_milestones', 'isDefault') },
    { label: 'pm_milestones.weightPercentage',  ok: await columnExists('pm_milestones', 'weightPercentage') },
    { label: 'pm_milestones.minPct',            ok: await columnExists('pm_milestones', 'minPct') },
    { label: 'pm_milestones.maxPct',            ok: await columnExists('pm_milestones', 'maxPct') },
    // Migration 017 (backward compat)
    { label: 'pm_milestones backward compat (isDefault rows)', ok: null },
    // Migration 018
    { label: 'pm_status_reports table',       ok: await tableExists('pm_status_reports') },
    // Migration 019
    { label: 'pm_raid_items table',           ok: await tableExists('pm_raid_items') },
    // Migration 020
    { label: 'pm_financial_details table',    ok: await tableExists('pm_financial_details') },
    // Migration 021
    { label: 'pm_closure table',              ok: await tableExists('pm_closure') },
  ];

  // Check backward compat
  const [bcRows] = await sequelize.query(
    `SELECT COUNT(*) AS cnt FROM pm_milestones WHERE isDefault = 1`
  );
  checks.find(c => c.label.includes('backward')).ok = bcRows[0].cnt > 0;

  let pass = 0, fail = 0;
  checks.forEach(c => {
    const icon = c.ok ? '✅' : '❌';
    console.log(`  ${icon}  ${c.label}`);
    c.ok ? pass++ : fail++;
  });

  // Show seeded data counts
  const [ptCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM pm_project_types WHERE isActive=1');
  const [stCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM pm_statuses WHERE isActive=1');
  const [mtCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM pm_milestone_templates WHERE isActive=1');
  const [bcCount] = await sequelize.query('SELECT COUNT(*) AS cnt FROM pm_milestones WHERE isDefault=1');
  const [pjStatus] = await sequelize.query('SELECT status, COUNT(*) AS cnt FROM pm_projects GROUP BY status');

  console.log('\n--- Seeded Data ---');
  console.log(`  Project Types seeded:         ${ptCount[0].cnt}`);
  console.log(`  Project Statuses seeded:      ${stCount[0].cnt}`);
  console.log(`  Milestone Templates seeded:   ${mtCount[0].cnt}`);
  console.log(`  Default milestones created:   ${bcCount[0].cnt} (backward compat)`);
  console.log('  Project status distribution:');
  pjStatus.forEach(r => console.log(`    ${r.status}: ${r.cnt}`));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`);
  await sequelize.close();
}
run().catch(e => { console.error(e.message); process.exit(1); });
