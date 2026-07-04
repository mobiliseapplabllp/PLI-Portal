/**
 * refreshQuarterlyItems.js
 * Re-runs createOrUpdateQuarterlyApproval for every DRAFT quarterly approval
 * so monthlyWeightage is corrected to yearlyWt ÷ 12.
 */
require('dotenv').config();
require('../src/models/associations');

const sequelize            = require('../src/config/database');
const QuarterlyApproval    = require('../src/models/QuarterlyApproval');
const User                 = require('../src/models/User');
const { createOrUpdateQuarterlyApproval } = require('../src/services/finalApprover.service');

async function run() {
  await sequelize.authenticate();
  console.log('DB:', process.env.MYSQL_DATABASE, '\n');

  // Find one admin to act as the user context
  const admin = await User.findOne({ where: { role: 'admin', isActive: true } });
  if (!admin) { console.error('No active admin found.'); process.exit(1); }
  console.log('Acting as:', admin.name, '(' + admin.employeeCode + ')\n');

  // Only refresh DRAFT approvals — approved ones are locked
  const approvals = await QuarterlyApproval.findAll({
    where: { status: 'draft' },
    include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode'] }],
  });

  console.log(`Found ${approvals.length} draft approval(s) to refresh.\n`);

  let ok = 0; let failed = 0;
  for (const approval of approvals) {
    const emp = approval.employee;
    process.stdout.write(`  Refreshing ${emp?.name} (${emp?.employeeCode}) ${approval.financialYear} ${approval.quarter} ... `);
    try {
      const result = await createOrUpdateQuarterlyApproval(
        approval.employeeId,
        approval.financialYear,
        approval.quarter,
        admin
      );
      const item = result.items?.[0];
      console.log(`✅  calcScore=${result.calculatedQuarterlyScore}%  monthlyWt[0]=${item?.monthlyWeightage}`);
      ok++;
    } catch (e) {
      console.log(`❌  ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} refreshed, ${failed} failed.`);
  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
