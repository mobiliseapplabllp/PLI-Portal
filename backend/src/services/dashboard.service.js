const { fn, col, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const KpiAssignment = require('../models/KpiAssignment');
const QuarterlyApproval = require('../models/QuarterlyApproval');
const User = require('../models/User');
const { KPI_STATUS } = require('../config/constants');
const { getFYAndQuarter, getMonthsInQuarter, getFinancialYear } = require('../utils/quarterHelper');

/**
 * Get the previous month number and the correct FY for that month.
 */
const getPreviousMonthInfo = (currentMonth, currentYear) => {
  if (currentMonth === 1) {
    return { month: 12, year: currentYear - 1 };
  }
  return { month: currentMonth - 1, year: currentYear };
};

const getEmployeeDashboard = async (userId) => {
  const now = new Date();
  const { financialYear, quarter, month } = getFYAndQuarter(now);

  const userInfo = await User.findByPk(userId, {
    attributes: ['kpiReviewApplicable'],
    include: [{ model: User, as: 'manager', attributes: ['name', 'employeeCode'] }],
  });

  // Current month assignment
  const currentMonthAssignment = await KpiAssignment.findOne({
    where: { employeeId: userId, financialYear, month },
    include: [{ model: User, as: 'manager', attributes: ['name'] }],
  });

  // Previous month assignment (for achievement submission)
  const prevInfo = getPreviousMonthInfo(month, now.getFullYear());
  const prevFY = getFinancialYear(new Date(prevInfo.year, prevInfo.month - 1, 1));
  const previousMonthAssignment = await KpiAssignment.findOne({
    where: { employeeId: userId, financialYear: prevFY, month: prevInfo.month },
    include: [{ model: User, as: 'manager', attributes: ['name'] }],
  });

  // Pending actions breakdown
  const pendingCommitment = await KpiAssignment.count({
    where: { employeeId: userId, status: KPI_STATUS.ASSIGNED },
  });
  const pendingAchievement = await KpiAssignment.count({
    where: { employeeId: userId, status: KPI_STATUS.COMMITMENT_SUBMITTED },
  });

  const quarterMonths = getMonthsInQuarter(quarter);
  const quarterAssignments = await KpiAssignment.findAll({
    where: { employeeId: userId, financialYear, month: quarterMonths },
    attributes: ['month', 'status', 'monthlyWeightedScore'],
  });

  // Try to get quarterly approval score for current quarter
  const quarterlyApproval = await QuarterlyApproval.findOne({
    where: { employeeId: userId, financialYear, quarter },
    attributes: ['quarterlyScore', 'status', 'approvedAt'],
  });

  const history = await KpiAssignment.findAll({
    where: { employeeId: userId },
    attributes: ['financialYear', 'month', 'quarter', 'status', 'monthlyWeightedScore'],
    order: [
      ['financialYear', 'DESC'],
      ['month', 'DESC'],
    ],
    limit: 6,
  });

  return {
    managerName: userInfo?.manager?.name || null,
    kpiReviewApplicable: userInfo?.kpiReviewApplicable ?? true,
    currentMonth: {
      financialYear,
      month,
      quarter,
      assignment: currentMonthAssignment,
    },
    previousMonth: {
      financialYear: prevFY,
      month: prevInfo.month,
      assignment: previousMonthAssignment,
    },
    pendingActions: {
      commitment: pendingCommitment,     // ASSIGNED → needs commitment
      achievement: pendingAchievement,   // COMMITMENT_SUBMITTED → needs achievement
      total: pendingCommitment + pendingAchievement,
    },
    quarterSnapshot: quarterAssignments,
    quarterlyApproval: quarterlyApproval || null,
    history,
  };
};

const getManagerDashboard = async (userId) => {
  const now = new Date();
  const { financialYear, month } = getFYAndQuarter(now);

  const teamMembers = await User.findAll({
    where: { managerId: userId, isActive: true },
    attributes: ['id', 'kpiReviewApplicable'],
  });
  const teamIds = teamMembers.map((u) => u.id);

  const totalTeamSize = teamMembers.length;
  const teamSize = teamMembers.filter((u) => u.kpiReviewApplicable !== false).length;

  const pendingAssignments = await KpiAssignment.count({
    where: { employeeId: teamIds, financialYear, month, status: KPI_STATUS.DRAFT },
  });

  // Pending commitments: employees who haven't committed yet
  const pendingCommitments = await KpiAssignment.count({
    where: { employeeId: teamIds, status: KPI_STATUS.ASSIGNED },
  });

  // Pending achievement submissions: employees who committed but haven't submitted achievement
  const pendingAchievementSubmissions = await KpiAssignment.count({
    where: { employeeId: teamIds, status: KPI_STATUS.COMMITMENT_SUBMITTED },
  });

  const pendingReviews = await KpiAssignment.count({
    where: { employeeId: teamIds, status: KPI_STATUS.EMPLOYEE_SUBMITTED },
  });

  const teamMonthSummary = await KpiAssignment.findAll({
    where: { employeeId: teamIds, financialYear, month },
    attributes: ['id', 'status', 'monthlyWeightedScore'],
    include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode'] }],
  });

  return {
    totalTeamSize,
    teamSize,
    pendingAssignments,
    pendingCommitments,
    pendingAchievementSubmissions,
    pendingReviews,
    teamMonthSummary,
    currentMonth: { financialYear, month },
  };
};

const getAdminDashboard = async () => {
  const now = new Date();
  const { financialYear, month, quarter } = getFYAndQuarter(now);

  const totalEmployees = await User.count({ where: { isActive: true } });

  const statusRows = await KpiAssignment.findAll({
    attributes: ['status', [fn('COUNT', col('KpiAssignment.id')), 'count']],
    where: { financialYear, month },
    group: ['status'],
    raw: true,
  });
  const statusCounts = statusRows.map((r) => ({
    _id: r.status,
    count: Number(r.count),
  }));

  // Assignments ready for quarterly approval (manager reviewed, awaiting final approver)
  const pendingFinalApprovals = await KpiAssignment.count({
    where: { status: KPI_STATUS.MANAGER_REVIEWED },
  });

  const deptRows = await sequelize.query(
    `
    SELECT
      d.name AS deptName,
      COUNT(a.id) AS total,
      SUM(CASE WHEN a.status = :locked THEN 1 ELSE 0 END) AS locked,
      SUM(CASE WHEN a.status = :finalApproved THEN 1 ELSE 0 END) AS finalApproved,
      AVG(a.monthlyWeightedScore) AS avgScore
    FROM kpi_assignments a
    INNER JOIN users u ON u.id = a.employeeId
    LEFT JOIN departments d ON d.id = u.departmentId
    WHERE a.financialYear = :fy AND a.month = :month
    GROUP BY d.id, d.name
    ORDER BY d.name ASC
    `,
    {
      replacements: {
        fy: financialYear,
        month,
        locked: KPI_STATUS.LOCKED,
        finalApproved: KPI_STATUS.FINAL_APPROVED,
      },
      type: QueryTypes.SELECT,
    }
  );

  const departmentSummary = deptRows.map((r) => ({
    _id: r.deptName || 'Unassigned',
    total: Number(r.total),
    locked: Number(r.locked),
    finalApproved: Number(r.finalApproved),
    avgScore: r.avgScore != null ? Number(r.avgScore) : null,
  }));

  // Quarterly approvals pending per department (for "Final Approver Activity" card)
  const pendingQuarterlyByDept = await sequelize.query(
    `
    SELECT
      d.id AS deptId,
      d.name AS deptName,
      COUNT(DISTINCT u.id) AS pendingCount
    FROM users u
    INNER JOIN departments d ON d.id = u.departmentId
    INNER JOIN kpi_assignments a ON a.employeeId = u.id
    WHERE a.status = :managerReviewed
      AND a.financialYear = :fy
      AND NOT EXISTS (
        SELECT 1 FROM quarterly_approvals qa
        WHERE qa.employeeId = u.id
          AND qa.financialYear = :fy
          AND qa.quarter = :quarter
          AND qa.status = 'approved'
      )
    GROUP BY d.id, d.name
    ORDER BY pendingCount DESC
    `,
    {
      replacements: {
        managerReviewed: KPI_STATUS.MANAGER_REVIEWED,
        fy: financialYear,
        quarter,
      },
      type: QueryTypes.SELECT,
    }
  );

  return {
    totalEmployees,
    currentMonth: { financialYear, month, quarter },
    statusCounts,
    pendingFinalApprovals,
    departmentSummary,
    pendingQuarterlyByDept,
  };
};

module.exports = { getEmployeeDashboard, getManagerDashboard, getAdminDashboard };
