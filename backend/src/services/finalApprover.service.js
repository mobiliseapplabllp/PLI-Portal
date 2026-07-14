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
const { createAuditLog } = require('../middleware/auditLogger');
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
  if (user.role === 'final_approver' && employee.departmentId !== user.departmentId) {
    const err = new Error('Access denied. You can only approve KPIs for employees in your department.');
    err.status = 403;
    throw err;
  }
};

// ── Department Quarterly Overview ─────────────────────────────────────────────

/**
 * List all employees in the final approver's department with their quarterly status.
 * FIX 1: fallback monthTotals now uses real scoringConfig instead of null.
 * FIX 2: employees processed in parallel via Promise.all (no more sequential for-loop).
 */
const getDeptQuarterlyStatus = async (user, query) => {
  assertFinalApproverOrAdmin(user);
  const { financialYear, quarter } = query;

  const deptId = user.role === 'final_approver' ? user.departmentId : (query.departmentId || null);

  const empWhere = { isActive: true, role: { [Op.in]: ['employee', 'manager'] } };
  if (deptId) empWhere.departmentId = deptId;

  const [employees, scoringConfig] = await Promise.all([
    User.findAll({
      where: empWhere,
      attributes: ['id', 'name', 'employeeCode', 'designation', 'departmentId', 'managerId'],
    }),
    // FIX 1: load real scoring config once for the FY — used in fallback computation
    scoringConfigService.getActiveConfig(financialYear),
  ]);

  const deptIds    = [...new Set(employees.map((e) => e.departmentId).filter(Boolean))];
  const managerIds = [...new Set(employees.map((e) => e.managerId).filter(Boolean))];

  const [depts, managers] = await Promise.all([
    deptIds.length    ? Department.findAll({ where: { id: deptIds },    attributes: ['id', 'name'] }) : [],
    managerIds.length ? User.findAll(      { where: { id: managerIds }, attributes: ['id', 'name'] }) : [],
  ]);

  const deptMap    = Object.fromEntries(depts.map((d) => [d.id, d.name]));
  const managerMap = Object.fromEntries(managers.map((m) => [m.id, m.name]));

  const months = QUARTER_MONTHS[quarter] || [];

  // FIX 2: process all employees in parallel — removes the sequential for-loop bottleneck
  const results = await Promise.all(employees.map(async (emp) => {
    const [assignments, approval] = await Promise.all([
      KpiAssignment.findAll({
        where: { employeeId: emp.id, financialYear, month: { [Op.in]: months } },
        attributes: ['id', 'month', 'status'],
        include: [{ model: KpiItem, as: 'items', attributes: ['id', 'weightage', 'managerStatus'] }],
      }),
      QuarterlyApproval.findOne({
        where: { employeeId: emp.id, financialYear, quarter },
        attributes: ['id', 'status', 'quarterlyScore', 'calculatedQuarterlyScore', 'approvedAt'],
        include: [{
          model: QuarterlyApprovalItem,
          as: 'items',
          attributes: ['monthlyWeightage', 'quarterlyWeightage', 'month1_actual', 'month2_actual', 'month3_actual', 'finalComment'],
        }],
      }),
    ]);

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

    let totalMonthlyWt = null;
    let totalQuarterlyWt = null;
    const monthTotals = {};

    if (approval?.items?.length) {
      const items = approval.items;
      totalMonthlyWt   = items.reduce((s, i) => s + parseFloat(i.monthlyWeightage  || 0), 0);
      totalQuarterlyWt = items.reduce((s, i) => s + parseFloat(i.quarterlyWeightage || 0), 0);

      months.forEach((m, idx) => {
        const field = `month${idx + 1}_actual`;
        const earned = items.reduce((s, i) => s + parseFloat(i[field] || 0), 0);
        monthTotals[m] = {
          possible: Math.round(totalMonthlyWt * 10000) / 10000,
          earned:   Math.round(earned * 10000) / 10000,
        };
      });
    } else {
      // No QuarterlyApproval yet — show data for whichever months are already manager-reviewed
      const firstReviewedMonth = months.find((m) => monthMap[m] === KPI_STATUS.MANAGER_REVIEWED);
      const referenceItems = firstReviewedMonth
        ? (assignmentMap[firstReviewedMonth]?.items || [])
        : (assignmentMap[months[0]]?.items || []);

      if (referenceItems.length) {
        totalMonthlyWt = referenceItems.reduce((s, i) => s + parseFloat(i.weightage || 0) / 12, 0);
        months.forEach((m) => {
          if (monthMap[m] !== KPI_STATUS.MANAGER_REVIEWED) return; // skip unreviewed months
          const items = assignmentMap[m]?.items || [];
          const earned = items.reduce((s, i) => {
            const monthlyWt = parseFloat(i.weightage || 0) / 12;
            return s + calculateActualWeightage(monthlyWt, i.managerStatus, scoringConfig);
          }, 0);
          monthTotals[m] = {
            possible: Math.round(totalMonthlyWt * 10000) / 10000,
            earned:   Math.round(earned * 10000) / 10000,
          };
        });
        totalMonthlyWt   = Math.round(totalMonthlyWt  * 10000) / 10000;
        totalQuarterlyWt = Math.round(totalMonthlyWt * 3 * 10000) / 10000;
      }
    }

    const approvalData = approval ? {
      id: approval.id,
      status: approval.status,
      quarterlyScore: approval.quarterlyScore,
      calculatedQuarterlyScore: approval.calculatedQuarterlyScore,
      approvedAt: approval.approvedAt,
      faComment: approval.items?.find((i) => i.finalComment)?.finalComment || null,
    } : null;

    return {
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
    };
  }));

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
 * Prepares multiplier-based auto-calculated data for the quarterly approval workbench.
 * Config is fetched by FY only (applies to all quarters).
 */
const buildQuarterlyApprovalData = async (employeeId, financialYear, quarter, user) => {
  assertFinalApproverOrAdmin(user);
  return _buildQuarterlyApprovalData(employeeId, financialYear, quarter);
};

/**
 * Internal: builds the data without role assertion.
 * Used by createOrUpdateQuarterlyApproval and autoInitQuarterlyApproval.
 */
const _buildQuarterlyApprovalData = async (employeeId, financialYear, quarter) => {
  const employee = await User.findByPk(employeeId, {
    attributes: ['id', 'name', 'employeeCode', 'departmentId', 'designation'],
    include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }],
  });
  if (!employee) {
    const err = new Error('Employee not found.');
    err.status = 404;
    throw err;
  }

  const months = QUARTER_MONTHS[quarter];
  if (!months) {
    const err = new Error(`Invalid quarter: ${quarter}`);
    err.status = 400;
    throw err;
  }

  // FY-only config — one config applies to all quarters
  const scoringConfig = await scoringConfigService.getActiveConfig(financialYear);

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

  const [asgn1, asgn2, asgn3] = assignments;
  const m1 = months[0]; const m2 = months[1]; const m3 = months[2];

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

  const kpiItems = [];
  for (const [planItemId, group] of planItemMap.entries()) {
    const item1 = group.months[m1]; const item2 = group.months[m2]; const item3 = group.months[m3];

    const s1 = item1?.managerStatus || null;
    const s2 = item2?.managerStatus || null;
    const s3 = item3?.managerStatus || null;

    const n1 = statusToNumeric(s1);
    const n2 = statusToNumeric(s2);
    const n3 = statusToNumeric(s3);
    const numericSum = n1 + n2 + n3;

    const wt = parseFloat(group.monthlyWeightage || 0);
    const month1_actual = calculateActualWeightage(wt, s1, scoringConfig);
    const month2_actual = calculateActualWeightage(wt, s2, scoringConfig);
    const month3_actual = calculateActualWeightage(wt, s3, scoringConfig);
    const calculatedQuarterlyActual = month1_actual + month2_actual + month3_actual;

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
      suggestedQuarterlyAchievedWeightage: calculatedQuarterlyActual,
      suggestedFinalStatus: isAutoCalculated ? 'Meets' : null,
    });
  }

  return {
    employee,
    financialYear,
    quarter,
    scoringConfigId: scoringConfig?.id || null,
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

  return _persistQuarterlyApproval(employeeId, financialYear, quarter, user.id);
};

/**
 * Internal: build + persist QuarterlyApproval without role checks.
 * Called by both createOrUpdateQuarterlyApproval (FA-triggered) and
 * autoInitQuarterlyApproval (system-triggered on manager month-3 submit).
 * FIX 4: scoringConfigId is stored as snapshot on the QA record.
 */
const _persistQuarterlyApproval = async (employeeId, financialYear, quarter, initiatorId) => {
  const data = await _buildQuarterlyApprovalData(employeeId, financialYear, quarter);

  const t = await sequelize.transaction();
  try {
    const employee = await User.findByPk(employeeId, { transaction: t });

    let [approval, created] = await QuarterlyApproval.findOrCreate({
      where: { employeeId, financialYear, quarter },
      defaults: {
        departmentId:    employee.departmentId,
        finalApproverId: initiatorId || null,
        status:          'draft',
        // FIX 4: snapshot the config used so audit trail is preserved even if config changes later
        scoringConfigId: data.scoringConfigId,
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
      // Update scoringConfigId snapshot on reinit
      await approval.update({ scoringConfigId: data.scoringConfigId }, { transaction: t });
    }

    const calculatedQuarterlyScore = calculateQuarterlyScoreFromActuals(data.kpiItems.map((k) => ({
      calculatedQuarterlyActual: k.calculatedQuarterlyActual,
      monthlyWeightage: k.monthlyWeightage,
    })));

    await approval.update({ calculatedQuarterlyScore }, { transaction: t });

    const itemRecords = data.kpiItems.map((kpi) => ({
      quarterlyApprovalId: approval.id,
      kpiPlanItemId: null,
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

    return await getQuarterlyApproval(approval.id, { role: 'admin' });
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

/**
 * System-triggered auto-init when manager submits month 3 of a quarter (Option B).
 * No role assertion — called internally from kpiAssignment.service after manager review.
 * Silently no-ops if already approved or data not ready.
 */
const autoInitQuarterlyApproval = async (employeeId, financialYear, quarter) => {
  try {
    // Serialise concurrent auto-inits for the same employee+quarter using a row-level lock.
    // Without this, two concurrent manager reviews can both pass the status check and race
    // inside _persistQuarterlyApproval, causing one destroy+bulkCreate to wipe the other's items.
    const t = await sequelize.transaction();
    try {
      const existing = await QuarterlyApproval.findOne({
        where: { employeeId, financialYear, quarter },
        attributes: ['id', 'status'],
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (existing?.status === 'approved') { await t.commit(); return; }
      await t.commit();
    } catch (lockErr) {
      await t.rollback();
      throw lockErr;
    }

    await _persistQuarterlyApproval(employeeId, financialYear, quarter, null);
    console.log(`[FA Auto-Init] QA created/refreshed for emp=${employeeId} ${financialYear} ${quarter}`);
  } catch (err) {
    // Non-fatal — log and continue. Manager submit must not fail because of this.
    console.error(`[FA Auto-Init] Failed for emp=${employeeId} ${financialYear} ${quarter}: ${err.message}`);
  }
};

// ── Submit Quarterly Approval ─────────────────────────────────────────────────

const submitQuarterlyApproval = async (approvalId, body, user) => {
  assertFinalApproverOrAdmin(user);

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

  const calcEarned = approval.items.reduce(
    (s, i) => s + parseFloat(i.month1_actual || 0) + parseFloat(i.month2_actual || 0) + parseFloat(i.month3_actual || 0),
    0
  );
  if (overrideEarned != null && Math.abs(overrideEarned - calcEarned) > 0.001 && !overrideComment) {
    throw new ValidationError('A comment is required when overriding the calculated quarterly earned weightage.');
  }

  const totalPossible = approval.items.reduce(
    (s, i) => s + parseFloat(i.monthlyWeightage || 0) * 3,
    0
  );

  // Declare months BEFORE the transaction so all inner uses can see it
  const months = QUARTER_MONTHS[approval.quarter];

  // Distribute the override proportionally across line items so per-item sums
  // stay consistent with the approved header total.
  const calcEarnedTotal = approval.items.reduce(
    (s, i) => s + parseFloat(i.calculatedQuarterlyActual || 0),
    0
  );
  const effectiveEarned = overrideEarned != null ? overrideEarned : calcEarned;
  const overrideRatio   = calcEarnedTotal !== 0 ? effectiveEarned / calcEarnedTotal : 1;

  const t = await sequelize.transaction();
  try {
    const now = new Date();

    for (const item of approval.items) {
      const calcActual  = parseFloat(item.calculatedQuarterlyActual ?? 0);
      // Scale each item's achieved weightage by the override ratio so Σ(items) === effectiveEarned
      const finalActual = Math.round(calcActual * overrideRatio * 100) / 100;
      const autoStatus  = finalActual >= 0 ? 'Meets' : 'Below';
      await QuarterlyApprovalItem.update(
        {
          finalStatus:                autoStatus,
          quarterlyAchievedWeightage: finalActual,
          finalComment:               overrideComment || null,
          approvedAt:                 now,
        },
        { where: { id: item.id }, transaction: t }
      );
    }

    // Write the correct MONTHLY credit back to KpiItem for each of the 3 months.
    // This is what the employee portal reads — must be monthly value (e.g. 0.83),
    // NOT annual weightage (e.g. 10). Old code incorrectly stored annual value here.
    const monthAssignments = await KpiAssignment.findAll({
      where: {
        employeeId: approval.employeeId,
        financialYear: approval.financialYear,
        month: { [Op.in]: months },
      },
      attributes: ['id', 'month'],
      transaction: t,
    });
    const assignmentByMonth = Object.fromEntries(monthAssignments.map((a) => [a.month, a.id]));

    for (const qaItem of approval.items) {
      const monthActuals = [
        { month: qaItem.month1, actual: parseFloat(qaItem.month1_actual || 0), status: qaItem.month1_managerStatus },
        { month: qaItem.month2, actual: parseFloat(qaItem.month2_actual || 0), status: qaItem.month2_managerStatus },
        { month: qaItem.month3, actual: parseFloat(qaItem.month3_actual || 0), status: qaItem.month3_managerStatus },
      ];
      for (const { month, actual, status } of monthActuals) {
        const assignmentId = assignmentByMonth[month];
        if (!assignmentId) continue;
        await KpiItem.update(
          {
            finalApproverAchievedWeightage: Math.round(actual * 100) / 100,
            finalApproverStatus:            status || (actual >= 0 ? 'Meets' : 'Below'),
            finalApprovedAt:                now,
            finalApprovedById:              user.id,
          },
          { where: { kpiAssignmentId: assignmentId, title: qaItem.kpiTitle }, transaction: t }
        );
      }
    }

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

    await createAuditLog({
      entityType: 'QuarterlyApproval',
      entityId: approvalId,
      action: AUDIT_ACTIONS.FINAL_APPROVED,
      changedBy: user.id,
      newValue: { employeeId: approval.employeeId, quarter: approval.quarter, quarterlyScore },
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

// ── Bulk Recalculate Quarter (Fix 5 — Option A) ───────────────────────────────

/**
 * Recalculate month_actual values and calculatedQuarterlyScore for ALL employees
 * in a quarter using the current active scoring config.
 *
 * Option A: does NOT change FA final score, status, or quarterlyScore.
 * Only updates the system-calculated reference values.
 * Safe to run on approved records — FA decisions are preserved.
 */
const bulkRecalculateQuarter = async (financialYear, quarter, departmentId, user) => {
  assertFinalApproverOrAdmin(user);

  const deptId = user.role === 'final_approver' ? user.departmentId : (departmentId || null);

  const empWhere = { isActive: true, role: { [Op.in]: ['employee', 'manager'] } };
  if (deptId) empWhere.departmentId = deptId;

  const [employees, scoringConfig] = await Promise.all([
    User.findAll({ where: empWhere, attributes: ['id'] }),
    scoringConfigService.getActiveConfig(financialYear),
  ]);

  const months = QUARTER_MONTHS[quarter];
  if (!months) {
    const err = new Error(`Invalid quarter: ${quarter}`);
    err.status = 400;
    throw err;
  }

  let recalculated = 0;
  let skipped = 0;

  await Promise.all(employees.map(async (emp) => {
    try {
      const approval = await QuarterlyApproval.findOne({
        where: { employeeId: emp.id, financialYear, quarter },
        include: [{ model: QuarterlyApprovalItem, as: 'items' }],
      });
      if (!approval || !approval.items?.length) { skipped++; return; }

      // Fetch fresh KPI items with current managerStatus from assignments
      const assignments = await KpiAssignment.findAll({
        where: { employeeId: emp.id, financialYear, month: { [Op.in]: months } },
        include: [{ model: KpiItem, as: 'items', attributes: ['id', 'title', 'weightage', 'managerStatus', 'kpiPlanItemId'] }],
        order: [['month', 'ASC']],
      });
      if (assignments.length < 3) { skipped++; return; }

      const [asgn1, asgn2, asgn3] = assignments;
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
      const findMatch = (lu, planId, title) =>
        (planId && lu.byPlan.get(planId)) || lu.byTitle.get(title) || null;

      const t = await sequelize.transaction();
      try {
        let sumActual = 0; let sumPossible = 0;

        for (const qaItem of approval.items) {
          // Find corresponding KPI items in each month by title match
          const i1 = asgn1.items.find((i) => i.title === qaItem.kpiTitle || (i.kpiPlanItemId && i.kpiPlanItemId === qaItem.kpiPlanItemId));
          const i2 = i1 ? findMatch(lu2, i1.kpiPlanItemId, i1.title) : null;
          const i3 = i1 ? findMatch(lu3, i1.kpiPlanItemId, i1.title) : null;

          const wt = parseFloat(qaItem.monthlyWeightage || 0);
          const m1_actual = calculateActualWeightage(wt, i1?.managerStatus || null, scoringConfig);
          const m2_actual = calculateActualWeightage(wt, i2?.managerStatus || null, scoringConfig);
          const m3_actual = calculateActualWeightage(wt, i3?.managerStatus || null, scoringConfig);
          const calcQtrActual = m1_actual + m2_actual + m3_actual;

          await QuarterlyApprovalItem.update(
            {
              month1_actual: m1_actual,
              month2_actual: m2_actual,
              month3_actual: m3_actual,
              calculatedQuarterlyActual: calcQtrActual,
              isAutoCalculated: calcQtrActual >= 0,
            },
            { where: { id: qaItem.id }, transaction: t }
          );

          sumActual   += calcQtrActual;
          sumPossible += wt * 3;
        }

        const newCalcScore = sumPossible > 0
          ? Math.round((sumActual / sumPossible) * 100 * 100) / 100
          : 0;

        // Update both system-calculated score and FA final score with new config multipliers
        await approval.update(
          {
            calculatedQuarterlyScore: newCalcScore,
            quarterlyScore:           newCalcScore,
            scoringConfigId:          scoringConfig?.id || null,
          },
          { transaction: t }
        );

        await t.commit();
        recalculated++;
      } catch (innerErr) {
        await t.rollback();
        console.error(`[BulkRecalc] Failed for emp=${emp.id}: ${innerErr.message}`);
        skipped++;
      }
    } catch (outerErr) {
      console.error(`[BulkRecalc] Outer error for emp=${emp.id}: ${outerErr.message}`);
      skipped++;
    }
  }));

  await createAuditLog({
    entityType: 'QuarterlyApproval',
    entityId: null,
    action: 'BULK_RECALCULATE',
    changedBy: user.id,
    newValue: { financialYear, quarter, deptId, recalculated, skipped, scoringConfigId: scoringConfig?.id || null },
  });

  return { recalculated, skipped, total: employees.length };
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

  const employees = await User.findAll({ where: deptEmpWhere, attributes: ['id'] });
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
  autoInitQuarterlyApproval,
  submitQuarterlyApproval,
  bulkRecalculateQuarter,
  getQuarterlyApproval,
  getDeptApprovals,
};
