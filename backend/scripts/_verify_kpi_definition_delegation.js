const { sequelize } = require('../test/_helpers');
const { Op } = require('sequelize');
const Department = require('../src/models/Department');
const User = require('../src/models/User');
const KpiPlan = require('../src/models/KpiPlan');
const KpiPlanItem = require('../src/models/KpiPlanItem');
const KpiAssignment = require('../src/models/KpiAssignment');
const KpiItem = require('../src/models/KpiItem');
const KpiDefiner = require('../src/models/KpiDefiner');
const KpiDefinitionApprover = require('../src/models/KpiDefinitionApprover');
const KpiDefinitionChangeRequest = require('../src/models/KpiDefinitionChangeRequest');
const delegationService = require('../src/services/kpiDefinitionDelegation.service');
const approvalService = require('../src/services/kpiDefinitionApproval.service');
const { KPI_STATUS } = require('../src/config/constants');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

const TEST_FY = '2099-01'; // impossible real FY, safe to use + easy to clean up
const TAG = '__TEST__';
const RUN_ID = Date.now().toString(36).slice(-6);

(async () => {
  const dept = await Department.findOne({ where: { isActive: true } });
  if (!dept) throw new Error('Need at least 1 active department in DB to test');
  const otherDept = await Department.findOne({ where: { isActive: true, id: { [Op.ne]: dept.id } } });
  if (!otherDept) throw new Error('Need at least 2 active departments in DB to test');

  const userIds = [];
  let seq = 0;
  const mkUser = async (role, deptId) => {
    seq++;
    const code = `${TAG}${RUN_ID}${seq}`.slice(0, 32);
    const u = await User.create({
      employeeCode: code,
      name: `${TAG} ${role}`,
      email: `${TAG}${RUN_ID}${seq}@test.local`,
      passwordHash: 'TestPass123!',
      departmentId: deptId,
      role,
      isActive: true,
    });
    userIds.push(u.id);
    return u;
  };

  const planIds = [];
  const itemIds = [];
  const requestIds = [];
  const assignmentIds = [];
  let fatal = null;

  try {
    const admin = await mkUser('admin', dept.id);
    // Approver is assigned to `dept` but lives in `otherDept` — proves the
    // cross-department Approver case (admin can assign ANY user).
    const approver = await mkUser('manager', otherDept.id);
    // Definer is granted for `dept`, auto-scoped from their OWN department.
    const definerEmployee = await mkUser('employee', dept.id); // the "Neha" case
    // hr_admin/sales_director with NO explicit grant — must now be blocked,
    // same as anyone else (the user's final correction: no automatic bypass).
    const hrAdminNoGrant = await mkUser('hr_admin', dept.id);
    const salesDirectorNoGrant = await mkUser('sales_director', dept.id);
    const randomEmployee = await mkUser('employee', dept.id); // never granted anything

    await delegationService.assignApprover(dept.id, approver.id, admin.id);
    await delegationService.grantDefiner(definerEmployee.id, admin.id);

    // ═══ 1. Eligibility — canDefine ═══
    check('admin can define any department', await approvalService.canDefine(dept.id, admin));
    check('assigned Approver can define their department (even though it is NOT their own home department)',
      await approvalService.canDefine(dept.id, approver));
    check('granted Definer can define their own department', await approvalService.canDefine(dept.id, definerEmployee));
    check('hr_admin with NO grant CANNOT define — no automatic role bypass anymore',
      !(await approvalService.canDefine(dept.id, hrAdminNoGrant)));
    check('sales_director with NO grant CANNOT define — no automatic role bypass anymore',
      !(await approvalService.canDefine(dept.id, salesDirectorNoGrant)));
    check('a random employee with nothing granted CANNOT define', !(await approvalService.canDefine(dept.id, randomEmployee)));

    // ═══ 2. Eligibility — canPublishDirectly ═══
    check('admin can publish directly', await approvalService.canPublishDirectly(dept.id, admin));
    check('the assigned Approver can publish directly', await approvalService.canPublishDirectly(dept.id, approver));
    check('a plain Definer CANNOT publish directly', !(await approvalService.canPublishDirectly(dept.id, definerEmployee)));

    // ═══ 3. Defining is FREE — no staging at all, for admin, approver, or definer ═══
    const { status: s1, result: plan } = await approvalService.createPlan(
      { financialYear: TEST_FY, departmentId: dept.id, role: null }, definerEmployee
    );
    check('Definer creating a plan applies INSTANTLY (status=applied, no staging)', s1 === 'applied');
    planIds.push(plan.id);
    check('plan actually exists in kpi_plans', !!(await KpiPlan.findByPk(plan.id)));

    const { status: s2, result: item1 } = await approvalService.addPlanItem(
      plan.id, { title: 'Item A', monthlyWeightage: 60 }, definerEmployee
    );
    check('Definer adding an item applies INSTANTLY', s2 === 'applied');
    itemIds.push(item1.id);

    const { status: s3, result: item2 } = await approvalService.addPlanItem(
      plan.id, { title: 'Item B', monthlyWeightage: 40 }, approver
    );
    check('Approver adding an item (cross-department) also applies INSTANTLY', s3 === 'applied');
    itemIds.push(item2.id);

    let hrBlocked = false;
    try { await approvalService.addPlanItem(plan.id, { title: 'Blocked item', monthlyWeightage: 1 }, hrAdminNoGrant); }
    catch (e) { hrBlocked = e.constructor.name === 'ForbiddenError'; }
    check('hr_admin with no grant is BLOCKED from adding an item at all', hrBlocked);

    // No change request should exist yet — defining never stages anything.
    const requestsSoFar = await KpiDefinitionChangeRequest.count({ where: { departmentId: dept.id, planId: plan.id } });
    check('zero change requests were created for any of the define actions above', requestsSoFar === 0);

    // ═══ 4. Publish — the ONE gated action ═══
    const { status: s4, result: req1 } = await approvalService.publishPlan(plan.id, definerEmployee);
    check('Definer publishing is STAGED (status=pending) — the only gated action', s4 === 'pending');
    requestIds.push(req1.id);
    check('staged publish request is routed to the assigned Approver', String(req1.approverId) === String(approver.id));
    const planStillUnpublished = await KpiPlan.findByPk(plan.id);
    check('plan is NOT published yet — staged request did not touch it', planStillUnpublished.isPublished === false);

    let randomCannotPublish = false;
    try { await approvalService.publishPlan(plan.id, randomEmployee); }
    catch (e) { randomCannotPublish = e.constructor.name === 'ForbiddenError'; }
    check('a user with no define/approve rights cannot even submit a publish request', randomCannotPublish);

    const { request: approvedReq, applied: appliedResult } = await approvalService.approveRequest(req1.id, approver, 'go ahead');
    check('the assigned Approver approving actually publishes the plan', approvedReq.status === 'approved' && appliedResult.plan.isPublished === true);

    // Approver/admin publish DIRECTLY — no staging — proven on a 2nd plan.
    const { status: s5, result: plan2 } = await approvalService.createPlan(
      { financialYear: TEST_FY, departmentId: dept.id, role: 'manager' }, approver
    );
    planIds.push(plan2.id);
    const { result: item3 } = await approvalService.addPlanItem(plan2.id, { title: 'Full', monthlyWeightage: 100 }, approver);
    itemIds.push(item3.id);
    const { status: s6 } = await approvalService.publishPlan(plan2.id, approver);
    check('the Approver publishing their own department\'s plan is INSTANT, no staging', s6 === 'applied');
    const plan2Fresh = await KpiPlan.findByPk(plan2.id);
    check('plan2 is actually published', plan2Fresh.isPublished === true);

    // ═══ 5. Unpublish — admin/Approver only, Definer cannot even request it ═══
    let definerCannotUnpublish = false;
    try { await approvalService.unpublishPlan(plan2.id, definerEmployee); }
    catch (e) { definerCannotUnpublish = e.constructor.name === 'ForbiddenError'; }
    check('a plain Definer cannot unpublish at all (not even staged)', definerCannotUnpublish);

    const { status: s7, result: unpublished } = await approvalService.unpublishPlan(plan2.id, approver);
    check('the Approver CAN unpublish directly (nothing committed yet)', s7 === 'applied' && unpublished.isPublished === false);

    // Re-publish for the next check
    await approvalService.publishPlan(plan2.id, approver);

    // ═══ 6. Unpublish guard — blocked once something is committed ═══
    const committedEmp = await mkUser('employee', dept.id);
    const assignment = await KpiAssignment.create({
      financialYear: TEST_FY, month: 4, quarter: 'Q1',
      employeeId: committedEmp.id, managerId: admin.id, departmentId: dept.id,
      status: KPI_STATUS.COMMITMENT_SUBMITTED || 'commitment_submitted',
    });
    assignmentIds.push(assignment.id);
    const kpiItem = await KpiItem.create({
      kpiAssignmentId: assignment.id, kpiPlanItemId: item3.id,
      title: 'Full', weightage: 100,
    });

    let blockedByCommitment = false;
    let blockMessage = '';
    try { await approvalService.unpublishPlan(plan2.id, approver); }
    catch (e) { blockedByCommitment = true; blockMessage = e.message; }
    check('unpublish is BLOCKED once an assignment has a submitted commitment', blockedByCommitment, blockMessage);
    const plan2StillPublished = await KpiPlan.findByPk(plan2.id);
    check('plan2 is still published after the blocked attempt', plan2StillPublished.isPublished === true);

    // Admin can unpublish too, but is subject to the SAME guard — no bypass.
    let adminAlsoBlocked = false;
    try { await approvalService.unpublishPlan(plan2.id, admin); }
    catch (e) { adminAlsoBlocked = true; }
    check('even admin is blocked by the committed-assignment guard — no one can bypass it', adminAlsoBlocked);

    await KpiItem.destroy({ where: { id: kpiItem.id }, force: true });

  } catch (e) {
    fatal = e;
  } finally {
    if (requestIds.length) await KpiDefinitionChangeRequest.destroy({ where: { id: { [Op.in]: requestIds } }, force: true });

    // Publishing a role=null plan also auto-generates REAL kpi_assignments
    // (via resyncPlanAssignments) for every matching employee in the
    // department — including the test users created above. TEST_FY is a
    // sentinel value no real data ever uses, so sweeping by it is safe and
    // catches everything, not just the one assignment this script tracked.
    const strayAssignmentIds = (await KpiAssignment.findAll({ where: { financialYear: TEST_FY }, attributes: ['id'] })).map((a) => a.id);
    const allAssignmentIds = [...new Set([...assignmentIds, ...strayAssignmentIds])];
    if (allAssignmentIds.length) await KpiItem.destroy({ where: { kpiAssignmentId: { [Op.in]: allAssignmentIds } }, force: true });
    if (allAssignmentIds.length) await KpiAssignment.destroy({ where: { id: { [Op.in]: allAssignmentIds } }, force: true });
    if (itemIds.length) await KpiPlanItem.destroy({ where: { id: { [Op.in]: itemIds } }, force: true });
    if (planIds.length) await KpiPlan.destroy({ where: { id: { [Op.in]: planIds } }, force: true });
    await KpiDefiner.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await KpiDefinitionApprover.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    if (userIds.length) await User.destroy({ where: { id: { [Op.in]: userIds } }, force: true });

    const leakUsers = await User.count({ where: { email: { [Op.like]: `${TAG}%` } } });
    const leakPlans = await KpiPlan.count({ where: { financialYear: TEST_FY } });
    const leakAssignments = await KpiAssignment.count({ where: { financialYear: TEST_FY } });
    console.log(`Leak check — users:${leakUsers} plans:${leakPlans} assignments:${leakAssignments}`);
    console.log('\n=== ' + pass + ' passed, ' + fail + ' failed ===');
    if (fatal) console.error('FATAL (inside try):', fatal.message, '\n', fatal.stack);
    await sequelize.close();
    process.exit(fail || fatal ? 1 : 0);
  }
})().catch(e => { console.error('FATAL', e.message, e.stack); process.exit(1); });
