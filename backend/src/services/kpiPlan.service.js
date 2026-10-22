const { Op } = require('sequelize');
const sequelize = require('../config/database');
const KpiPlan = require('../models/KpiPlan');
const KpiPlanItem = require('../models/KpiPlanItem');
const KpiItem = require('../models/KpiItem');
const KpiAssignment = require('../models/KpiAssignment');
const User = require('../models/User');
const Department = require('../models/Department');
const KpiDefiner = require('../models/KpiDefiner');
const KpiDefinitionApprover = require('../models/KpiDefinitionApprover');
const { DEFAULT_HEAD_WEIGHTAGES, KPI_PLAN_STATUS, KPI_HEADS, KPI_STATUS } = require('../config/constants');
const { AppError, NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const { getQuarterFromMonth } = require('../utils/quarterHelper');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Permission is NOT checked in this file — every write function here is only
// ever called from kpiDefinitionApproval.service.js, which is the single
// source of truth for who may touch which department's KPI plan (admin, the
// department's Approver, or a granted Definer). This file trusts its caller.

// req.user has `id` renamed to `_id` for the client (renameIdsForClient) —
// a raw Sequelize instance (e.g. in scripts/tests) still has `id`. Accept both.
const uid = (user) => user._id || user.id;

const validateHeadWeightages = (hw) => {
  const total = KPI_HEADS.reduce((s, h) => s + (parseFloat(hw[h]) || 0), 0);
  return Math.round(total * 100) / 100;
};

// A non-admin/hr_admin user's readable departments = their own department,
// PLUS any department they're a granted Definer for, PLUS any department
// they're an assigned Approver for — an Approver can be assigned to a
// department that ISN'T their own (admin may assign any user), so "own
// department only" would otherwise make it impossible for them to even view
// the plan they're meant to define/approve.
const getAccessibleDepartmentIds = async (user) => {
  const ids = new Set();
  if (user.departmentId) ids.add(String(user.departmentId));

  const grant = await KpiDefiner.findOne({ where: { userId: uid(user), isActive: true } });
  if (grant) ids.add(String(grant.departmentId));

  const approverRows = await KpiDefinitionApprover.findAll({ where: { userId: uid(user) }, attributes: ['departmentId'] });
  approverRows.forEach((r) => ids.add(String(r.departmentId)));

  return [...ids];
};

// ── List Plans ────────────────────────────────────────────────────────────────

const getPlans = async (query, user) => {
  const { financialYear, departmentId, status, role } = query;
  const where = {};
  if (financialYear) where.financialYear = financialYear;
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  // Match exact role OR plans where role is NULL (legacy plans created before role field was added)
  if (role) where.role = { [Op.or]: [role, null] };

  // Sales Director, Manager, and any plain employee (only reachable here via
  // a granted Definer/Approver — see kpiDefinitionApproval.service.js) are
  // scoped to their own department PLUS whatever department(s) they have a
  // Definer or Approver grant for — a cross-department Approver assignment is
  // a real case, not just "own department". admin/hr_admin/senior_manager
  // keep their pre-existing unrestricted read access, unchanged.
  if (['sales_director', 'manager', 'employee'].includes(user.role)) {
    const accessible = await getAccessibleDepartmentIds(user);
    where.departmentId = { [Op.in]: accessible };
  }

  const plans = await KpiPlan.findAll({
    where,
    include: [
      { model: KpiPlanItem, as: 'items', separate: true, order: [['createdAt', 'ASC']] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
    ],
    order: [['financialYear', 'DESC'], ['createdAt', 'DESC']],
  });

  return plans;
};

// ── Get Plan By ID ────────────────────────────────────────────────────────────

const getPlanById = async (id, user) => {
  const plan = await KpiPlan.findByPk(id, {
    include: [
      { model: KpiPlanItem, as: 'items', separate: true, order: [['createdAt', 'ASC']] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
    ],
  });
  if (!plan) throw new NotFoundError('KPI Plan');
  if (['manager', 'sales_director', 'employee'].includes(user.role)) {
    const accessible = await getAccessibleDepartmentIds(user);
    if (!accessible.includes(String(plan.departmentId))) throw new ForbiddenError('Access denied.');
  }
  return plan;
};

// ── Create Plan ───────────────────────────────────────────────────────────────

const createPlan = async (data, user) => {
  const { financialYear, departmentId, headWeightages, role } = data;

  if (!departmentId) throw new AppError('departmentId is required.', 400);

  const hw = headWeightages || { ...DEFAULT_HEAD_WEIGHTAGES };
  const total = validateHeadWeightages(hw);
  if (Math.round(total) !== 100)
    throw new AppError(`Head weightages must sum to 100%. Currently: ${total}%.`, 400);

  const existing = await KpiPlan.findOne({ where: { financialYear, departmentId, ...(role ? { role } : {}) } });
  if (existing) throw new ConflictError('A KPI plan already exists for this department, financial year, and role.');

  const plan = await KpiPlan.create({
    financialYear,
    departmentId,
    role,
    headWeightages: hw,
    status: KPI_PLAN_STATUS.DRAFT,
    createdById: uid(user),
  });

  return plan;
};

// ── Update Plan Metadata ──────────────────────────────────────────────────────

const updatePlan = async (id, data, user) => {
  const plan = await KpiPlan.findByPk(id);
  if (!plan) throw new NotFoundError('KPI Plan');

  if (plan.isPublished && (data.financialYear || data.departmentId || data.role !== undefined)) {
    throw new AppError('Financial year, department, and role cannot be changed on a published plan.', 400);
  }

  if (data.headWeightages) {
    const total = validateHeadWeightages(data.headWeightages);
    if (Math.round(total) !== 100)
      throw new AppError(`Head weightages must sum to 100%. Currently: ${total}%.`, 400);
    plan.headWeightages = data.headWeightages;
  }

  if (data.financialYear) plan.financialYear = data.financialYear;
  if (data.departmentId && user.role !== 'sales_director') plan.departmentId = data.departmentId;
  if (data.role !== undefined) plan.role = data.role;

  await plan.save();
  return plan;
};

// ── Update Plan Status ────────────────────────────────────────────────────────

const updatePlanStatus = async (id, status, user) => {
  const plan = await KpiPlan.findByPk(id);
  if (!plan) throw new NotFoundError('KPI Plan');

  const allowed = Object.values(KPI_PLAN_STATUS);
  if (!allowed.includes(status))
    throw new AppError(`Invalid status. Must be one of: ${allowed.join(', ')}.`, 400);

  await plan.update({ status });
  return plan;
};

// ── Add Plan Item ─────────────────────────────────────────────────────────────

const addPlanItem = async (planId, itemData, user) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');

  const newWt = parseFloat(itemData.monthlyWeightage || 0);
  const allItems = await KpiPlanItem.findAll({ where: { kpiPlanId: planId } });
  const usedTotal = allItems.reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0);
  const newTotal = Math.round((usedTotal + newWt) * 100) / 100;
  if (newTotal > 100) {
    const remaining = Math.round((100 - usedTotal) * 100) / 100;
    throw new AppError(
      `Cannot add ${newWt}% — total would be ${newTotal}%. Only ${remaining}% remaining.`,
      400
    );
  }

  const item = await KpiPlanItem.create({ ...itemData, kpiPlanId: planId });

  if (plan.isPublished) {
    KpiPlanItem.findAll({ where: { kpiPlanId: planId } }).then((updatedItems) =>
      resyncPlanAssignments(plan, updatedItems, user._id || user.id)
    ).catch((err) => console.error('[resync] addPlanItem failed:', err.message));
  }

  return item;
};

// ── Update Plan Item ──────────────────────────────────────────────────────────

const updatePlanItem = async (planId, itemId, itemData, user) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');

  const item = await KpiPlanItem.findOne({ where: { id: itemId, kpiPlanId: planId } });
  if (!item) throw new NotFoundError('KPI Plan Item');

  if (itemData.monthlyWeightage !== undefined) {
    const newWt = parseFloat(itemData.monthlyWeightage || 0);
    const allItems = await KpiPlanItem.findAll({ where: { kpiPlanId: planId } });
    const otherTotal = allItems
      .filter((i) => i.id !== itemId)
      .reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0);
    const newTotal = Math.round((otherTotal + newWt) * 100) / 100;
    if (newTotal > 100) {
      const remaining = Math.round((100 - otherTotal) * 100) / 100;
      throw new AppError(
        `Cannot set ${newWt}% — total would be ${newTotal}%. Only ${remaining}% remaining.`,
        400
      );
    }
  }

  const allowed = [
    'title', 'description', 'category', 'unit', 'kpiHead', 'assignedTo',
    'monthlyWeightage', 'targetValue', 'thresholdValue', 'stretchTarget', 'remarks', 'sortOrder',
  ];
  for (const key of allowed) {
    if (itemData[key] !== undefined) item[key] = itemData[key];
  }
  await item.save();

  if (plan.isPublished) {
    KpiPlanItem.findAll({ where: { kpiPlanId: planId } }).then((updatedItems) =>
      resyncPlanAssignments(plan, updatedItems, user._id || user.id)
    ).catch((err) => console.error('[resync] updatePlanItem failed:', err.message));
  }

  return item;
};

// ── Delete Plan Item ──────────────────────────────────────────────────────────

const deletePlanItem = async (planId, itemId, user) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');

  const item = await KpiPlanItem.findOne({ where: { id: itemId, kpiPlanId: planId } });
  if (!item) throw new NotFoundError('KPI Plan Item');

  await item.destroy();

  if (plan.isPublished) {
    KpiPlanItem.findAll({ where: { kpiPlanId: planId } }).then((updatedItems) =>
      resyncPlanAssignments(plan, updatedItems, user._id || user.id)
    ).catch((err) => console.error('[resync] deletePlanItem failed:', err.message));
  }
};

// ── Publish Plan ──────────────────────────────────────────────────────────────

// Returns all 12 months of an Indian financial year (Apr–Mar) in order
const getFYMonths = () => [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

// Builds the KpiItem payload array from a set of plan items for a given assignment id
const buildItemPayload = (assignmentId, planItems) =>
  planItems.map((planItem) => ({
    kpiAssignmentId: assignmentId,
    kpiPlanItemId: planItem.id,
    title: planItem.title,
    description: planItem.description,
    category: planItem.category,
    unit: planItem.unit,
    weightage: Math.round(parseFloat(planItem.monthlyWeightage || 0)),
    targetValue: planItem.targetValue,
    thresholdValue: planItem.thresholdValue,
    stretchTarget: planItem.stretchTarget,
    remarks: planItem.remarks,
  }));

// Reseeds KPI items for assignments up to COMMITMENT_APPROVED and resets them to ASSIGNED.
// Assignments at EMPLOYEE_SUBMITTED or later (self-assessment done) are never touched.
// Creates new assignments for months that have none yet.
const resyncPlanAssignments = async (plan, planItems, actorId) => {
  if (!plan.isPublished) return { synced: 0, created: 0 };

  const totalWeightage = Math.round(
    planItems.reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0)
  );
  const months = getFYMonths();
  const empWhere = {
    departmentId: plan.departmentId,
    isActive: true,
    // Include employees where kpiReviewApplicable is true OR null (field may be unset for legacy users)
    [Op.or]: [{ kpiReviewApplicable: true }, { kpiReviewApplicable: null }],
  };
  if (plan.role) empWhere.role = plan.role;

  const employees = await User.findAll({ where: empWhere, attributes: ['id', 'managerId', 'departmentId'] });
  console.log(`[resync] plan=${plan.id} role=${plan.role} dept=${plan.departmentId} → ${employees.length} employees, ${months.length} months`);
  let created = 0;

  for (const emp of employees) {
    const managerId = emp.managerId || actorId;

    for (const month of months) {
      const exists = await KpiAssignment.findOne({
        where: { employeeId: emp.id, financialYear: plan.financialYear, month },
      });

      if (exists) continue; // preserve existing employee KPI data untouched

      const assignment = await KpiAssignment.create({
        financialYear: plan.financialYear,
        month,
        quarter: getQuarterFromMonth(month),
        employeeId: emp.id,
        departmentId: emp.departmentId || plan.departmentId || null,
        managerId,
        createdById: actorId,
        status: KPI_STATUS.ASSIGNED,
        totalWeightage,
      });

      if (planItems.length > 0) {
        await KpiItem.bulkCreate(buildItemPayload(assignment.id, planItems));
      }
      created++;
    }
  }

  return { synced: 0, created };
};

const publishPlan = async (planId, user) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');

  const items = await KpiPlanItem.findAll({ where: { kpiPlanId: planId } });
  if (items.length === 0) throw new AppError('Cannot publish a plan with no KPI items.', 400);

  const total = Math.round(items.reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0) * 100) / 100;
  if (Math.round(total) !== 100)
    throw new AppError(`Cannot publish: total KPI weightage is ${total}%, must be exactly 100%.`, 400);

  await plan.update({ isPublished: true, publishedAt: new Date(), status: KPI_PLAN_STATUS.SAVED });

  const actorId = uid(user);
  const { synced, created } = await resyncPlanAssignments(plan, items, actorId);
  const { monthsConverted } = await retrySkippedDepartmentConversions(plan, actorId);

  return { plan, assignmentsCreated: created, assignmentsSynced: synced, monthsConverted };
};

// ── Unpublish Plan ────────────────────────────────────────────────────────────
//
// The mirror of publish — flips isPublished back to false. Never touches
// kpi_assignments/kpi_items; only changes whether findPlanForEmployee will
// use this plan for FUTURE assignment generation going forward.
//
// Hard guard: blocked entirely if even one assignment generated from this
// plan has already moved past DRAFT/ASSIGNED (i.e. the employee has
// committed/submitted something). Once real work exists under a plan, it
// cannot be pulled back to draft — only a plan where nothing has been
// touched yet may be unpublished.
const planHasCommittedAssignments = async (plan) => {
  const planItemIds = (await KpiPlanItem.findAll({ where: { kpiPlanId: plan.id }, attributes: ['id'] }))
    .map((i) => i.id);
  if (planItemIds.length === 0) return false;

  const assignmentIds = [...new Set(
    (await KpiItem.findAll({ where: { kpiPlanItemId: { [Op.in]: planItemIds } }, attributes: ['kpiAssignmentId'] }))
      .map((i) => i.kpiAssignmentId)
  )];
  if (assignmentIds.length === 0) return false;

  const UNCOMMITTED = [KPI_STATUS.DRAFT, KPI_STATUS.ASSIGNED];
  const committedCount = await KpiAssignment.count({
    where: { id: { [Op.in]: assignmentIds }, status: { [Op.notIn]: UNCOMMITTED } },
  });
  return committedCount > 0;
};

const unpublishPlan = async (planId) => {
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');
  if (!plan.isPublished) throw new AppError('This plan is not published.', 400);

  if (await planHasCommittedAssignments(plan)) {
    throw new AppError(
      'Cannot unpublish — one or more employees have already submitted commitments under this plan.',
      400
    );
  }

  await plan.update({ isPublished: false, publishedAt: null });
  return plan;
};

// ── Apply Plan to Assignment ──────────────────────────────────────────────────

const findPlanForEmployee = async (employee, financialYear) => {
  if (!employee.departmentId) return null;

  // 1. Role-specific plan takes priority
  if (employee.role) {
    const rolePlan = await KpiPlan.findOne({
      where: { financialYear, departmentId: employee.departmentId, role: employee.role, isPublished: true },
      include: [{ model: KpiPlanItem, as: 'items' }],
    });
    if (rolePlan) return rolePlan;
  }

  // 2. Fall back to department-wide plan (role is null)
  const deptPlan = await KpiPlan.findOne({
    where: { financialYear, departmentId: employee.departmentId, role: null, isPublished: true },
    include: [{ model: KpiPlanItem, as: 'items' }],
  });
  return deptPlan || null;
};

const applyPlanToAssignment = async (plan, assignmentId, t) => {
  if (!plan.items || plan.items.length === 0) return;

  const kpiItems = plan.items.map((planItem) => ({
    kpiAssignmentId: assignmentId,
    kpiPlanItemId: planItem.id,
    title: planItem.title,
    description: planItem.description,
    category: planItem.category,
    unit: planItem.unit,
    weightage: Math.round(parseFloat(planItem.monthlyWeightage || 0)),
    targetValue: planItem.targetValue,
    thresholdValue: planItem.thresholdValue,
    stretchTarget: planItem.stretchTarget,
    remarks: planItem.remarks,
  }));

  await KpiItem.bulkCreate(kpiItems, { transaction: t });
};

// ── Department transfer — convert NOT-YET-COMMITTED months only ────────────────

/**
 * When an employee moves to a new department, their KPI months split into two
 * groups:
 *  - Already committed (status beyond DRAFT/ASSIGNED) — left completely
 *    untouched. They keep their original department's KPI items, and (via the
 *    KpiAssignment.departmentId snapshot) their original department's
 *    deadlines/scoring forever.
 *  - Not yet committed (still DRAFT/ASSIGNED) — nothing typed on them yet, so
 *    it's safe to swap them onto the NEW department's KPI plan instead, since
 *    that's the work she'll actually be doing going forward.
 *
 * Only ever touches assignments belonging to the ONE employee passed in —
 * scoped strictly by employeeId, never department-wide. Returns a summary for
 * the caller to audit-log.
 */
const convertUncommittedAssignmentsOnDepartmentChange = async (employee, newDepartmentId, actorId) => {
  const UNCOMMITTED_STATUSES = [KPI_STATUS.DRAFT, KPI_STATUS.ASSIGNED];
  const pending = await KpiAssignment.findAll({
    where: { employeeId: employee.id, status: { [Op.in]: UNCOMMITTED_STATUSES } },
  });
  if (!pending.length) return { converted: [], skippedNoPlan: [] };

  // Group by financialYear — the right plan to apply can differ per FY.
  const byFY = {};
  for (const a of pending) (byFY[a.financialYear] ||= []).push(a);

  const converted = [];
  const skippedNoPlan = [];

  for (const [fy, rows] of Object.entries(byFY)) {
    const plan = await findPlanForEmployee({ id: employee.id, role: employee.role, departmentId: newDepartmentId }, fy);
    if (!plan) {
      skippedNoPlan.push(...rows.map((r) => ({ financialYear: fy, month: r.month })));
      continue;
    }

    const totalWeightage = Math.round(
      (plan.items || []).reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0)
    );

    for (const assignment of rows) {
      await sequelize.transaction(async (t) => {
        await KpiItem.destroy({ where: { kpiAssignmentId: assignment.id }, transaction: t });
        await applyPlanToAssignment(plan, assignment.id, t);
        assignment.departmentId = newDepartmentId;
        assignment.totalWeightage = totalWeightage;
        await assignment.save({ transaction: t });
      });
      converted.push({ financialYear: fy, month: assignment.month });
    }
  }

  return { converted, skippedNoPlan };
};

// ── Retry skipped department conversions — runs on every publish ───────────────
//
// If an employee's department was changed BEFORE their new department had a
// published plan, convertUncommittedAssignmentsOnDepartmentChange() above
// correctly skipped their not-yet-committed months (nothing to switch them
// to yet) and left those months snapshotted to their OLD department. Once
// this department's plan is published (now, or any later re-publish /
// "Re-sync Assignments"), automatically retry those employees instead of
// requiring a separate manual fix — same per-employee function, same
// guarantees: still-committed months are still never touched.
const retrySkippedDepartmentConversions = async (plan, actorId) => {
  const empWhere = {
    departmentId: plan.departmentId,
    isActive: true,
    [Op.or]: [{ kpiReviewApplicable: true }, { kpiReviewApplicable: null }],
  };
  if (plan.role) empWhere.role = plan.role;

  const employees = await User.findAll({ where: empWhere, attributes: ['id', 'role', 'departmentId', 'managerId'] });

  let monthsConverted = 0;
  for (const emp of employees) {
    // Only employees who actually have a month stuck on a DIFFERENT
    // department's snapshot — everyone else is already correctly synced via
    // resyncPlanAssignments and shouldn't have their items needlessly rebuilt.
    const stuck = await KpiAssignment.findOne({
      where: {
        employeeId: emp.id,
        status: { [Op.in]: [KPI_STATUS.DRAFT, KPI_STATUS.ASSIGNED] },
        departmentId: { [Op.ne]: plan.departmentId },
      },
    });
    if (!stuck) continue;

    const { converted } = await convertUncommittedAssignmentsOnDepartmentChange(emp, plan.departmentId, actorId);
    monthsConverted += converted.length;
  }

  return { monthsConverted };
};

module.exports = {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  updatePlanStatus,
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  publishPlan,
  unpublishPlan,
  findPlanForEmployee,
  applyPlanToAssignment,
  convertUncommittedAssignmentsOnDepartmentChange,
};
