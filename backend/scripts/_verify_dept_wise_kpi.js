const { sequelize } = require('../test/_helpers');
const cycleService = require('../src/services/cycle.service');
const scoringConfigService = require('../src/services/scoringConfig.service');
const kpiAssignmentService = require('../src/services/kpiAssignment.service');
const AppraisalCycle = require('../src/models/AppraisalCycle');
const ScoringConfig = require('../src/models/ScoringConfig');
const KpiAssignment = require('../src/models/KpiAssignment');
const Department = require('../src/models/Department');
const User = require('../src/models/User');
const { Op } = require('sequelize');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

const TEST_FY = '2099-00'; // impossible real FY, safe to use + easy to clean up

(async () => {
  const [deptRows] = await sequelize.query(
    "SELECT departmentId, COUNT(*) AS cnt FROM users WHERE isActive=1 AND departmentId IS NOT NULL GROUP BY departmentId HAVING cnt > 0 ORDER BY cnt DESC LIMIT 2"
  );
  if (deptRows.length < 2) throw new Error('Need at least 2 departments with active employees in DB to test');
  const deptA = await Department.findByPk(deptRows[0].departmentId);
  const deptB = await Department.findByPk(deptRows[1].departmentId);

  const empA = await User.findOne({ where: { departmentId: deptA.id, isActive: true, kpiReviewApplicable: true }, attributes: ['id', 'name', 'departmentId', 'kpiReviewApplicable'] });
  if (!empA) throw new Error(`No active + kpiReviewApplicable employee found in department ${deptA.name}`);
  console.log('DEBUG empA =', empA.id, empA.name, 'dept=', empA.departmentId, 'kpiReviewApplicable=', empA.kpiReviewApplicable);

  const createdCycleIds = [];
  const createdConfigIds = [];
  const createdAssignmentIds = [];

  try {
    // ═══ 1. cycleService.resolveCycleForDepartment — core fallback logic ═══
    const globalCycle = await AppraisalCycle.create({
      financialYear: TEST_FY, month: 1, departmentId: null, quarter: 'Q1',
      commitmentDeadline: '2020-01-01', // in the past — deliberately, to prove resolution not enforcement here
    });
    createdCycleIds.push(globalCycle.id);

    const resolvedNoOverride = await cycleService.resolveCycleForDepartment(TEST_FY, 1, deptA.id);
    check('no dept-specific cycle -> resolves to global', resolvedNoOverride?.id === globalCycle.id);

    const deptCycle = await AppraisalCycle.create({
      financialYear: TEST_FY, month: 1, departmentId: deptA.id, quarter: 'Q1',
      commitmentDeadline: '2099-12-31',
    });
    createdCycleIds.push(deptCycle.id);

    const resolvedWithOverride = await cycleService.resolveCycleForDepartment(TEST_FY, 1, deptA.id);
    check('dept-specific cycle exists -> resolves to it, not global', resolvedWithOverride?.id === deptCycle.id);

    // ═══ 1b. updateCycle — editing departmentId on an existing cycle ═══
    let blockedMoveToOccupiedSlot = false;
    try {
      // deptCycle is already departmentId=deptA for (TEST_FY, month 1). Try moving
      // globalCycle (same FY+month) to deptA too -> should conflict with deptCycle.
      await cycleService.updateCycle(globalCycle.id, { departmentId: deptA.id }, empA.id);
    } catch (e) { blockedMoveToOccupiedSlot = e.constructor.name === 'ConflictError' || /already exists/.test(e.message); }
    check('updateCycle: moving a cycle onto an occupied (FY,month,dept) slot -> blocked', blockedMoveToOccupiedSlot);

    const movedCycle = await cycleService.updateCycle(deptCycle.id, { departmentId: deptB.id }, empA.id);
    check('updateCycle: moving to a FREE department slot -> succeeds', movedCycle.departmentId === deptB.id);

    const resolvedAfterMove = await cycleService.resolveCycleForDepartment(TEST_FY, 1, deptB.id);
    check('after move, deptB now resolves to the moved cycle', resolvedAfterMove?.id === deptCycle.id);
    const resolvedDeptANowGlobal = await cycleService.resolveCycleForDepartment(TEST_FY, 1, deptA.id);
    check('deptA (now unoccupied) falls back to the global cycle again', resolvedDeptANowGlobal?.id === globalCycle.id);

    // Move it back to deptA so the rest of the script's assumptions still hold
    await cycleService.updateCycle(deptCycle.id, { departmentId: deptA.id }, empA.id);

    const resolvedOtherDept = await cycleService.resolveCycleForDepartment(TEST_FY, 1, deptB.id);
    check('different dept with no override -> still resolves to global', resolvedOtherDept?.id === globalCycle.id);

    const resolvedNullDept = await cycleService.resolveCycleForDepartment(TEST_FY, 1, null);
    check('null departmentId -> resolves straight to global', resolvedNullDept?.id === globalCycle.id);

    // ═══ 2. scoringConfigService.getActiveConfig — core fallback logic ═══
    const globalConfig = await ScoringConfig.create({
      financialYear: TEST_FY, departmentId: null, meetsMultiplier: 1.0, belowMultiplier: -0.5, exceedsMultiplier: 1.5, isActive: true,
    });
    createdConfigIds.push(globalConfig.id);

    const cfgNoOverride = await scoringConfigService.getActiveConfig(TEST_FY, deptA.id);
    check('no dept-specific config -> resolves to global', cfgNoOverride?.id === globalConfig.id);

    const deptConfig = await ScoringConfig.create({
      financialYear: TEST_FY, departmentId: deptA.id, meetsMultiplier: 2.0, belowMultiplier: -1.0, exceedsMultiplier: 3.0, isActive: true,
    });
    createdConfigIds.push(deptConfig.id);

    const cfgWithOverride = await scoringConfigService.getActiveConfig(TEST_FY, deptA.id);
    check('dept-specific config exists -> resolves to it', cfgWithOverride?.id === deptConfig.id && Number(cfgWithOverride.meetsMultiplier) === 2.0);

    const cfgOtherDept = await scoringConfigService.getActiveConfig(TEST_FY, deptB.id);
    check('different dept with no override -> still resolves to global', cfgOtherDept?.id === globalConfig.id);

    // ═══ 3. createConfig conflict check is now scoped per (FY, dept), not just FY ═══
    let conflictOnDuplicateGlobal = false;
    try {
      await scoringConfigService.createConfig({ financialYear: TEST_FY, departmentId: null }, empA.id);
    } catch (e) { conflictOnDuplicateGlobal = e.constructor.name === 'ConflictError' || /already exists/.test(e.message); }
    check('creating a 2nd global config for same FY -> conflict', conflictOnDuplicateGlobal);

    const deptBConfig = await scoringConfigService.createConfig({ financialYear: TEST_FY, departmentId: deptB.id, meetsMultiplier: 1.2 }, empA.id);
    createdConfigIds.push(deptBConfig.id);
    check('creating a config for a DIFFERENT dept, same FY -> succeeds (no false conflict)', !!deptBConfig.id);

    // ═══ 4. getAssignmentById attaches the correctly-resolved cycle ═══
    const assignment = await KpiAssignment.create({
      financialYear: TEST_FY, month: 1, quarter: 'Q1',
      employeeId: empA.id, managerId: empA.id, // self as manager — fine for this read-only test
      status: 'assigned',
    });
    createdAssignmentIds.push(assignment.id);

    const { assignment: fetched } = await kpiAssignmentService.getAssignmentById(assignment.id, { _id: empA.id, role: 'admin' });
    check('getAssignmentById attaches the DEPT-specific cycle deadline for this employee',
      fetched.appraisalCycle?.commitmentDeadline && new Date(fetched.appraisalCycle.commitmentDeadline).getFullYear() === 2099,
      JSON.stringify(fetched.appraisalCycle));

  } finally {
    if (createdAssignmentIds.length) await KpiAssignment.destroy({ where: { id: { [Op.in]: createdAssignmentIds } }, force: true });
    if (createdConfigIds.length) await ScoringConfig.destroy({ where: { id: { [Op.in]: createdConfigIds } }, force: true });
    if (createdCycleIds.length) await AppraisalCycle.destroy({ where: { id: { [Op.in]: createdCycleIds } }, force: true });
    const leakCycles  = await AppraisalCycle.count({ where: { financialYear: TEST_FY } });
    const leakConfigs = await ScoringConfig.count({ where: { financialYear: TEST_FY } });
    const leakAsg     = await KpiAssignment.count({ where: { financialYear: TEST_FY } });
    console.log(`Leak check — cycles:${leakCycles} configs:${leakConfigs} assignments:${leakAsg}`);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    await sequelize.close();
    process.exit(fail ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
