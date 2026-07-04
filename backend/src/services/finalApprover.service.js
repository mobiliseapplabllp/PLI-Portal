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
const {
  statusToNumeric,
  calculateActualWeightage,
  calculateQuarterlyScoreFromActuals,
  calculateQuarterlyScoreFromFAValues,
} = require('../utils/scoreCalculator');
const { ValidationError } = require('../utils/errors');
const auditService = require('./audit.service');
const notificationService = require('./notification.service');
const scoringConfigService = require('./scoringConfig.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

const assertFinalApproverOrAdmin = (user) => {
  if (!['final_approver', 'admin'].includes(user.role)) {
    const err = new Error('Access denied. Final Approver or Admin role required.');
    err.status = 403;
    throw err;
  }
};

const assertDeptAccess = (user, employee) => {
  // Admin can access all employees; final_approver restricted to their own department
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

  const deptId = user.role === 'final_approver' ? user.departmentId : (query.departmentId || null);

  // Include managers — they have their own KPI assignments and report to their own manager
  const empWhere = { isActive: true, role: { [Op.in]: ['employee', 'manager'] } };
  if (deptId) empWhere.departmentId = deptId;

  const employees = await User.findAll({
    where: empWhere,
    attributes: ['id', 'name', 'employeeCode', 'designation', 'departmentId', 'managerId'],
  });

  // Fetch departments and managers separately — more reliable than Sequelize includes on self-join
  const deptIds    = [...new Set(employees.map((e) => e.departmentId).filter(Boolean))];
  const managerIds = [...new Set(employees.map((e) => e.managerId).filter(Boolean))];

  const [depts, managers] = await Promise.all([
    deptIds.length    ? Department.findAll({ where: { id: deptIds },    attributes: ['id', 'name'] }) : [],
    managerIds.length ? User.findAll(      { where: { id: managerIds }, attributes: ['id', 'name'] }) : [],
  ]);

  const deptMap    = Object.fromEntries(depts.map((d) => [d.id, d.name]));
  const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.name]));

  const months = QUARTER_MONTHS[quarter] || [];
  const results = [];

  for (const emp of employees) {
    // Month statuses from KpiAssignment — include items for fallback computation
    const assignments = await KpiAssignment.findAll({
      where: { employeeId: emp.id, financialYear, month: { [Op.in]: months } },
      attributes: ['id', 'month', 'status'],
      include: [{ model: KpiItem, as: 'items', attributes: ['id', 'weightage', 'managerStatus'] }],
    });

    const monthMap = {};
    const assignmentMap = {};
    const assignmentIds = {};
    assignments.forEach((a) => {
      monthMap[a.month] = a.status;
      assignmentMap[a.month] = a;
      assignmentIds[a.month] = a.id;
    });

    const allMonthsReviewed = months.every((m) => monthMap[m] === KPI_STATUS.MANAGER_REVIEWED);
    const readyCount = months.filter((m) => monthMap[m] === KPI_STATUS.MANAGER_REVIEWED).length;

    // Load quarterly approval + its items (source of truth for weightage totals)
    const approval = await QuarterlyApproval.findOne({
      where: { employeeId: emp.id, financialYear, quarter },
      attributes: ['id', 'status', 'quarterlyScore', 'calculatedQuarterlyScore', 'approvedAt'],
      include: [{
        model: QuarterlyApprovalItem,
        as: 'items',
        attributes: ['monthlyWeightage', 'quarterlyWeightage', 'month1_actual', 'month2_actual', 'month3_actual'],
      }],
    });

    // Compute totals from quarterly_approval_items (monthlyWeightage already = yearlyWt/12)
    let totalMonthlyWt = null;
    let totalQuarterlyWt = null;
    const monthTotals = {};

    if (approval?.items?.length) {
      const items = approval.items;
      totalMonthlyWt  = items.reduce((s, i) => s + parseFloat(i.monthlyWeightage  || 0), 0);
      totalQuarterlyWt = items.reduce((s, i) => s + parseFloat(i.quarterlyWeightage || 0), 0);

      // Per-month earned = Σ(month_actual) across all KPI items
      months.forEach((m, idx) => {
        const field = `month${idx + 1}_actual`;
        const earned = items.reduce((s, i) => s + parseFloat(i[field] || 0), 0);
        monthTotals[m] = {
          possible: Math.round(totalMonthlyWt * 10000) / 10000,
          earned:   Math.round(earned * 10000) / 10000,
        };
      });
    } else if (allMonthsReviewed) {
      // No QuarterlyApproval yet — compute totals directly from KpiAssignment items
      const firstItems = assignmentMap[months[0]]?.items || [];
      if (firstItems.length) {
        totalMonthlyWt = firstItems.reduce((s, i) => s + parseFloat(i.weightage || 0) / 12, 0);
        months.forEach((m, idx) => {
          const items = assignmentMap[m]?.items || [];
          const earned = items.reduce((s, i) => {
            const monthlyWt = parseFloat(i.weightage || 0) / 12;
            return s + calculateActualWeightage(monthlyWt, i.managerStatus, null);
          }, 0);
          monthTotals[m] = {
            possible: Math.round(totalMonthlyWt * 10000) / 10000,
            earned:   Math.round(earned * 10000) / 10000,
          };
        });
        totalMonthlyWt  = Math.round(totalMonthlyWt  * 10000) / 10000;
        totalQuarterlyWt = Math.round(totalMonthlyWt * 3 * 10000) / 10000;
      }
    }

    // Strip items from approval before returning (not needed in list response)
    const approvalData = approval ? {
      id: approval.id,
      status: approval.status,
      quarterlyScore: approval.quarterlyScore,
      calculatedQuarterlyScore: approval.calculatedQuarterlyScore,
      approvedAt: approval.approvedAt,
    } : null;

    results.push({
      employee: {
        id:           emp.id,
        name:         emp.name,
        employeeCode: emp.employeeCode,
        designation:  emp.designation,
        departmentId: emp.departmentId,
        managerId:    emp.managerId,
        department:   emp.departmentId ? { id: emp.departmentId, name: deptMap[emp.departmentId] || null } : null,
        manager:      emp.managerId    ? { id: emp.managerId,    name: managerMap[emp.managerId]  || null } : null,
      },
      quarter,
      financialYear,
      months: months.map((m) => ({ month: m, status: monthMap[m] || null })),
      readyCount,
      totalMonths: months.length,
      allMonthsReviewed,
      totalMonthlyWt:   totalMonthlyWt  != null ? Math.round(totalMonthlyWt  * 10000) / 10000 : null,
      totalQuarterlyWt: totalQuarterlyWt != null ? Math.round(totalQuarterlyWt * 10000) / 10000 : null,
      assignmentIds,
      monthTotals,
      quarterlyApproval: approvalData,
    });
  }

  const approvedCount = results.filter((r) => r.quarterlyApproval?.status === 'approved').length;

  return {
    employees: results,
    totalEmployees: results.length,
    approvedCount,
    pendingCount: results.length - approvedCount,
    isQuarterComplete: results.length > 0 && approvedCount === results.length,
  };
};

// ── Build Quarterly Approval Data (auto-calc) ─────────────────────────────────

/**
 * Prepares the multiplier-based auto-calculated data for the quarterly approval workbench.
 * Groups KPI items by kpiPlanItemId across the 3 monthly assignments.
 * Uses admin-configured scoring multipliers (falls back to defaults if not configured).
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

  // Fetch active scoring config for this FY+Quarter (null = use defaults)
  const scoringConfig = await scoringConfigService.getActiveConfig(financialYear, quarter);

  // Fetch all 3 monthly assignments with their KPI items + plan item for kpiHead
  const assignments = await KpiAssignment.findAll({
    where: { employeeId, financialYear, month: { [Op.in]: months } },
    include: [{
      model: KpiItem,
      as: 'items',
      include: [{ model: KpiPlanItem, as: 'planItem', attributes: ['kpiHead'] }],
    }],
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

  // Use the FIRST month's items as the canonical template.
  // For subsequent months, look up matching items by planItemId or title.
  // This prevents cross-contamination when different months have different KPI sets
  // (e.g. one month seeded with test data, other months with real KPI data).
  const [asgn1, asgn2, asgn3] = assignments;
  const m1 = months[0]; const m2 = months[1]; const m3 = months[2];

  // Build lookup maps for months 2 and 3 keyed by planItemId OR title
  const buildLookup = (items) => {
    const byPlan = new Map(); const byTitle = new Map();
    (items || []).forEach((i) => {
      if (i.kpiPlanItemId) byPlan.set(i.kpiPlanItemId, i);
      byTitle.set(i.title, i);
    });
    return { byPlan, byTitle };
  };
  const lu2 = buildLookup(asgn2.items);
  const lu3 = buildLookup(asgn3.items);

  const findMatch = (lu, planItemId, title) =>
    (planItemId && lu.byPlan.get(planItemId)) || lu.byTitle.get(title) || null;

  const planItemMap = new Map();
  for (const item of asgn1.items) {
    const key = item.kpiPlanItemId || `title:${item.title}`;
    planItemMap.set(key, {
      kpiPlanItemId: item.kpiPlanItemId || null,
      kpiTitle: item.title,
      monthlyWeightage:  Math.round(parseFloat(item.weightage || 0) / 12 * 100) / 100,
      quarterlyWeightage: Math.round(parseFloat(item.weightage || 0) / 4  * 100) / 100,
      kpiHead: item.planItem?.kpiHead || null,
      months: {
        [m1]: item,
        [m2]: findMatch(lu2, item.kpiPlanItemId, item.title),
        [m3]: findMatch(lu3, item.kpiPlanItemId, item.title),
      },
    });
  }

  // Calculate multiplier-based actuals for each KPI plan item
  const kpiItems = [];
  for (const [planItemId, group] of planItemMap.entries()) {
    const item1 = group.months[m1]; const item2 = group.months[m2]; const item3 = group.months[m3];

    const s1 = item1?.managerStatus || null;
    const s2 = item2?.managerStatus || null;
    const s3 = item3?.managerStatus || null;

    // Legacy numeric (kept for backward compat)
    const n1 = statusToNumeric(s1);
    const n2 = statusToNumeric(s2);
    const n3 = statusToNumeric(s3);
    const numericSum = n1 + n2 + n3;

    // New multiplier-based actuals
    const wt = parseFloat(group.monthlyWeightage || 0);
    const month1_actual = calculateActualWeightage(wt, s1, scoringConfig);
    const month2_actual = calculateActualWeightage(wt, s2, scoringConfig);
    const month3_actual = calculateActualWeightage(wt, s3, scoringConfig);
    const calculatedQuarterlyActual = month1_actual + month2_actual + month3_actual;

    // isAutoCalculated: true when actual >= 0 (positive or zero — both auto-approve)
    const isAutoCalculated = calculatedQuarterlyActual >= 0;

    kpiItems.push({
      kpiPlanItemId: planItemId,
      kpiTitle: group.kpiTitle,
      monthlyWeightage: group.monthlyWeightage,
      quarterlyWeightage: group.quarterlyWeightage,
      kpiHead: group.kpiHead,
      month1: m1, month1_managerStatus: s1, month1_numeric: n1, month1_actual,
      month2: m2, month2_managerStatus: s2, month2_numeric: n2, month2_actual,
      month3: m3, month3_managerStatus: s3, month3_numeric: n3, month3_actual,
      quarterlyNumericSum: numericSum,
      calculatedQuarterlyActual,
      isAutoCalculated,
      // Pre-fill FA value with system-calculated actual (FA can override)
      suggestedQuarterlyAchievedWeightage: calculatedQuarterlyActual,
      suggestedFinalStatus: isAutoCalculated ? 'Meets' : null,
    });
  }

  return {
    employee,
    financialYear,
    quarter,
    scoringConfig: scoringConfig
      ? {
          meetsMultiplier: scoringConfig.meetsMultiplier,
          belowMultiplier: scoringConfig.belowMultiplier,
          exceedsMultiplier: scoringConfig.exceedsMultiplier,
        }
      : { meetsMultiplier: 1.0, belowMultiplier: -0.5, exceedsMultiplier: 1.5 },
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

  const data = await buildQuarterlyApprovalData(employeeId, financialYear, quarter, user);

  const t = await sequelize.transaction();
  try {
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
      await QuarterlyApprovalItem.destroy({ where: { quarterlyApprovalId: approval.id }, transaction: t });
    }

    // Store calculated quarterly score on the approval header
    const calculatedQuarterlyScore = calculateQuarterlyScoreFromActuals(data.kpiItems.map((k) => ({
      calculatedQuarterlyActual: k.calculatedQuarterlyActual,
      monthlyWeightage: k.monthlyWeightage,
    })));

    await approval.update({ calculatedQuarterlyScore }, { transaction: t });

    const itemRecords = data.kpiItems.map((kpi) => ({
      quarterlyApprovalId: approval.id,
      kpiPlanItemId: null, // stored denormalized via kpiTitle+kpiHead; avoids FK constraint on deleted plan items
      kpiTitle: kpi.kpiTitle,
      monthlyWeightage: kpi.monthlyWeightage,
      quarterlyWeightage: kpi.quarterlyWeightage,
      kpiHead: kpi.kpiHead,
      month1: kpi.month1, month1_managerStatus: kpi.month1_managerStatus, month1_numeric: kpi.month1_numeric, month1_actual: kpi.month1_actual,
      month2: kpi.month2, month2_managerStatus: kpi.month2_managerStatus, month2_numeric: kpi.month2_numeric, month2_actual: kpi.month2_actual,
      month3: kpi.month3, month3_managerStatus: kpi.month3_managerStatus, month3_numeric: kpi.month3_numeric, month3_actual: kpi.month3_actual,
      quarterlyNumericSum: kpi.quarterlyNumericSum,
      calculatedQuarterlyActual: kpi.calculatedQuarterlyActual,
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

const submitQuarterlyApproval = async (approvalId, body, user) => {
  assertFinalApproverOrAdmin(user);

  // body: { overrideEarned?: number, overrideComment?: string }
  // overrideEarned = raw earned weightage sum (M1+M2+M3), e.g. 25.21
  const overrideEarned  = body.overrideEarned != null ? parseFloat(body.overrideEarned) : null;
  const overrideComment = body.overrideComment?.trim() || null;

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

  // Calc earned sum from items (M1+M2+M3 actuals summed across all KPI items)
  const calcEarned = approval.items.reduce(
    (s, i) => s + parseFloat(i.month1_actual || 0) + parseFloat(i.month2_actual || 0) + parseFloat(i.month3_actual || 0),
    0
  );
  // Validate override: comment required when FA earned differs from system calc
  if (overrideEarned != null && Math.abs(overrideEarned - calcEarned) > 0.001 && !overrideComment) {
    throw new ValidationError('A comment is required when overriding the calculated quarterly earned weightage.');
  }

  // Total possible = Σ(monthlyWeightage × 3) across all items
  const totalPossible = approval.items.reduce(
    (s, i) => s + parseFloat(i.monthlyWeightage || 0) * 3,
    0
  );

  const t = await sequelize.transaction();
  try {
    const now = new Date();

    // Auto-fill all items from their system-calculated values (FA no longer edits per-KPI)
    for (const item of approval.items) {
      const calcActual  = parseFloat(item.calculatedQuarterlyActual ?? 0);
      const autoStatus  = calcActual > 0 ? 'Meets' : calcActual < 0 ? 'Below' : 'Meets';
      await QuarterlyApprovalItem.update(
        {
          finalStatus:                autoStatus,
          quarterlyAchievedWeightage: calcActual,
          finalComment:               overrideComment || null,
          approvedAt:                 now,
        },
        { where: { id: item.id }, transaction: t }
      );
    }

    // Convert FA earned sum to quarterly score %:
    //   quarterlyScore = (FA earned sum / total possible) × 100
    const effectiveEarned = overrideEarned != null ? overrideEarned : calcEarned;
    const quarterlyScore  = totalPossible > 0
      ? Math.round((effectiveEarned / totalPossible) * 100 * 100) / 100
      : 0;

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

    await auditService.log({
      action: AUDIT_ACTIONS.FINAL_APPROVED,
      entity: 'QuarterlyApproval',
      entityId: approvalId,
      changedById: user.id,
      details: { employeeId: approval.employeeId, quarter: approval.quarter, quarterlyScore },
    });

    await notificationService.create({
      recipient: approval.employeeId,
      type: NOTIFICATION_TYPES.FINAL_APPROVED,
      message: `Your ${approval.quarter} ${approval.financialYear} performance has been finally approved. Score: ${quarterlyScore}%`,
      referenceType: 'quarterly_approval',
      referenceId: approvalId,
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
      { model: QuarterlyApprovalItem, as: 'items', separate: true, order: [['createdAt', 'ASC']] },
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

  const deptId = user.role === 'final_approver' ? user.departmentId : (query.departmentId || null);

  const deptEmpWhere = { isActive: true };
  if (deptId) deptEmpWhere.departmentId = deptId;

  const employees = await User.findAll({
    where: deptEmpWhere,
    attributes: ['id'],
  });
  const empIds = employees.map((e) => e.id);

  const where = { employeeId: { [Op.in]: empIds } };
  if (financialYear) where.financialYear = financialYear;
  if (quarter) where.quarter = quarter;
  if (status) where.status = status;

  return QuarterlyApproval.findAll({
    where,
    include: [
      { model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode', 'designation'] },
      { model: User, as: 'finalApprover', attributes: ['id', 'name'] },
    ],
    order: [['financialYear', 'DESC'], ['quarter', 'ASC']],
  });
};

module.exports = {
  getDeptQuarterlyStatus,
  buildQuarterlyApprovalData,
  createOrUpdateQuarterlyApproval,
  submitQuarterlyApproval,
  getQuarterlyApproval,
  getDeptApprovals,
};
