require('dotenv').config();
const { Op } = require('sequelize');
const sequelize = require('../src/config/database');
const ScoringConfig = require('../src/models/ScoringConfig');
const QuarterlyApproval = require('../src/models/QuarterlyApproval');
const QuarterlyApprovalItem = require('../src/models/QuarterlyApprovalItem');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');
const User = require('../src/models/User');
require('../src/models/associations');

(async () => {
  await sequelize.authenticate();

  // 1. Check scoring configs
  const configs = await ScoringConfig.findAll({ raw: true });
  console.log('=== SCORING CONFIGS ===');
  if (configs.length === 0) {
    console.log('  (none — defaults in use: Meets=1.0, Below=-0.5, Exceeds=1.5)');
  } else {
    configs.forEach(c => console.log(`  FY:${c.financialYear} Q:${c.quarter} Meets:${c.meetsMultiplier} Below:${c.belowMultiplier} Exceeds:${c.exceedsMultiplier} active:${c.isActive}`));
  }

  // 2. Find Anuj
  const anuj = await User.findOne({ where: { name: { [Op.like]: '%ANUJ%' } }, raw: true });
  if (!anuj) { console.log('Anuj not found'); process.exit(); }
  console.log('\n=== ANUJ ===', anuj.id, anuj.name);

  // 3. QuarterlyApproval record
  const qa = await QuarterlyApproval.findOne({ where: { employeeId: anuj.id }, raw: true });
  if (!qa) {
    console.log('No QuarterlyApproval — checking KpiAssignment items directly...');
    const assignments = await KpiAssignment.findAll({
      where: { employeeId: anuj.id, financialYear: '2026-27', month: { [Op.in]: [4,5,6] } },
      raw: true,
    });
    console.log('Assignments:', assignments.map(a => `month:${a.month} status:${a.status}`));
    if (assignments.length > 0) {
      const aId = assignments[0].id;
      const items = await KpiItem.findAll({ where: { kpiAssignmentId: aId }, raw: true });
      console.log('KpiItems for month', assignments[0].month, ':', items.length, 'items');
      items.forEach(i => console.log(`  weightage:${i.weightage} managerStatus:${i.managerStatus} title:${i.title?.slice(0,40)}`));
      const totalMonthlyWt = items.reduce((s,i) => s + parseFloat(i.weightage||0)/12, 0);
      console.log('  totalMonthlyWt (sum wt/12):', totalMonthlyWt.toFixed(4));
    }
    await sequelize.close(); return;
  }
  console.log('QA:', qa.id, 'status:', qa.status);

  // 4. QuarterlyApprovalItems — check stored actuals
  const items = await QuarterlyApprovalItem.findAll({ where: { quarterlyApprovalId: qa.id }, raw: true });
  console.log('\n=== QA ITEMS (' + items.length + ') ===');
  items.forEach(i => {
    console.log(`  "${i.kpiTitle?.slice(0,35)}" monthlyWt:${i.monthlyWeightage} | m1:${i.month1_actual} m2:${i.month2_actual} m3:${i.month3_actual} | calcQtrActual:${i.calculatedQuarterlyActual}`);
  });
  const sumWt  = items.reduce((s,i) => s + parseFloat(i.monthlyWeightage||0), 0);
  const sumM1  = items.reduce((s,i) => s + parseFloat(i.month1_actual||0), 0);
  const sumM2  = items.reduce((s,i) => s + parseFloat(i.month2_actual||0), 0);
  const sumM3  = items.reduce((s,i) => s + parseFloat(i.month3_actual||0), 0);
  const sumCalc = items.reduce((s,i) => s + parseFloat(i.calculatedQuarterlyActual||0), 0);
  console.log('\n=== TOTALS ===');
  console.log('  totalMonthlyWt:', sumWt.toFixed(4));
  console.log('  SUM m1_actual:', sumM1.toFixed(4));
  console.log('  SUM m2_actual:', sumM2.toFixed(4));
  console.log('  SUM m3_actual:', sumM3.toFixed(4));
  console.log('  SUM calcQtrActual:', sumCalc.toFixed(4));
  console.log('  Effective m1 multiplier (earned/possible):', (sumM1/sumWt).toFixed(4));
  console.log('  Effective m2 multiplier (earned/possible):', (sumM2/sumWt).toFixed(4));
  console.log('  Effective m3 multiplier (earned/possible):', (sumM3/sumWt).toFixed(4));
  console.log('  Quarterly score % (system):', ((sumCalc / (sumWt*3)) * 100).toFixed(2) + '%');

  await sequelize.close();
})().catch(e => { console.error(e.message); process.exit(1); });
