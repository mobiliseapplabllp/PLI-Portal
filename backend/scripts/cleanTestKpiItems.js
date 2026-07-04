/**
 * cleanTestKpiItems.js
 * Removes "Test KPI - XXXX" items from monthly KPI assignments that already
 * have real KPI items, so quarterly totals reflect only actual business KPIs.
 */
require('dotenv').config();
require('../src/models/associations');
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');

async function run() {
  await sequelize.authenticate();
  console.log('DB:', process.env.MYSQL_DATABASE, '\n');

  // Find assignments where BOTH test items AND real items coexist
  const assignments = await KpiAssignment.findAll({
    where: { financialYear: '2026-27' },
    include: [{ model: KpiItem, as: 'items', attributes: ['id', 'title', 'weightage'] }],
  });

  let totalDeleted = 0;
  for (const a of assignments) {
    const testItems = a.items.filter((i) => /^Test KPI\s*-\s*\d+/.test(i.title));
    const realItems = a.items.filter((i) => !/^Test KPI\s*-\s*\d+/.test(i.title));

    if (testItems.length === 0 || realItems.length === 0) continue;

    const ids = testItems.map((i) => i.id);
    await KpiItem.destroy({ where: { id: { [Op.in]: ids } } });
    console.log(`  Assignment ${a.id} (month=${a.month}): removed ${testItems.length} test items, kept ${realItems.length} real items`);
    totalDeleted += testItems.length;
  }

  console.log(`\nDone. ${totalDeleted} test KPI items removed.`);
  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
