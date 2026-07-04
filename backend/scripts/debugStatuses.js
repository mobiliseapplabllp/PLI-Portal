require('dotenv').config();
require('../src/models/associations');
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');
const User = require('../src/models/User');

async function check() {
  await sequelize.authenticate();
  const emp = await User.findOne({ where: { name: 'GOURAV SHARMA' } });
  const assignments = await KpiAssignment.findAll({
    where: { employeeId: emp.id, financialYear: '2026-27', month: { [Op.in]: [4, 5, 6] } },
    include: [{ model: KpiItem, as: 'items', attributes: ['title', 'weightage', 'managerStatus'] }],
    order: [['month', 'ASC']],
  });

  for (const a of assignments) {
    console.log(`\nMonth ${a.month} (status=${a.status}):`);
    let totalWt = 0; let totalEarned = 0;
    for (const i of a.items) {
      const wt = parseFloat(i.weightage || 0);
      const monthlyWt = wt / 12;
      const mult = i.managerStatus === 'Exceeds' ? 1.5 : i.managerStatus === 'Below' ? -0.5 : i.managerStatus === 'Meets' ? 1.0 : 0;
      const earned = monthlyWt * mult;
      totalWt += monthlyWt;
      totalEarned += earned;
      console.log(`  ${i.title}: yearlyWt=${wt}% monthlyWt=${monthlyWt.toFixed(4)} status=${i.managerStatus||'null'} mult=${mult} earned=${earned.toFixed(4)}`);
    }
    console.log(`  TOTAL: monthlyWt=${totalWt.toFixed(4)} earned=${totalEarned.toFixed(4)} ratio=${(totalEarned/totalWt*100).toFixed(2)}%`);
  }
  process.exit(0);
}
check().catch((e) => { console.error(e.message); process.exit(1); });
