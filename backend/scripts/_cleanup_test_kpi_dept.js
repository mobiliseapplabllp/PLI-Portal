const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const Department = require('../src/models/Department');
const User = require('../src/models/User');
const KpiPlan = require('../src/models/KpiPlan');
const KpiPlanItem = require('../src/models/KpiPlanItem');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');
const AuditLog = require('../src/models/AuditLog');

(async () => {
  const users = await User.findAll({ where: { name: { [Op.like]: '__TEST__%' } } });
  const userIds = users.map(u => u.id);
  console.log('Found leftover test users:', userIds.length);

  if (userIds.length) {
    const assignments = await KpiAssignment.findAll({ where: { employeeId: { [Op.in]: userIds } }, attributes: ['id'] });
    const assignmentIds = assignments.map(a => a.id);
    if (assignmentIds.length) await KpiItem.destroy({ where: { kpiAssignmentId: { [Op.in]: assignmentIds } }, force: true });
    await KpiAssignment.destroy({ where: { employeeId: { [Op.in]: userIds } }, force: true });
    await AuditLog.destroy({ where: { entityId: { [Op.in]: userIds } }, force: true }).catch(() => {});
  }

  const depts = await Department.findAll({ where: { code: { [Op.like]: '__TEST_%' } } });
  const deptIds = depts.map(d => d.id);
  console.log('Found leftover test departments:', deptIds.length);

  if (deptIds.length) {
    const plans = await KpiPlan.findAll({ where: { departmentId: { [Op.in]: deptIds } }, attributes: ['id'] });
    const planIds = plans.map(p => p.id);
    if (planIds.length) {
      await KpiPlanItem.destroy({ where: { kpiPlanId: { [Op.in]: planIds } }, force: true });
      await KpiPlan.destroy({ where: { id: { [Op.in]: planIds } }, force: true });
    }
  }

  if (userIds.length) await User.destroy({ where: { id: { [Op.in]: userIds } }, force: true });
  if (deptIds.length) await Department.destroy({ where: { id: { [Op.in]: deptIds } }, force: true });

  const remainingUsers = await User.count({ where: { name: { [Op.like]: '__TEST__%' } } });
  const remainingDepts = await Department.count({ where: { code: { [Op.like]: '__TEST_%' } } });
  console.log('Remaining after cleanup — users:', remainingUsers, 'depts:', remainingDepts);
  await sequelize.close();
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
