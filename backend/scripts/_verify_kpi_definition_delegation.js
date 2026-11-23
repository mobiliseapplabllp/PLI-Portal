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
const kpiPlanService = require('../src/services/kpiPlan.service');
const { KPI_STATUS } = require('../src/config/constants');

let pass = 0, fail = 0;
const check = (l, ok, d = '') => { if (ok) { pass++; console.log('  OK  ' + l); } else { fail++; console.log('  FAIL ' + l + '  ' + d); } };

const TEST_FY = '2099-02'; // impossible real FY, safe to use + easy to clean up
const TAG = '__TEST__';
const RUN_ID = Date.now().toString(36).slice(-6);

(async () => {
  const dept = await Department.findOne({ where: { isActive: true } });
  if (!dept) throw new Error('Need at least 1 active department in DB to test');
  const otherDept = await Department.findOne({ where: { isActive: true, id: { [Op.ne]: dept.id } } });
  if (!otherDept) throw new Error('Need at least 2 active departments in DB to test');

  const userIds = [];
  let seq = 0;
  const mkUser = async (role, deptId, managerId = null) => {
    seq++;
    const code = `${TAG}${RUN_ID}${seq}`.slice(0, 32);
    const u = await User.create({
      employeeCode: code,
      name: `${TAG} ${role}`,
      email: `${TAG}${RUN_ID}${seq}@test.local`,
      passwordHash: 'TestPass123!',
      departmentId: deptId,
      role,
      managerId,
      isActive: true,
    });
    userIds.push(u.id);
    return u;
  };

  const planIds = [];
  const itemIds = [];
  const requestIds = [];
  let fatal = null;

  try {
    const admin = await mkUser('admin', dept.id);
    // Renosh: granted Definer DIRECTLY by admin — "owner of company gives
    // Renosh access to define KPI for Sales" from the user's own example.
    const renosh = await mkUser('manager', dept.id);
    // Neha: sub-granted by Renosh, NOT by admin — the "Renosh deputizes Neha"
    // case. Reports to Renosh — required now: only a manager-level user, or
    // an employee WITH a manager set, is eligible to be granted at all.
    const neha = await mkUser('employee', dept.id, renosh.id);
    // An Approver (KpiDefinitionApprover, not KpiDefiner) — a different path
    // into canDefine(), with no grantedById chain of its own.
    const approverUser = await mkUser('manager', otherDept.id);
    const randomUser = await mkUser('employee', dept.id, renosh.id); // has a manager, but nothing granted

    await delegationService.grantDefiner(renosh.id, admin.id);
    await delegationService.assignApprover(dept.id, approverUser.id, admin.id);

    // ═══ 1. canPublishDirectly — admin, or that department's own assigned Approver ═══
    check('admin can publish directly', await approvalService.canPublishDirectly(dept.id, admin));
    check('a department Approver CAN publish directly for their department', await approvalService.canPublishDirectly(dept.id, approverUser));
    check('an admin-granted Definer (Renosh, not an Approver) still CANNOT publish directly', !(await approvalService.canPublishDirectly(dept.id, renosh)));

    // ═══ 1b. Definer-eligibility rule — manager-level OR employee-with-a-manager only ═══
    check('a manager-level user (Renosh) is an eligible grant target — already proven by the grant above', true);

    const employeeNoManager = await mkUser('employee', dept.id); // no managerId
    let noManagerBlocked = false;
    try { await delegationService.grantDefiner(employeeNoManager.id, admin.id); }
    catch (e) { noManagerBlocked = e.constructor.name === 'AppError'; }
    check('an employee with NO manager set is REJECTED as a grant target, even by admin', noManagerBlocked);

    const employeeWithManager = await mkUser('employee', dept.id, renosh.id);
    const eligibleGrant = await delegationService.grantDefiner(employeeWithManager.id, admin.id);
    check('an employee WITH a manager set IS an eligible grant target', String(eligibleGrant.userId) === String(employeeWithManager.id));
    await delegationService.revokeDefiner(employeeWithManager.id); // cleanup this one-off grant

    // ═══ 2. Sub-delegation — Renosh (a Definer) can grant Neha; a random user cannot ═══
    let randomCannotGrant = false;
    try { await approvalService.grantSubDefiner(randomUser, neha.id); }
    catch (e) { randomCannotGrant = e.constructor.name === 'ForbiddenError'; }
    check('a user with no define rights cannot sub-grant anyone', randomCannotGrant);

    const subGrant = await approvalService.grantSubDefiner(renosh, neha.id);
    check('Renosh (a Definer) CAN sub-grant Neha', String(subGrant.departmentId) === String(dept.id));
    check('the sub-grant records Renosh as grantedById (this is what the chain climbs)', String(subGrant.grantedById) === String(renosh.id));
    check('Neha can now define for the department (via the sub-grant)', await approvalService.canDefine(dept.id, neha));

    // ═══ 2b. "People I've granted" — Renosh's own scoped view + revoke ═══
    const renoshGrants = await approvalService.listMyGrantedDefiners(renosh);
    check('Renosh\'s own granted-list shows exactly Neha', renoshGrants.length === 1 && String(renoshGrants[0].userId) === String(neha.id));

    const adminGrants = await approvalService.listMyGrantedDefiners(admin);
    check('admin\'s own granted-list shows Renosh, NOT Neha (admin didn\'t grant her)',
      adminGrants.some((g) => String(g.userId) === String(renosh.id)) && !adminGrants.some((g) => String(g.userId) === String(neha.id)));

    let randomCannotRevokeNeha = false;
    try { await approvalService.revokeMyGrantedDefiner(randomUser, neha.id); }
    catch (e) { randomCannotRevokeNeha = e.constructor.name === 'ForbiddenError'; }
    check('a user who did NOT grant Neha cannot revoke her (even admin-visible, ownership-checked)', randomCannotRevokeNeha);

    let adminCannotRevokeViaMyGrants = false;
    try { await approvalService.revokeMyGrantedDefiner(admin, neha.id); }
    catch (e) { adminCannotRevokeViaMyGrants = e.constructor.name === 'ForbiddenError'; }
    check('even admin cannot use the OWNERSHIP-scoped revoke on someone they did not personally grant', adminCannotRevokeViaMyGrants);

    await approvalService.revokeMyGrantedDefiner(renosh, neha.id);
    check('Renosh CAN revoke Neha — he granted her himself', !(await approvalService.canDefine(dept.id, neha)));

    // Re-grant for the rest of the script, which assumes Neha is active.
    await approvalService.grantSubDefiner(renosh, neha.id);

    // ═══ 3. buildApprovalChain — the actual chain-walking logic ═══
    const renoshChain = await approvalService.buildApprovalChain(renosh);
    check('Renosh\'s chain is EMPTY — admin-granted directly, so only admin reviews', renoshChain.length === 0, JSON.stringify(renoshChain));

    const nehaChain = await approvalService.buildApprovalChain(neha);
    check('Neha\'s chain is [Renosh] — her grantor, before admin', nehaChain.length === 1 && String(nehaChain[0]) === String(renosh.id), JSON.stringify(nehaChain));

    const approverChain = await approvalService.buildApprovalChain(approverUser);
    check('an Approver (no KpiDefiner row) also has an empty chain — straight to admin', approverChain.length === 0);

    // ═══ 4. Defining is still FREE for everyone eligible — unaffected by the chain rewrite ═══
    const { status: s1, result: plan } = await approvalService.createPlan(
      { financialYear: TEST_FY, departmentId: dept.id, role: null }, neha
    );
    check('Neha creating a plan still applies INSTANTLY (defining was never gated)', s1 === 'applied');
    planIds.push(plan.id);

    const { result: item } = await approvalService.addPlanItem(plan.id, { title: 'Full', monthlyWeightage: 100 }, neha);
    itemIds.push(item.id);

    // ═══ 5. Publish — Renosh's OWN plan: single-stage, admin only ═══
    const { status: s2, result: plan2 } = await approvalService.createPlan(
      { financialYear: TEST_FY, departmentId: dept.id, role: 'manager' }, renosh
    );
    planIds.push(plan2.id);
    const { result: item2 } = await approvalService.addPlanItem(plan2.id, { title: 'Full2', monthlyWeightage: 100 }, renosh);
    itemIds.push(item2.id);

    const { status: s3, result: renoshReq } = await approvalService.publishPlan(plan2.id, renosh);
    check('Renosh publishing his OWN plan is STAGED (not direct)', s3 === 'pending');
    requestIds.push(renoshReq.id);
    check('Renosh\'s request has an EMPTY chain and approverId=null (admin is the only/next stage)',
      renoshReq.approvalChain.length === 0 && renoshReq.approverId === null);

    let renoshCannotApproveSelf = false;
    try { await approvalService.approveRequest(renoshReq.id, renosh); }
    catch (e) { renoshCannotApproveSelf = e.constructor.name === 'ForbiddenError'; }
    check('Renosh CANNOT approve his own request — only admin matches an empty chain', renoshCannotApproveSelf);

    const { request: renoshApproved, applied: renoshApplied, finalized: renoshFinalized } =
      await approvalService.approveRequest(renoshReq.id, admin);
    check('admin approving Renosh\'s request finalizes AND publishes it', renoshFinalized === true && renoshApplied.plan.isPublished === true);
    check('request status is approved', renoshApproved.status === 'approved');

    // ═══ 6. Publish — Neha's plan: TWO-stage chain (Renosh, then admin) ═══
    const { status: s4, result: nehaReq } = await approvalService.publishPlan(plan.id, neha);
    check('Neha publishing is STAGED', s4 === 'pending');
    requestIds.push(nehaReq.id);
    check('Neha\'s request chain is [Renosh], routed to him first', String(nehaReq.approverId) === String(renosh.id));

    let adminCannotBeSkippedByRandomUser = false;
    try { await approvalService.approveRequest(nehaReq.id, randomUser); }
    catch (e) { adminCannotBeSkippedByRandomUser = e.constructor.name === 'ForbiddenError'; }
    check('a user not in the chain (not Renosh, not admin) cannot approve Neha\'s request', adminCannotBeSkippedByRandomUser);

    const { request: afterStage1, finalized: stage1Finalized } = await approvalService.approveRequest(nehaReq.id, renosh, 'looks fine');
    check('Renosh (stage 1) approving does NOT finalize/publish yet', stage1Finalized === false);
    check('request is still pending after stage 1', afterStage1.status === 'pending');
    check('currentStage advanced to 1 (past the chain, next is admin)', afterStage1.currentStage === 1);
    check('approverId is now null — admin is next', afterStage1.approverId === null);

    const planStillUnpublished = await KpiPlan.findByPk(plan.id);
    check('the plan is STILL not published — stage-1 approval never applies anything', planStillUnpublished.isPublished === false);

    let renoshCannotApproveTwice = false;
    try { await approvalService.approveRequest(nehaReq.id, renosh); }
    catch (e) { renoshCannotApproveTwice = e.constructor.name === 'ForbiddenError'; }
    check('Renosh cannot approve a second time — it\'s no longer his stage', renoshCannotApproveTwice);

    const { request: finalReq, applied: finalApplied, finalized: stage2Finalized } =
      await approvalService.approveRequest(nehaReq.id, admin, 'final sign-off');
    check('admin (stage 2 / final) approving DOES finalize and publish', stage2Finalized === true && finalApplied.plan.isPublished === true);
    check('request is now approved', finalReq.status === 'approved');

    // Renosh was an INTERMEDIATE reviewer (not the requester, not admin) —
    // he must still see this request's final outcome, not lose visibility
    // the moment his own stage passed.
    const renoshVisible = await approvalService.listRequests(renosh, {});
    check('Renosh can still see the request AFTER his stage passed and it was fully approved',
      renoshVisible.some((r) => String(r.id) === String(nehaReq.id)));

    // ═══ 7. Admin can always short-circuit the chain, at any stage ═══
    const { result: plan3 } = await approvalService.createPlan({ financialYear: TEST_FY, departmentId: dept.id, role: 'senior_manager' }, neha);
    planIds.push(plan3.id);
    const { result: item3 } = await approvalService.addPlanItem(plan3.id, { title: 'Full3', monthlyWeightage: 100 }, neha);
    itemIds.push(item3.id);
    const { result: shortCircuitReq } = await approvalService.publishPlan(plan3.id, neha);
    requestIds.push(shortCircuitReq.id);
    check('a fresh Neha request starts at stage 0 (Renosh\'s turn)', shortCircuitReq.currentStage === 0);
    const { finalized: shortCircuitFinalized } = await approvalService.approveRequest(shortCircuitReq.id, admin);
    check('admin approving IMMEDIATELY, skipping Renosh\'s stage entirely, still finalizes', shortCircuitFinalized === true);

    // ═══ 8. Reject — at any stage, never applies anything ═══
    const { result: plan4 } = await approvalService.createPlan({ financialYear: TEST_FY, departmentId: dept.id, role: 'final_approver' }, neha);
    planIds.push(plan4.id);
    const { result: item4 } = await approvalService.addPlanItem(plan4.id, { title: 'Full4', monthlyWeightage: 100 }, neha);
    itemIds.push(item4.id);
    const { result: rejectReq } = await approvalService.publishPlan(plan4.id, neha);
    requestIds.push(rejectReq.id);
    const rejected = await approvalService.rejectRequest(rejectReq.id, renosh, 'not ready yet');
    check('Renosh (stage 1) can reject', rejected.status === 'rejected');
    const plan4Fresh = await KpiPlan.findByPk(plan4.id);
    check('rejected plan was never published', plan4Fresh.isPublished === false);

    // ═══ 9. Unpublish — admin, or that department's own Approver ═══
    const { status: s5, result: unpublishedByApprover } = await approvalService.unpublishPlan(plan2.id, approverUser);
    check('the department Approver CAN unpublish their department\'s plan directly', s5 === 'applied' && unpublishedByApprover.isPublished === false);

    const { status: s6, result: unpublishedByAdmin } = await approvalService.unpublishPlan(plan3.id, admin);
    check('admin CAN still unpublish directly', s6 === 'applied' && unpublishedByAdmin.isPublished === false);

    let renoshDefinerCannotUnpublish = false;
    const { result: plan5 } = await approvalService.createPlan({ financialYear: TEST_FY, departmentId: dept.id, role: 'quality' }, renosh);
    planIds.push(plan5.id);
    const { result: item5 } = await approvalService.addPlanItem(plan5.id, { title: 'Full5', monthlyWeightage: 100 }, renosh);
    itemIds.push(item5.id);
    const { result: renoshReq5 } = await approvalService.publishPlan(plan5.id, renosh);
    requestIds.push(renoshReq5.id);
    await approvalService.approveRequest(renoshReq5.id, admin);
    try { await approvalService.unpublishPlan(plan5.id, renosh); }
    catch (e) { renoshDefinerCannotUnpublish = e.constructor.name === 'ForbiddenError'; }
    check('a plain Definer (Renosh, not an Approver) still CANNOT unpublish directly', renoshDefinerCannotUnpublish);

    // ═══ 10. A plain employee with NO grant cannot read a department's plans just by belonging to it ═══
    const seenByRandom = await kpiPlanService.getPlans({ financialYear: TEST_FY }, randomUser);
    check('an ungranted employee sees NO plans for their own department', seenByRandom.length === 0);

    await delegationService.grantDefiner(randomUser.id, admin.id);
    const seenAfterGrant = await kpiPlanService.getPlans({ financialYear: TEST_FY }, randomUser);
    check('once granted Definer, that same employee DOES see the department\'s plans', seenAfterGrant.length > 0);
    await approvalService.revokeMyGrantedDefiner(admin, randomUser.id);

    // ═══ 11. A Definer cannot reassign a plan to a department they have no rights over ═══
    let nehaCannotRetarget = false;
    try { await approvalService.updatePlan(plan3.id, { departmentId: otherDept.id }, neha); }
    catch (e) { nehaCannotRetarget = e.constructor.name === 'ForbiddenError'; }
    check('Neha (Definer for dept only) CANNOT move a plan to otherDept', nehaCannotRetarget);
    const plan3Unmoved = await KpiPlan.findByPk(plan3.id);
    check('plan3.departmentId is unchanged after the rejected attempt', String(plan3Unmoved.departmentId) === String(dept.id));

  } catch (e) {
    fatal = e;
  } finally {
    if (requestIds.length) await KpiDefinitionChangeRequest.destroy({ where: { id: { [Op.in]: requestIds } }, force: true });

    const strayAssignmentIds = (await KpiAssignment.findAll({ where: { financialYear: TEST_FY }, attributes: ['id'] })).map((a) => a.id);
    if (strayAssignmentIds.length) await KpiItem.destroy({ where: { kpiAssignmentId: { [Op.in]: strayAssignmentIds } }, force: true });
    if (strayAssignmentIds.length) await KpiAssignment.destroy({ where: { id: { [Op.in]: strayAssignmentIds } }, force: true });
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
