const { Op } = require('sequelize');
const sequelize = require('../config/database');
const QuarterlyApproval = require('../models/QuarterlyApproval');
const QuarterlyApprovalItem = require('../models/QuarterlyApprovalItem');
const KpiAssignment = require('../models/KpiAssignment');
const KpiItem = require('../models/KpiItem');
const KpiPlanItem = require('../models/KpiPlanItem');
const User = require('../models/User');
const Department = require('../models/Department');
const { KPI_STATUS, QUARTER_MONTHS, AUDIT_ACTIONS, NOTIFICATION_TYPES } = require('../config/constants');
const { statusToNumeric, calculateQuarterlyScoreFromApprovalItems } = require('../utils/scoreCalculator');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const assertFinalApproverOrAdmin = (user) => {
  if (!['final_approver', 'admin'].includes(user.role)) {
    const err = new Error('Access denied. Final Approver or Admin role required.');
    err.status = 403;
    throw err;
  }
};

const assertDeptAccess = (user, employee) => {
  if (user.role === 'final_approver' && employee.departmentId !== user.departmentId) {
    const err = new Error('Access denied. You can only approve KPIs for employees in your department.');
    err.status = 403;
    throw err;
  }
};

// ── Department Quarterly Overview ─────────────────────────────────────────────

/**
 * List all employees in the final approver's department with their quarterly status.
 */
const getDeptQuarterlyStatus = async (user, query) => {
  assertFinalApproverOrAdmin(user);
  const { financialYear, quarter } = query;

  const deptId = user.role === 'final_approver' ? user.departmentId : query.departmentId;
  if (!deptId) {
    const err = new Error('departmentId is required for admin role.');
    err.status = 400;
    throw err;
  }

  // All active employees in this dept
  const employees = await User.findAll({
    where: { departmentId: deptId, isActive: true, role: 'employee' },
    attributes: ['id', 'name', 'employeeCode', 'designation'],
  });

  const months = QUARTER_MONTHS[quarter] || [];
  const results = [];

  for (const emp of employees) {
    // Check monthly assignment statuses for each month of the quarter
    const assignments = await KpiAssignment.findAll({
      where: {
        employeeId: emp.id,
        financialYear,
        month: { [Op.in]: months },
      },
      attributes: ['id', 'month', 'status'],
    });

    const monthMap = {};
    assignments.forEach((a) => { monthMap[a.month] = a.status; });

    const allReviewed = months.every((m) => monthMap[m] === KPI_STATUS.MANAGER_REVIEWED);
    const readyCount = months.filter((m) => monthMap[m] === KPI_STATUS.MANAGER_REVIEWED).length;

    // Check if quarterly approval already exists
    const approval = await QuarterlyApproval.findOne({
      where: { employeeId: emp.id, financialYear, quarter },
      attributes: ['id', 'status', 'quarterlyScore', 'approvedAt'],
    });

    results.push({
      employee: emp,
      quarter,
      financialYear,
      months: months.map((m) => ({ month: m, status: monthMap[m] || null })),
      readyCount,
      totalMonths: months.length,
      allReviewed,
      quarterlyApproval: approval || null,
    });
  }

  return results;
};

// ── Build Quarterly Approval Data (auto-calc) ─────────────────────────────────

/**
 * Prepares the auto-calculated data for the quarterly approval workbench.
 * Groups KPI items by kpiPlanItemId across the 3 monthly assignments.
 */
const buildQuarterlyApprovalData = async (employeeId, financialYear, quarter, user) => {
  assertFinalApproverOrAdmin(user);

  const employee = await User.findByPk(employeeId, {
    attributes: ['id', 'name', 'employeeCode', 'departmentId', 'designation'],
    include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
  });
  if (!employee) {
    const err = new Error('Employee not found.');
    err.status = 404;
    throw err;
  }
  assertDeptAccess(user, employee);

  const months = QUARTER_MONTHS[quarter];
  if (!months) {
    const err = new Error(`Invalid quarter: ${quarter}`);
    err.status = 400;
    throw err;
  }

  // Fetch all 3 monthly assignments with their KPI items
  const assignments = await KpiAssignment.findAll({
    where: { employeeId, financialYear, month: { [Op.in]: months } },
    include: [{ model: KpiItem, as: 'items' }],
    order: [['month', 'ASC']],
  });

  if (assignments.length < 3) {
    const err = new Error('Not all 3 monthly assignments exist for this quarter.');
    err.status = 400;
    throw err;
  }

  const notReady = assignments.filter((a) => a.status !== KPI_STATUS.MANAGER_REVIEWED);
  if (notReady.length > 0) {
    const err = new Error(
      `All 3 monthly assignments must be in MANAGER_REVIEWED status. ` +
      `Month(s) not ready: ${notReady.map((a) => a.month).join(', ')}`
    );
    err.status = 400;
    throw err;
  }

  // Group KPI items by kpiPlanItemId across all 3 months
  // Build a map: kpiPlanItemId -> { month: KpiItem }
  const planItemMap = new Map();

  for (const assignment of assignments) {
    for (const item of assignment.items) {
      if (!item.kpiPlanItemId) continue;
      if (!planItemMap.has(item.kpiPlanItemId)) {
        planItemMap.set(item.kpiPlanItemId, {
          kpiPlanItemId: item.kpiPlanItemId,
          kpiTitle: item.title,
          monthlyWeightage: item.weightage,
          quarterlyWeightage: parseFloat(item.quarterlyWeightage || 0),
          months: {},
        });
      }
      planItemMap.get(item.kpiPlanItemId).months[assignment.month] = item;
    }
  }

  // Calculate auto-calc suggestions for each KPI plan item
  const kpiItems = [];
  for (const [planItemId, group] of planItemMap.entries()) {
    const m1 = months[0]; const m2 = months[1]; const m3 = months[2];
    const item1 = group.months[m1]; const item2 = group.months[m2]; const item3 = group.months[m3];

    const s1 = item1?.managerStatus || null;
    const s2 = item2?.managerStatus || null;
    const s3 = item3?.managerStatus || null;

    const n1 = statusToNumeric(s1);
    const n2 = statusToNumeric(s2);
    const n3 = statusToNumeric(s3);
    const sum = n1 + n2 + n3;

    const isAutoCalculated = sum > 0;

    kpiItems.push({
      kpiPlanItemId: planItemId,
      kpiTitle: group.kpiTitle,
      monthlyWeightage: group.monthlyWeightage,
      quarterlyWeightage: group.quarterlyWeightage,
      month1: m1, month1_managerStatus: s1, month1_numeric: n1,
      month2: m2, month2_managerStatus: s2, month2_numeric: n2,
      month3: m3, month3_managerStatus: s3, month3_numeric: n3,
      quarterlyNumericSum: sum,
      isAutoCalculated,
      suggestedFinalStatus: isAutoCalculated ? 'Meets' : null,
      suggestedQuarterlyAchievedWeightage: isAutoCalculated ? group.quarterlyWeightage : null,
    });
  }

  return {
    employee,
    financialYear,
    quarter,
    months: assignments.map((a) => ({ month: a.month, status: a.status, assignmentId: a.id })),
    kpiItems,
  };
};

// ── Create / Update Draft Quarterly Approval ──────────────────────────────────

const createOrUpdateQuarterlyApproval = async (employeeId, financialYear, quarter, user) => {
  assertFinalApproverOrAdmin(user);

  const employee = await User.findByPk(employeeId);
  if (!employee) {
    const err = new Error('Employee not found.');
    err.status = 404;
    throw err;
  }
  assertDeptAccess(user, employee);

  // Build auto-calc data
  const data = await buildQuarterlyApprovalData(employeeId, financialYear, quarter, user);

  const t = await sequelize.transaction();
  try {
    // Find or create the QuarterlyApproval record
    let [approval, created] = await QuarterlyApproval.findOrCreate({
      where: { employeeId, financialYear, quarter },
      defaults: {
        departmentId: employee.departmentId,
        finalApproverId: user.id,
        status: 'draft',
      },
      transaction: t,
    });

    if (!created) {
      if (approval.status === 'approved') {
        await t.rollback();
        const err = new Error('Quarterly approval already submitted and approved.');
        err.status = 400;
        throw err;
      }
      // Reset items for re-init
      await QuarterlyApprovalItem.destroy({ where: { quarterlyApprovalId: approval.id }, transaction: t });
    }

    // Create approval items with auto-calculated values
    const itemRecords = data.kpiItems.map((kpi) => ({
      quarterlyApprovalId: approval.id,
      kpiPlanItemId: kpi.kpiPlanItemId,
      kpiTitle: kpi.kpiTitle,
      monthlyWeightage: kpi.monthlyWeightage,
      quarterlyWeightage: kpi.quarterlyWeightage,
      month1: kpi.month1, month1_managerStatus: kpi.month1_managerStatus, month1_numeric: kpi.month1_numeric,
      month2: kpi.month2, month2_managerStatus: kpi.month2_managerStatus, month2_numeric: kpi.month2_numeric,
      month3: kpi.month3, month3_managerStatus: kpi.month3_managerStatus, month3_numeric: kpi.month3_numeric,
      quarterlyNumericSum: kpi.quarterlyNumericSum,
      isAutoCalculated: kpi.isAutoCalculated,
      finalStatus: kpi.suggestedFinalStatus,
      quarterlyAchievedWeightage: kpi.suggestedQuarterlyAchievedWeightage,
    }));

    await QuarterlyApprovalItem.bulkCreate(itemRecords, { transaction: t });
    await t.commit();

    return await getQuarterlyApproval(approval.id, user);
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

// ── Submit Quarterly Approval ─────────────────────────────────────────────────

const submitQuarterlyApproval = async (approvalId, itemsData, user) => {
  assertFinalApproverOrAdmin(user);

  const approval = await QuarterlyApproval.findByPk(approvalId, {
    include: [
      { model: QuarterlyApprovalItem, as: 'items' },
      { model: User, as: 'employee', attributes: ['id', 'name', 'departmentId', 'managerId'] },
    ],
  });
  if (!approval) {
    const err = new Error('Quarterly approval not found.');
    err.status = 404;
    throw err;
  }
  assertDeptAccess(user, approval.employee);

  if (approval.status === 'approved') {
    const err = new Error('This quarterly approval has already been submitted.');
    err.status = 400;
    throw err;
  }

  // Build item map for quick lookup
  const itemMap = new Map(approval.items.map((i) => [i.id, i]));

  // Validate and apply submitted item decisions
  for (const submitted of itemsData) {
    const item = itemMap.get(submitted.id);
    if (!item) {
      const err = new Error(`Approval item ${submitted.id} not found.`);
      err.status = 400;
      throw err;
    }
    const maxWeight = parseFloat(item.quarterlyWeightage);
    const achieved = parseFloat(submitted.quarterlyAchievedWeightage);
    if (isNaN(achieved) || achieved < 0) {
      const err = new Error(`quarterlyAchievedWeightage for "${item.kpiTitle}" must be >= 0.`);
      err.status = 400;
      throw err;
    }
    if (achieved > maxWeight) {
      const err = new Error(
        `quarterlyAchievedWeightage for "${item.kpiTitle}" (${achieved}%) cannot exceed quarterly weightage cap (${maxWeight}%).`
      );
      err.status = 400;
      throw err;
    }
    if (!submitted.finalStatus) {
      const err = new Error(`finalStatus is required for "${item.kpiTitle}".`);
      err.status = 400;
      throw err;
    }
  }

  const t = await sequelize.transaction();
  try {
    const now = new Date();

    // Update each approval item
    for (const submitted of itemsData) {
      await QuarterlyApprovalItem.update(
        {
          finalStatus: submitted.finalStatus,
          quarterlyAchievedWeightage: parseFloat(submitted.quarterlyAchievedWeightage),
          finalComment: submitted.finalComment || null,
          approvedAt: now,
        },
        { where: { id: submitted.id }, transaction: t }
      );
    }

    // Calculate total quarterly score
    const updatedItems = await QuarterlyApprovalItem.findAll({
      where: { quarterlyApprovalId: approvalId },
      transaction: t,
    });
    const quarterlyScore = calculateQuarterlyScoreFromApprovalItems(updatedItems);

    // Mark approval as approved
    await approval.update(
      {
        status: 'approved',
        quarterlyScore,
        finalApproverId: user.id,
        approvedAt: now,
      },
      { transaction: t }
    );

    // Transition all 3 monthly assignments to FINAL_APPROVED
    const months = QUARTER_MONTHS[approval.quarter];
    await KpiAssignment.update(
      { status: KPI_STATUS.FINAL_APPROVED, finalApprovedAt: now },
      {
        where: {
          employeeId: approval.employeeId,
          financialYear: approval.financialYear,
          month: { [Op.in]: months },
          status: KPI_STATUS.MANAGER_REVIEWED,
        },
        transaction: t,
      }
    );

    await t.commit();

    // Audit log
    await auditService.log({
      action: AUDIT_ACTIONS.FINAL_APPROVED,
      entity: 'QuarterlyApproval',
      entityId: approvalId,
      changedById: user.id,
      details: { employeeId: approval.employeeId, quarter: approval.quarter, quarterlyScore },
    });

    // Notify employee and admin
    await notificationService.create({
      recipientId: approval.employeeId,
      type: NOTIFICATION_TYPES.FINAL_APPROVED,
      message: `Your Q${approval.quarter} ${approval.financialYear} performance has been finally approved. Score: ${quarterlyScore}`,
      relatedId: approvalId,
    });

    return await getQuarterlyApproval(approvalId, user);
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

// ── Get One Quarterly Approval ────────────────────────────────────────────────

const getQuarterlyApproval = async (id, user) => {
  const approval = await QuarterlyApproval.findByPk(id, {
    include: [
      {
        model: QuarterlyApprovalItem,
        as: 'items',
        order: [['createdAt', 'ASC']],
      },
      { model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode', 'departmentId', 'designation'] },
      { model: User, as: 'finalApprover', attributes: ['id', 'name'] },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
    ],
  });
  if (!approval) {
    const err = new Error('Quarterly approval not found.');
    err.status = 404;
    throw err;
  }
  if (user.role === 'final_approver') {
    assertDeptAccess(user, approval.employee);
  }
  return approval;
};

// ── List Dept Quarterly Approvals ─────────────────────────────────────────────

const getDeptApprovals = async (user, query) => {
  assertFinalApproverOrAdmin(user);
  const { financialYear, quarter, status } = query;

  const deptId = user.role === 'final_approver' ? user.departmentId : query.departmentId;

  // Find all employees in this dept
  const employees = await User.findAll({
    where: { departmentId: deptId, isActive: true },
    attributes: ['id'],
  });
  const empIds = employees.map((e) => e.id);

  const where = { employeeId: { [Op.in]: empIds } };
  if (financialYear) where.financialYear = financialYear;
  if (quarter) where.quarter = quarter;
  if (status) where.status = status;

  const approvals = await QuarterlyApproval.findAll({
    where,
    include: [
      { model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode', 'designation'] },
      { model: User, as: 'finalApprover', attributes: ['id', 'name'] },
    ],
    order: [['financialYear', 'DESC'], ['quarter', 'ASC']],
  });

  return approvals;
};

module.exports = {
  getDeptQuarterlyStatus,
  buildQuarterlyApprovalData,
  createOrUpdateQuarterlyApproval,
  submitQuarterlyApproval,
  getQuarterlyApproval,
  getDeptApprovals,
};
