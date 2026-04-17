const { Op } = require('sequelize');
const sequelize = require('../config/database');
const KpiPlan = require('../models/KpiPlan');
const KpiPlanItem = require('../models/KpiPlanItem');
const KpiItem = require('../models/KpiItem');
const User = require('../models/User');
const Department = require('../models/Department');
const { QUARTER_MAP } = require('../config/constants');

// ── Helpers ───────────────────────────────────────────────────────────────────

const assertNotPublished = (plan) => {
  if (plan.isPublished) {
    const err = new Error('This plan is published and cannot be modified.');
    err.status = 400;
    throw err;
  }
};

const assertHrAdminOrAdmin = (user) => {
  if (!['hr_admin', 'admin'].includes(user.role)) {
    const err = new Error('Only HR Admin or Admin can manage KPI plans.');
    err.status = 403;
    throw err;
  }
};

// Recalculate and persist totalMonthlyWeightage + totalQuarterlyWeightage on the plan
const recalcPlanTotals = async (planId, t) => {
  const items = await KpiPlanItem.findAll({ where: { kpiPlanId: planId }, transaction: t });
  const totalMonthly = items.reduce((s, i) => s + parseFloat(i.monthlyWeightage || 0), 0);
  const totalQuarterly = items.reduce((s, i) => s + parseFloat(i.quarterlyWeightage || 0), 0);
  await KpiPlan.update(
    {
      totalMonthlyWeightage: Math.round(totalMonthly * 100) / 100,
      totalQuarterlyWeightage: Math.round(totalQuarterly * 100) / 100,
    },
    { where: { id: planId }, transaction: t }
  );
};

// ── List Plans ────────────────────────────────────────────────────────────────

const getPlans = async (query, user) => {
  const { financialYear, month, quarter, scope, managerId, departmentId } = query;
  const where = {};
  if (financialYear) where.financialYear = financialYear;
  if (month) where.month = parseInt(month);
  if (quarter) where.quarter = quarter;
  if (scope) where.scope = scope;
  if (managerId) where.managerId = managerId;
  if (departmentId) where.departmentId = departmentId;

  // Managers can only see their own team plans
  if (user.role === 'manager') {
    where[Op.or] = [
      { managerId: user.id },
      { departmentId: user.departmentId },
    ];
  }

  const plans = await KpiPlan.findAll({
    where,
    include: [
      { model: KpiPlanItem, as: 'items', order: [['createdAt', 'ASC']] },
      { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode'] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
    ],
    order: [['financialYear', 'DESC'], ['month', 'DESC']],
  });

  return plans;
};

// ── Get Plan By ID ────────────────────────────────────────────────────────────

const getPlanById = async (id, user) => {
  const plan = await KpiPlan.findByPk(id, {
    include: [
      { model: KpiPlanItem, as: 'items', order: [['sortOrder', 'ASC'], ['createdAt', 'ASC']] },
      { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode'] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
      { model: User, as: 'createdBy', attributes: ['id', 'name'] },
    ],
  });
  if (!plan) {
    const err = new Error('KPI Plan not found.');
    err.status = 404;
    throw err;
  }
  // Managers can only see their own team plan or their dept plan
  if (user.role === 'manager' && plan.managerId !== user.id && plan.departmentId !== user.departmentId) {
    const err = new Error('Access denied.');
    err.status = 403;
    throw err;
  }
  return plan;
};

// ── Create Plan ───────────────────────────────────────────────────────────────

const createPlan = async (data, user) => {
  assertHrAdminOrAdmin(user);
  const { financialYear, month, scope, managerId, departmentId } = data;

  if (scope === 'team' && !managerId) {
    const err = new Error('managerId is required for team-scoped plans.');
    err.status = 400;
    throw err;
  }
  if (scope === 'department' && !departmentId) {
    const err = new Error('departmentId is required for department-scoped plans.');
    err.status = 400;
    throw err;
  }

  const quarter = QUARTER_MAP[parseInt(month)];
  if (!quarter) {
    const err = new Error('Invalid month.');
    err.status = 400;
    throw err;
  }

  // Check for duplicate
  const existing = await KpiPlan.findOne({
    where: {
      financialYear,
      month: parseInt(month),
      ...(scope === 'team' ? { managerId } : { departmentId }),
    },
  });
  if (existing) {
    const err = new Error('A plan already exists for this team/department and month.');
    err.status = 409;
    throw err;
  }

  const plan = await KpiPlan.create({
    financialYear,
    month: parseInt(month),
    quarter,
    scope,
    managerId: scope === 'team' ? managerId : null,
    departmentId: scope === 'department' ? departmentId : null,
    createdById: user.id,
  });

  return plan;
};

// ── Update Plan Metadata ──────────────────────────────────────────────────────

const updatePlan = async (id, data, user) => {
  assertHrAdminOrAdmin(user);
  const plan = await KpiPlan.findByPk(id);
  if (!plan) {
    const err = new Error('KPI Plan not found.');
    err.status = 404;
    throw err;
  }
  assertNotPublished(plan);

  const allowed = ['financialYear', 'month', 'scope', 'managerId', 'departmentId'];
  for (const key of allowed) {
    if (data[key] !== undefined) plan[key] = data[key];
  }
  if (data.month) plan.quarter = QUARTER_MAP[parseInt(data.month)] || plan.quarter;
  await plan.save();
  return plan;
};

// ── Add Plan Item ─────────────────────────────────────────────────────────────

const addPlanItem = async (planId, itemData, user) => {
  assertHrAdminOrAdmin(user);
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) {
    const err = new Error('KPI Plan not found.');
    err.status = 404;
    throw err;
  }
  assertNotPublished(plan);

  const newMonthly = parseFloat(itemData.monthlyWeightage || 0);
  const currentTotal = parseFloat(plan.totalMonthlyWeightage || 0);
  if (currentTotal + newMonthly > 100) {
    const err = new Error(
      `Adding this item would exceed 100% monthly weightage. Currently at ${currentTotal}%, adding ${newMonthly}%.`
    );
    err.status = 400;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    const item = await KpiPlanItem.create({ ...itemData, kpiPlanId: planId }, { transaction: t });
    await recalcPlanTotals(planId, t);
    await t.commit();
    return item;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

// ── Update Plan Item ──────────────────────────────────────────────────────────

const updatePlanItem = async (planId, itemId, itemData, user) => {
  assertHrAdminOrAdmin(user);
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) {
    const err = new Error('KPI Plan not found.');
    err.status = 404;
    throw err;
  }
  assertNotPublished(plan);

  const item = await KpiPlanItem.findOne({ where: { id: itemId, kpiPlanId: planId } });
  if (!item) {
    const err = new Error('KPI Plan Item not found.');
    err.status = 404;
    throw err;
  }

  // Validate new monthly total
  if (itemData.monthlyWeightage !== undefined) {
    const newMonthly = parseFloat(itemData.monthlyWeightage);
    const otherTotal = parseFloat(plan.totalMonthlyWeightage) - parseFloat(item.monthlyWeightage);
    if (otherTotal + newMonthly > 100) {
      const err = new Error(
        `This change would exceed 100% monthly weightage. Other items total ${otherTotal}%, new value ${newMonthly}%.`
      );
      err.status = 400;
      throw err;
    }
  }

  const t = await sequelize.transaction();
  try {
    const allowed = ['title', 'description', 'category', 'unit', 'monthlyWeightage',
      'quarterlyWeightage', 'targetValue', 'thresholdValue', 'stretchTarget', 'remarks', 'sortOrder'];
    for (const key of allowed) {
      if (itemData[key] !== undefined) item[key] = itemData[key];
    }
    await item.save({ transaction: t });
    await recalcPlanTotals(planId, t);
    await t.commit();
    return item;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

// ── Delete Plan Item ──────────────────────────────────────────────────────────

const deletePlanItem = async (planId, itemId, user) => {
  assertHrAdminOrAdmin(user);
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) {
    const err = new Error('KPI Plan not found.');
    err.status = 404;
    throw err;
  }
  assertNotPublished(plan);

  const item = await KpiPlanItem.findOne({ where: { id: itemId, kpiPlanId: planId } });
  if (!item) {
    const err = new Error('KPI Plan Item not found.');
    err.status = 404;
    throw err;
  }

  const t = await sequelize.transaction();
  try {
    await item.destroy({ transaction: t });
    await recalcPlanTotals(planId, t);
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

// ── Publish Plan ──────────────────────────────────────────────────────────────

const publishPlan = async (planId, user) => {
  assertHrAdminOrAdmin(user);
  const plan = await KpiPlan.findByPk(planId);
  if (!plan) {
    const err = new Error('KPI Plan not found.');
    err.status = 404;
    throw err;
  }
  if (plan.isPublished) {
    const err = new Error('Plan is already published.');
    err.status = 400;
    throw err;
  }

  const total = parseFloat(plan.totalMonthlyWeightage || 0);
  if (Math.round(total) !== 100) {
    const err = new Error(
      `Cannot publish: monthly weightage total is ${total}%, must be exactly 100%.`
    );
    err.status = 400;
    throw err;
  }

  const items = await KpiPlanItem.findAll({ where: { kpiPlanId: planId } });
  if (items.length === 0) {
    const err = new Error('Cannot publish a plan with no KPI items.');
    err.status = 400;
    throw err;
  }

  await plan.update({ isPublished: true, publishedAt: new Date() });
  return plan;
};

// ── Apply Plan to Assignment (called from kpiAssignment.service.js) ───────────

/**
 * Find the best published KPI plan for an employee's assignment.
 * Priority: team plan (managerId match) > department plan.
 * @param {object} employee - User instance with managerId and departmentId
 * @param {string} financialYear
 * @param {number} month
 * @returns {KpiPlan|null}
 */
const findPlanForEmployee = async (employee, financialYear, month) => {
  // 1. Try team plan first (manager's team)
  if (employee.managerId) {
    const teamPlan = await KpiPlan.findOne({
      where: { financialYear, month, managerId: employee.managerId, isPublished: true },
      include: [{ model: KpiPlanItem, as: 'items' }],
    });
    if (teamPlan) return teamPlan;
  }

  // 2. Fall back to department plan
  if (employee.departmentId) {
    const deptPlan = await KpiPlan.findOne({
      where: { financialYear, month, departmentId: employee.departmentId, isPublished: true },
      include: [{ model: KpiPlanItem, as: 'items' }],
    });
    if (deptPlan) return deptPlan;
  }

  return null;
};

/**
 * Bulk-create KpiItems for an assignment from a published KPI plan.
 * @param {KpiPlan} plan - with .items preloaded
 * @param {string} assignmentId
 * @param {object} t - Sequelize transaction (optional)
 */
const applyPlanToAssignment = async (plan, assignmentId, t) => {
  if (!plan.items || plan.items.length === 0) return;

  const kpiItems = plan.items.map((planItem, idx) => ({
    kpiAssignmentId: assignmentId,
    kpiPlanItemId: planItem.id,
    title: planItem.title,
    description: planItem.description,
    category: planItem.category,
    unit: planItem.unit,
    weightage: Math.round(parseFloat(planItem.monthlyWeightage)),
    quarterlyWeightage: parseFloat(planItem.quarterlyWeightage || 0),
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
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  publishPlan,
  findPlanForEmployee,
  applyPlanToAssignment,
};
