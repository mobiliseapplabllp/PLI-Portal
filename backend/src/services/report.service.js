const { QueryTypes, Op } = require('sequelize');
const sequelize = require('../config/database');
const KpiAssignment = require('../models/KpiAssignment');
const KpiItem = require('../models/KpiItem');
const QuarterlyApproval = require('../models/QuarterlyApproval');
const PliRule = require('../models/PliRule');
const PliSlab = require('../models/PliSlab');
const User = require('../models/User');
const Department = require('../models/Department');
const { getMonthsInQuarter } = require('../utils/quarterHelper');
const { calculateQuarterlyScore, matchPliSlab } = require('../utils/scoreCalculator');

const assignmentIncludes = [
  {
    model: User,
    as: 'employee',
    attributes: ['id', 'name', 'employeeCode', 'email', 'designation', 'departmentId'],
    include: [
      { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
      { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode', 'email'] },
    ],
  },
  { model: User, as: 'manager', attributes: ['id', 'name', 'employeeCode'] },
];

const withCurrentManager = (assignment) => {
  const plain = assignment?.get ? assignment.get({ plain: true }) : assignment;
  if (!plain) return plain;
  return {
    ...plain,
    currentManager: plain.employee?.manager || null,
  };
};

const getMonthlyReport = async (query) => {
  const where = {};
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.month) where.month = Number(query.month);
  if (query.employee) where.employeeId = query.employee;

  const assignments = await KpiAssignment.findAll({
    where,
    include: assignmentIncludes,
    order: [['month', 'ASC']],
  });

  const results = [];
  for (const a of assignments) {
    const items = await KpiItem.findAll({
      where: { kpiAssignmentId: a.id },
      order: [['createdAt', 'ASC']],
    });
    results.push({ assignment: withCurrentManager(a), items });
  }

  return results;
};

const getQuarterlyReport = async (query) => {
  const { financialYear, quarter } = query;
  const months = getMonthsInQuarter(quarter);

  const allAssignments = await KpiAssignment.findAll({
    where: { financialYear, month: { [Op.in]: months } },
    include: assignmentIncludes,
  });

  const employeeMap = {};
  for (const a of allAssignments) {
    const emp = a.employee;
    const empId = emp.id;
    if (!employeeMap[empId]) {
      employeeMap[empId] = {
        employee: emp,
        manager: a.employee?.manager || a.manager,
        months: {},
      };
    }
    employeeMap[empId].months[a.month] = {
      score: a.status === 'locked' ? Number(a.monthlyWeightedScore) : null,
      status: a.status,
    };
  }

  const pliRule = await PliRule.findOne({
    where: { financialYear, quarter, isActive: true },
    include: [{ model: PliSlab, as: 'slabs', separate: true, order: [['minScore', 'ASC']] }],
  });

  const slabs = pliRule?.slabs?.map((s) => s.get({ plain: true })) || [];

  // Fetch quarterly approvals for this FY + quarter to get final quarterly scores
  const employeeIds = Object.keys(employeeMap);
  const quarterlyApprovals = await QuarterlyApproval.findAll({
    where: { financialYear, quarter, employeeId: employeeIds, status: 'approved' },
    attributes: ['employeeId', 'quarterlyScore'],
  });
  const quarterlyApprovalMap = {};
  for (const qa of quarterlyApprovals) {
    quarterlyApprovalMap[qa.employeeId] = Number(qa.quarterlyScore);
  }

  return Object.values(employeeMap).map((entry) => {
    const monthlyScores = months.map((m) => entry.months[m]?.score ?? null);
    // Prefer final-approved quarterly score; fall back to avg of monthly scores (legacy)
    const empId = entry.employee.id;
    const quarterlyScore = quarterlyApprovalMap[empId] != null
      ? quarterlyApprovalMap[empId]
      : calculateQuarterlyScore(monthlyScores);
    const quarterlyScoreSource = quarterlyApprovalMap[empId] != null ? 'final_approved' : 'estimated';

    const pliSlab = pliRule ? matchPliSlab(quarterlyScore, slabs) : null;

    return {
      employee: entry.employee,
      manager: entry.manager,
      monthlyScores: months.reduce((acc, m, i) => {
        acc[m] = monthlyScores[i];
        return acc;
      }, {}),
      monthlyStatuses: months.reduce((acc, m) => {
        acc[m] = entry.months[m]?.status || null;
        return acc;
      }, {}),
      quarterlyScore,
      quarterlyScoreSource,
      allMonthsLocked: months.every((m) => entry.months[m]?.status === 'locked'),
      pliRecommendation: pliSlab,
    };
  });
};

const getDepartmentReport = async (query) => {
  const replacements = {};
  let sqlWhere = '1=1';
  if (query.financialYear) {
    sqlWhere += ' AND a.financialYear = :fy';
    replacements.fy = query.financialYear;
  }
  if (query.month) {
    sqlWhere += ' AND a.month = :month';
    replacements.month = Number(query.month);
  }

  const rows = await sequelize.query(
    `
    SELECT
      d.name AS departmentName,
      d.id AS departmentId,
      COUNT(a.id) AS totalAssignments,
      AVG(a.monthlyWeightedScore) AS avgScore,
      SUM(CASE WHEN a.status = 'locked' THEN 1 ELSE 0 END) AS locked,
      SUM(CASE WHEN a.status != 'locked' THEN 1 ELSE 0 END) AS pending
    FROM kpi_assignments a
    INNER JOIN users u ON u.id = a.employeeId
    LEFT JOIN departments d ON d.id = u.departmentId
    WHERE ${sqlWhere}
    GROUP BY d.id, d.name
    ORDER BY d.name ASC
    `,
    { replacements, type: QueryTypes.SELECT }
  );

  return rows.map((r) => ({
    _id: { department: r.departmentName, departmentId: r.departmentId },
    totalAssignments: Number(r.totalAssignments),
    avgScore: r.avgScore != null ? Number(r.avgScore) : null,
    locked: Number(r.locked),
    pending: Number(r.pending),
  }));
};

const getPendingReport = async (query) => {
  // Exclude locked and both final status variants (new final_approved + legacy final_reviewed)
  const where = { status: { [Op.notIn]: ['locked', 'final_approved', 'final_reviewed'] } };
  if (query.financialYear) where.financialYear = query.financialYear;
  if (query.month) where.month = Number(query.month);

  const assignments = await KpiAssignment.findAll({
    where,
    include: assignmentIncludes,
    order: [
      ['status', 'ASC'],
      ['month', 'ASC'],
    ],
  });
  return assignments.map(withCurrentManager);
};

module.exports = { getMonthlyReport, getQuarterlyReport, getDepartmentReport, getPendingReport };
