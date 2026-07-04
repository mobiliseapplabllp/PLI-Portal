require('dotenv').config();
require('../src/models/associations');
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');
const User = require('../src/models/User');

async function check() {
  await sequelize.authenticate();
  const emp = await User.findOne({ where: { name: 'SONAM OJHA' } });
  const assignments = await KpiAssignment.findAll({
    where: { employeeId: emp.id, financialYear: '2026-27', month: { [Op.in]: [4, 5, 6] } },
    include: [{ model: KpiItem, as: 'items', attributes: ['id', 'title', 'weightage'] }],
    order: [['month', 'ASC']],
  });
  for (const a of assignments) {
    console.log(`Month ${a.month}: ${a.items.length} items, status=${a.status}`);
    a.items.forEach((i) => console.log(`  ${i.title} wt=${i.weightage}`));
  }
  process.exit(0);
}
check().catch((e) => { console.error(e.message); process.exit(1); });
