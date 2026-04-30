const { Op } = require('sequelize');
const KpiPlan = require('../models/KpiPlan');
const KpiPlanItem = require('../models/KpiPlanItem');
const KpiItem = require('../models/KpiItem');
const KpiAssignment = require('../models/KpiAssignment');
const User = require('../models/User');
const Department = require('../models/Department');
const { DEFAULT_HEAD_WEIGHTAGES, KPI_PLAN_STATUS, KPI_HEADS, KPI_STATUS } = require('../config/constants');
const { AppError, NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const { getQuarterFromMonth } = require('../utils/quarterHelper');

// ── Helpers ───────────────────────────────────────────────────────────────────

const assertHrAdminOrAdmin = (user) => {
  if (!['hr_admin', 'admin'].includes(user.role))
    throw new ForbiddenError('Only HR Admin or Admin can manage KPI plans.');
};

const validateHeadWeightages = (hw) => {
  const total = KPI_HEADS.reduce((s, h) => s + (parseFloat(hw[h]) || 0), 0);
  return Math.round(total * 100) / 100;
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

  // Managers can only see their own department plan
  if (user.role === 'manager') {
    where.departmentId = user.departmentId;
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
  if (user.role === 'manager' && plan.departmentId !== user.departmentId)
    throw new ForbiddenError('Access denied.');
  return plan;
};

// ── Create Plan ───────────────────────────────────────────────────────────────

const createPlan = async (data, user) => {
  assertHrAdminOrAdmin(user);
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
    createdById: user.id,
  });

  return plan;
};

// ── Update Plan Metadata ──────────────────────────────────────────────────────

const updatePlan = async (id, data, user) => {
  assertHrAdminOrAdmin(user);
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
  if (data.departmentId) plan.departmentId = data.departmentId;
  if (data.role !== undefined) plan.role = data.role;

  await plan.save();
  return plan;
};

// ── Update Plan Status ────────────────────────────────────────────────────────

const updatePlanStatus = async (id, status, user) => {
  assertHrAdminOrAdmin(user);
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
  assertHrAdminOrAdmin(user);
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
  assertHrAdminOrAdmin(user);
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
  assertHrAdminOrAdmin(user);
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

  // Safe to reset: employee has not yet done self-assessment
  const RESEEDABLE = [
    KPI_STATUS.DRAFT,
    KPI_STATUS.ASSIGNED,
    KPI_STATUS.COMMITMENT_SUBMITTED,
    KPI_STATUS.COMMITMENT_APPROVED,
  ];

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

  const employees = await User.findAll({ where: empWhere, attributes: ['id', 'managerId'] });
  console.log(`[resync] plan=${plan.id} role=${plan.role} dept=${plan.departmentId} → ${employees.length} employees, ${months.length} months`);
  let synced = 0;
  let created = 0;

  for (const emp of employees) {
    const managerId = emp.managerId || actorId;

    for (const month of months) {
      const exists = await KpiAssignment.findOne({
        where: { employeeId: emp.id, financialYear: plan.financialYear, month },
      });

      if (exists) {
        const reseedable = RESEEDABLE.includes(exists.status);
        if (reseedable) {
          await KpiItem.destroy({ where: { kpiAssignmentId: exists.id } });
          if (planItems.length > 0) {
            await KpiItem.bulkCreate(buildItemPayload(exists.id, planItems));
          }
          // Always reset to ASSIGNED so employee re-commits with the updated items
          await exists.update({ totalWeightage, managerId, status: KPI_STATUS.ASSIGNED });
          synced++;
        }
        continue;
      }

      const assignment = await KpiAssignment.create({
        financialYear: plan.financialYear,
        month,
        quarter: getQuarterFromMonth(month),
        employeeId: emp.id,
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

  return { synced, created };
};

const publishPlan = async (planId, user) => {
  assertHrAdminOrAdmin(user);
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) throw new NotFoundError('KPI Plan');

  const items = await KpiPlanItem.findAll({ where: { kpiPlanId: planId } });
  if (items.length === 0) throw new AppError('Cannot publish a plan with no KPI items.', 400);

  const total = Math.round(items.reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0) * 100) / 100;
  if (Math.round(total) !== 100)
    throw new AppError(`Cannot publish: total KPI weightage is ${total}%, must be exactly 100%.`, 400);

  await plan.update({ isPublished: true, publishedAt: new Date(), status: KPI_PLAN_STATUS.SAVED });

  const actorId = user._id || user.id;
  const { synced, created } = await resyncPlanAssignments(plan, items, actorId);

  return { plan, assignmentsCreated: created, assignmentsSynced: synced };
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
  findPlanForEmployee,
  applyPlanToAssignment,
};
