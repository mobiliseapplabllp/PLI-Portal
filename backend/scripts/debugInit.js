require('dotenv').config();
require('../src/models/associations');
const User = require('../src/models/User');
const { createOrUpdateQuarterlyApproval } = require('../src/services/finalApprover.service');
const sequelize = require('../src/config/database');

async function run() {
  await sequelize.authenticate();

  const emp = await User.findOne({ where: { employeeCode: 'MLP092' } });
  const admin = await User.findOne({ where: { employeeCode: 'MLP001' } });

  console.log('Employee:', emp?.name, emp?.id);
  console.log('Admin:   ', admin?.name, admin?.id, 'role:', admin?.role);

  try {
    const result = await createOrUpdateQuarterlyApproval(emp.id, '2026-27', 'Q1', admin);
    console.log('\n✅ Success!');
    console.log('  Approval ID:', result.id);
    console.log('  Status:', result.status);
    console.log('  calculatedQuarterlyScore:', result.calculatedQuarterlyScore);
    console.log('  Items count:', result.items?.length);
    if (result.items?.[0]) {
      const i = result.items[0];
      console.log('  First item:', i.kpiTitle);
      console.log('    monthlyWeightage:', i.monthlyWeightage);
      console.log('    calculatedQuarterlyActual:', i.calculatedQuarterlyActual);
      console.log('    quarterlyAchievedWeightage:', i.quarterlyAchievedWeightage);
    }
  } catch (e) {
    console.error('\n❌ Error:', e.message);
    console.error(e.stack);
  }

  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
