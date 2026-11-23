const { Op, fn, col, where: sequelizeWhere } = require('sequelize');
const KpiPlan = require('../models/KpiPlan');
const KpiDefiner = require('../models/KpiDefiner');
const KpiDefinitionApprover = require('../models/KpiDefinitionApprover');
const KpiDefinitionChangeRequest = require('../models/KpiDefinitionChangeRequest');
const User = require('../models/User');
const Department = require('../models/Department');
const kpiPlanService = require('./kpiPlan.service');
const delegationService = require('./kpiDefinitionDelegation.service');
const { AppError, NotFoundError, ForbiddenError } = require('../utils/errors');

// req.user has `id` renamed to `_id` for the client (renameIdsForClient) —
// a raw Sequelize instance (e.g. in scripts/tests) still has `id`. Accept both.
const uid = (user) => user._id || user.id;

// ── Roles ────────────────────────────────────────────────────────────────────
//
// Only `admin` has automatic rights — no role (including hr_admin and
// sales_director) gets a free pass anymore. Everyone else needs an explicit
// grant from admin:
//   - Definer  (kpi_definers)            → may define/edit a KPI plan, scoped
//                                           to their own department. Cannot
//                                           publish it themselves.
//   - Approver (kpi_definition_approvers) → may define/edit AND publish for
//                                           their assigned department(s).
//                                           Being made Approver implies full
//                                           Definer rights too — no separate
//                                           grant needed.

const isAdmin = (user) => user.role === 'admin';

const isApproverFor = async (departmentId, user) => {
  if (isAdmin(user)) return true;
  const row = await KpiDefinitionApprover.findOne({ where: { departmentId, userId: uid(user) } });
  return !!row;
};

const isDefinerFor = async (departmentId, user) => {
  const grant = await KpiDefiner.findOne({ where: { userId: uid(user), isActive: true } });
  return !!(grant && String(grant.departmentId) === String(departmentId));
};

// "Can define" = may freely create/edit/delete KPI items and save drafts —
// never gated, applies immediately. Admin, that department's Approver, or a
// granted Definer for that department.
const canDefine = async (departmentId, user) => {
  if (isAdmin(user)) return true;
  if (await isApproverFor(departmentId, user)) return true;
  if (await isDefinerFor(departmentId, user)) return true;
  return false;
};

// "Can publish directly" = may flip isPublished without anyone else's
// sign-off. Admin, or that department's own assigned Approver (being made
// Approver implies full publish authority for their department — see the
// role comment above). A granted Definer who is NOT also that department's
// Approver always goes through the approval chain below, however short.
const canPublishDirectly = async (departmentId, user) => {
  if (isAdmin(user)) return true;
  return isApproverFor(departmentId, user);
};

const assertCanDefine = async (departmentId, user) => {
  if (!(await canDefine(departmentId, user))) {
    throw new ForbiddenError('You do not have rights to define KPIs for this department.');
  }
};

// ── Approval chain ───────────────────────────────────────────────────────────
//
// Walks kpi_definers.grantedById upward from the submitter, collecting every
// INTERMEDIATE human approver until it reaches someone who is role 'admin'
// (or runs out of grant info). Admin is always the implicit final stage and
// is never included in the returned list — see publishPlan()/approveRequest().
//
// Example: admin grants Renosh -> Renosh sub-grants Neha.
//   buildApprovalChain(Neha)   -> [Renosh.id]   (Renosh approves, then admin)
//   buildApprovalChain(Renosh) -> []             (admin only — Renosh was
//                                                  granted directly by admin)
const buildApprovalChain = async (user) => {
  const chain = [];
  const visited = new Set();
  let currentId = uid(user);

  while (true) {
    if (visited.has(currentId)) break; // cycle guard — should never happen, but never trust a graph blindly
    visited.add(currentId);

    const grant = await KpiDefiner.findOne({ where: { userId: currentId, isActive: true } });
    if (!grant || !grant.grantedById) break;

    const grantor = await User.findByPk(grant.grantedById);
    if (!grantor || grantor.role === 'admin') break; // admin is implicit, never listed

    chain.push(grantor.id);
    currentId = grantor.id;
  }

  return chain;
};

const canReviewRequest = (request, user) => {
  if (user.role === 'admin') return true; // admin can always act, at any stage
  const chain = request.approvalChain || [];
  const expected = chain[request.currentStage];
  return !!expected && String(expected) === String(uid(user));
};

// Resolves the department a given write action targets, fetching the
// existing plan when the action doesn't carry departmentId directly.
const resolveTargetDepartment = async (action, { planId, data }) => {
  if (action === 'createPlan') {
    const departmentId = data.departmentId;
    if (!departmentId) throw new AppError('departmentId is required.', 400);
    return departmentId;
  }
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');
  return plan.departmentId;
};

// Applies an approved publish request through the exact same
// kpiPlanService.publishPlan used for a direct admin/approver publish —
// nothing new, nothing special-cased. `applyActor` carries the ORIGINAL
// requester's id (audit trail) but role 'admin' (kpiPlan.service.js itself no
// longer checks permission — this is just a harmless, consistent shape) —
// permission was already fully vetted by canDefine()/canPublishDirectly() at
// submit/approve time.
const applyPublishRequest = async (request) => {
  const requester = await User.findByPk(request.requestedById);
  const applyActor = { id: requester.id, _id: requester.id, role: 'admin', departmentId: requester.departmentId };
  return kpiPlanService.publishPlan(request.planId, applyActor);
};

// ── Free actions — define/edit, never gated ─────────────────────────────────
// Applied immediately for anyone eligible (admin, department Approver, or
// granted Definer for that department). No staging, no request created.

const defineAction = async (departmentId, user, directFn) => {
  await assertCanDefine(departmentId, user);
  return { status: 'applied', result: await directFn() };
};

const createPlan = async (data, user) => {
  const departmentId = await resolveTargetDepartment('createPlan', { data });
  return defineAction(departmentId, user, () => kpiPlanService.createPlan(data, user));
};

const updatePlan = async (planId, data, user) => {
  const departmentId = await resolveTargetDepartment('updatePlan', { planId });
  // A plan edit can itself reassign the plan to a DIFFERENT department
  // (data.departmentId) — rights over the plan's current department don't
  // imply rights over that new one, so it must be checked separately.
  if (data.departmentId && String(data.departmentId) !== String(departmentId)) {
    await assertCanDefine(data.departmentId, user);
  }
  return defineAction(departmentId, user, () => kpiPlanService.updatePlan(planId, data, user));
};

const updatePlanStatus = async (planId, status, user) => {
  const departmentId = await resolveTargetDepartment('updatePlanStatus', { planId });
  return defineAction(departmentId, user, () => kpiPlanService.updatePlanStatus(planId, status, user));
};

const addPlanItem = async (planId, itemData, user) => {
  const departmentId = await resolveTargetDepartment('addPlanItem', { planId });
  return defineAction(departmentId, user, () => kpiPlanService.addPlanItem(planId, itemData, user));
};

const updatePlanItem = async (planId, itemId, itemData, user) => {
  const departmentId = await resolveTargetDepartment('updatePlanItem', { planId });
  return defineAction(departmentId, user, () => kpiPlanService.updatePlanItem(planId, itemId, itemData, user));
};

const deletePlanItem = async (planId, itemId, user) => {
  const departmentId = await resolveTargetDepartment('deletePlanItem', { planId });
  return defineAction(departmentId, user, () => kpiPlanService.deletePlanItem(planId, itemId, user));
};

// ── Publish — the ONE gated action ──────────────────────────────────────────
// Only admin ever actually applies a publish. Anyone else eligible to define
// (a department Approver, or a granted Definer) submits a request instead,
// which climbs the approval chain built from who granted them rights —
// admin's own approval always finalizes immediately, no matter where in the
// chain it currently sits.

const publishPlan = async (planId, user) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');
  const departmentId = plan.departmentId;

  if (await canPublishDirectly(departmentId, user)) {
    return { status: 'applied', result: await kpiPlanService.publishPlan(planId, user) };
  }

  if (!(await canDefine(departmentId, user))) {
    throw new ForbiddenError('You do not have rights to publish this department\'s KPI plan.');
  }

  const chain = await buildApprovalChain(user);
  const request = await KpiDefinitionChangeRequest.create({
    action: 'publishPlan',
    departmentId,
    planId,
    payload: null,
    requestedById: uid(user),
    approvalChain: chain,
    currentStage: 0,
    approverId: chain[0] || null, // null = the only/next stage is admin
    status: 'pending',
  });
  return { status: 'pending', result: request };
};

// ── Unpublish — same privilege level as direct-publish, never staged ────────
// Admin only — same reasoning as publish: nobody else finalizes a live
// state change by themselves. Hard-blocked inside kpiPlanService.unpublishPlan
// if any employee has already committed/submitted under the plan.

const unpublishPlan = async (planId, user) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');

  if (!(await canPublishDirectly(plan.departmentId, user))) {
    throw new ForbiddenError('Only admin or this department\'s Approver can unpublish a KPI plan.');
  }

  return { status: 'applied', result: await kpiPlanService.unpublishPlan(planId) };
};

// ── Review ──────────────────────────────────────────────────────────────────

const listRequests = async (user, query = {}) => {
  const where = {};
  if (query.status) where.status = query.status;

  if (user.role !== 'admin') {
    // Visible if: it's your turn right now (approverId), you submitted it
    // (requestedById), or you were ever a stage in the chain (approvalChain)
    // — an intermediate reviewer like Renosh must still be able to see a
    // request's outcome after his own stage has passed, not just while it's
    // actively sitting with him.
    where[Op.or] = [
      { approverId: uid(user) },
      { requestedById: uid(user) },
      sequelizeWhere(fn('JSON_CONTAINS', col('approvalChain'), JSON.stringify(String(uid(user)))), true),
    ];
  }

  return KpiDefinitionChangeRequest.findAll({
    where,
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: User, as: 'requestedBy', attributes: ['id', 'name', 'role'] },
      { model: User, as: 'approver', attributes: ['id', 'name'] },
      { model: User, as: 'reviewedBy', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
  });
};

// Approving advances the chain one stage — it only actually PUBLISHES when
// admin approves, which always finalizes immediately regardless of how many
// stages are left (admin's sign-off is supreme; it can short-circuit the
// rest of the chain). A non-admin stage approval just moves `currentStage`
// forward and leaves the request pending for whoever's next.
const approveRequest = async (id, user, note) => {
  const request = await KpiDefinitionChangeRequest.findByPk(id);
  if (!request) throw new NotFoundError('KPI Definition change request');
  if (request.status !== 'pending') throw new AppError('This request has already been reviewed.', 400);
  if (!canReviewRequest(request, user)) throw new ForbiddenError('You are not the approver for this stage.');

  if (user.role === 'admin') {
    // Apply FIRST — if the plan no longer validates (e.g. weightage sum
    // changed since submission), this throws and the request stays 'pending'
    // so admin can reject it or ask the definer to fix it up, instead of
    // silently marking a broken publish as approved.
    const applied = await applyPublishRequest(request);

    request.status = 'approved';
    request.reviewedById = uid(user);
    request.reviewedAt = new Date();
    if (note) request.reviewNote = note;
    await request.save();

    return { request, applied, finalized: true };
  }

  const chain = request.approvalChain || [];
  request.currentStage += 1;
  request.approverId = chain[request.currentStage] || null; // null = next stage is admin
  if (note) request.reviewNote = note;
  await request.save();

  return { request, applied: null, finalized: false };
};

const rejectRequest = async (id, user, note) => {
  const request = await KpiDefinitionChangeRequest.findByPk(id);
  if (!request) throw new NotFoundError('KPI Definition change request');
  if (request.status !== 'pending') throw new AppError('This request has already been reviewed.', 400);
  if (!canReviewRequest(request, user)) throw new ForbiddenError('You are not the approver for this stage.');

  request.status = 'rejected';
  request.reviewedById = uid(user);
  request.reviewedAt = new Date();
  if (note) request.reviewNote = note;
  await request.save();

  return request;
};

// ── Sub-delegation ───────────────────────────────────────────────────────────
// Anyone who can already define for a department (admin, that department's
// Approver, or a granted Definer) can grant Definer rights to someone else
// for that SAME department — admin no longer has to personally grant every
// single person. The grant itself is identical to an admin grant (still
// auto-scoped to the TARGET user's own department) — only WHO may call it
// changes, and that caller becomes the new grantee's `grantedById`, which is
// exactly what buildApprovalChain() later climbs.
const grantSubDefiner = async (granterUser, targetUserId) => {
  const targetUser = await User.findByPk(targetUserId);
  if (!targetUser) throw new NotFoundError('User');
  if (!targetUser.departmentId) throw new AppError('This user has no department set — cannot grant Definer rights.', 400);

  if (!(await canDefine(targetUser.departmentId, granterUser))) {
    throw new ForbiddenError('You do not have rights to grant KPI Definer access for this department.');
  }

  return delegationService.grantDefiner(targetUserId, uid(granterUser));
};

// The people a non-admin has personally granted — only admin sees the full,
// everyone-everywhere Definers list, so a sub-granter needs their own scoped
// view instead of flying blind between granting someone and their first
// publish request showing up.
const listMyGrantedDefiners = (user) => delegationService.listMyGrantedDefiners(user);

// A non-admin may only revoke someone THEY personally granted — never
// someone else's grant, and never their own. Admin can still revoke anyone
// from the Delegation page, unaffected by this.
const revokeMyGrantedDefiner = async (granterUser, targetUserId) => {
  const grant = await KpiDefiner.findOne({ where: { userId: targetUserId, isActive: true } });
  if (!grant) throw new NotFoundError('Active Definer grant');
  if (String(grant.grantedById) !== String(uid(granterUser))) {
    throw new ForbiddenError('You can only revoke someone you personally granted.');
  }
  return delegationService.revokeDefiner(targetUserId);
};

module.exports = {
  isAdmin,
  isApproverFor,
  isDefinerFor,
  canDefine,
  canPublishDirectly,
  assertCanDefine,
  buildApprovalChain,
  createPlan,
  updatePlan,
  updatePlanStatus,
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  publishPlan,
  unpublishPlan,
  listRequests,
  listMyGrantedDefiners,
  revokeMyGrantedDefiner,
  approveRequest,
  rejectRequest,
  grantSubDefiner,
};
