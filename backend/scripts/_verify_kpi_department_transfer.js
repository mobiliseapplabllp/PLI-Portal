const { sequelize } = require('../test/_helpers');
const crypto = require('crypto');
const { Op } = require('sequelize');
const Department = require('../src/models/Department');
const User = require('../src/models/User');
const KpiPlan = require('../src/models/KpiPlan');
const KpiPlanItem = require('../src/models/KpiPlanItem');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');
const AuditLog = require('../src/models/AuditLog');
const userService = require('../src/services/user.service');
const kpiPlanService = require('../src/services/kpiPlan.service');
const { KPI_STATUS } = require('../src/config/constants');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

const TEST_FY = '2099-00';
const ALL_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

(async () => {
  let deptOps, deptSales, neha, controlEmp, manager;
  const createdUserIds = [];
  const createdDeptIds = [];
  const createdPlanIds = [];

  try {
    manager = await User.findOne({ where: { isActive: true } });
    if (!manager) throw new Error('Need at least 1 active user in DB as manager');

    deptOps = await Department.create({ code: '__TEST_OPS__', name: '__TEST__ Operations', isActive: true });
    deptSales = await Department.create({ code: '__TEST_SALES__', name: '__TEST__ Sales', isActive: true });
    createdDeptIds.push(deptOps.id, deptSales.id);

    neha = await User.create({
      name: '__TEST__ Neha', email: `__test_neha_${Date.now()}@example.com`,
      employeeCode: `TNEHA${Date.now()}`, role: 'employee', departmentId: deptOps.id,
      managerId: manager.id, isActive: true, kpiReviewApplicable: true,
      passwordHash: 'x',
    });
    controlEmp = await User.create({
      name: '__TEST__ Control', email: `__test_control_${Date.now()}@example.com`,
      employeeCode: `TCTRL${Date.now()}`, role: 'employee', departmentId: deptOps.id,
      managerId: manager.id, isActive: true, kpiReviewApplicable: true,
      passwordHash: 'x',
    });
    createdUserIds.push(neha.id, controlEmp.id);

    const opsPlan = await KpiPlan.create({
      financialYear: TEST_FY, departmentId: deptOps.id, role: null,
      isPublished: true, publishedAt: new Date(), createdById: manager.id,
    });
    const salesPlan = await KpiPlan.create({
      financialYear: TEST_FY, departmentId: deptSales.id, role: null,
      isPublished: true, publishedAt: new Date(), createdById: manager.id,
    });
    createdPlanIds.push(opsPlan.id, salesPlan.id);

    const opsItem = await KpiPlanItem.create({
      kpiPlanId: opsPlan.id, title: 'OPERATIONS TARGET', category: 'Quality',
      unit: 'Number', monthlyWeightage: 100, targetValue: '10',
    });
    const salesItem = await KpiPlanItem.create({
      kpiPlanId: salesPlan.id, title: 'SALES TARGET', category: 'Revenue',
      unit: 'Currency', monthlyWeightage: 100, targetValue: '20',
    });

    // ── Set up Neha: 12 months under Operations, July+Aug finalized, rest uncommitted ──
    for (const emp of [neha, controlEmp]) {
      for (const month of ALL_MONTHS) {
        const status = (emp.id === neha.id && [7, 8].includes(month)) ? KPI_STATUS.FINAL_APPROVED : KPI_STATUS.ASSIGNED;
        const assignment = await KpiAssignment.create({
          financialYear: TEST_FY, month, quarter: month <= 3 ? 'Q4' : (month <= 6 ? 'Q1' : month <= 9 ? 'Q2' : 'Q3'),
          employeeId: emp.id, departmentId: deptOps.id, managerId: manager.id,
          createdById: manager.id, status, totalWeightage: 100,
        });
        await KpiItem.create({
          kpiAssignmentId: assignment.id, kpiPlanItemId: opsItem.id,
          title: opsItem.title, category: opsItem.category, unit: opsItem.unit,
          weightage: 100, targetValue: opsItem.targetValue,
        });
      }
    }

    // Snapshot control employee's state BEFORE the transfer
    const controlBefore = await KpiAssignment.findAll({
      where: { employeeId: controlEmp.id, financialYear: TEST_FY },
      include: [{ model: KpiItem, as: 'items' }],
      order: [['month', 'ASC']],
    });
    const controlBeforeSnapshot = JSON.stringify(controlBefore.map(a => ({
      id: a.id, departmentId: a.departmentId, status: a.status,
      items: a.items.map(i => ({ title: i.title, weightage: i.weightage })),
    })));

    // ═══ THE TRANSFER ═══
    await userService.updateUser(neha.id, { departmentId: deptSales.id }, manager.id);

    // ── Check 1: July & August — completely untouched ──
    const julAug = await KpiAssignment.findAll({
      where: { employeeId: neha.id, financialYear: TEST_FY, month: { [Op.in]: [7, 8] } },
      include: [{ model: KpiItem, as: 'items' }],
    });
    check('July+Aug keep departmentId = Operations (untouched)', julAug.every(a => a.departmentId === deptOps.id));
    check('July+Aug keep status = final_approved (untouched)', julAug.every(a => a.status === KPI_STATUS.FINAL_APPROVED));
    check('July+Aug keep OPERATIONS TARGET item (untouched)', julAug.every(a => a.items.length === 1 && a.items[0].title === 'OPERATIONS TARGET'));

    // ── Check 2: Sept-March — converted to Sales ──
    const unconvertedMonths = ALL_MONTHS.filter(m => ![7, 8].includes(m));
    const converted = await KpiAssignment.findAll({
      where: { employeeId: neha.id, financialYear: TEST_FY, month: { [Op.in]: unconvertedMonths } },
      include: [{ model: KpiItem, as: 'items' }],
    });
    check('all 10 uncommitted months found', converted.length === 10, converted.length);
    check('uncommitted months now departmentId = Sales', converted.every(a => a.departmentId === deptSales.id));
    check('uncommitted months now have SALES TARGET item', converted.every(a => a.items.length === 1 && a.items[0].title === 'SALES TARGET'));
    check('uncommitted months no longer have OPERATIONS TARGET', converted.every(a => !a.items.some(i => i.title === 'OPERATIONS TARGET')));

    // ── Check 3: control employee completely unaffected ──
    const controlAfter = await KpiAssignment.findAll({
      where: { employeeId: controlEmp.id, financialYear: TEST_FY },
      include: [{ model: KpiItem, as: 'items' }],
      order: [['month', 'ASC']],
    });
    const controlAfterSnapshot = JSON.stringify(controlAfter.map(a => ({
      id: a.id, departmentId: a.departmentId, status: a.status,
      items: a.items.map(i => ({ title: i.title, weightage: i.weightage })),
    })));
    check('control employee byte-for-byte unchanged after Neha\'s transfer', controlBeforeSnapshot === controlAfterSnapshot);

    // ── Check 4: audit log recorded ──
    const auditEntry = await AuditLog.findOne({
      where: { entityType: 'user', entityId: neha.id, action: 'department_changed' },
      order: [['createdAt', 'DESC']],
    });
    check('audit log entry created for department_changed', !!auditEntry);

    // ── Check 5: re-triggering a resync (editing Operations plan item) doesn't duplicate/corrupt anyone ──
    await kpiPlanService.updatePlanItem(opsPlan.id, opsItem.id, { monthlyWeightage: 100 }, { id: manager.id, role: 'admin' });
    const controlCountAfterResync = await KpiAssignment.count({ where: { employeeId: controlEmp.id, financialYear: TEST_FY } });
    check('control employee assignment count unchanged after resync (no duplicates)', controlCountAfterResync === 12, controlCountAfterResync);
    const nehaSalesCountAfterResync = await KpiAssignment.count({ where: { employeeId: neha.id, financialYear: TEST_FY, departmentId: deptSales.id } });
    check('Neha\'s Sales months unaffected by an Operations plan resync', nehaSalesCountAfterResync === 10, nehaSalesCountAfterResync);
    const julAugAfterResync = await KpiAssignment.findAll({ where: { employeeId: neha.id, financialYear: TEST_FY, month: { [Op.in]: [7, 8] } } });
    check('Neha\'s July+Aug still untouched after resync', julAugAfterResync.every(a => a.departmentId === deptOps.id && a.status === KPI_STATUS.FINAL_APPROVED));

    // updatePlanItem's resync fires fire-and-forget (pre-existing, not awaited) — let it settle before cleanup.
    await new Promise((r) => setTimeout(r, 1500));

  } finally {
    const assignmentIds = (await KpiAssignment.findAll({ where: { employeeId: { [Op.in]: createdUserIds } }, attributes: ['id'] })).map(a => a.id);
    if (assignmentIds.length) await KpiItem.destroy({ where: { kpiAssignmentId: { [Op.in]: assignmentIds } }, force: true });
    if (createdUserIds.length) await KpiAssignment.destroy({ where: { employeeId: { [Op.in]: createdUserIds } }, force: true });
    if (createdPlanIds.length) await KpiPlanItem.destroy({ where: { kpiPlanId: { [Op.in]: createdPlanIds } }, force: true });
    if (createdPlanIds.length) await KpiPlan.destroy({ where: { id: { [Op.in]: createdPlanIds } }, force: true });
    if (createdUserIds.length) await AuditLog.destroy({ where: { entityId: { [Op.in]: createdUserIds } }, force: true }).catch(() => {});
    if (createdUserIds.length) await User.destroy({ where: { id: { [Op.in]: createdUserIds } }, force: true });
    if (createdDeptIds.length) await Department.destroy({ where: { id: { [Op.in]: createdDeptIds } }, force: true });

    const leakUsers = await User.count({ where: { name: { [Op.like]: '__TEST__%' } } });
    const leakDepts = await Department.count({ where: { code: { [Op.like]: '__TEST_%' } } });
    console.log('Leak check — users:', leakUsers, ' depts:', leakDepts);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
