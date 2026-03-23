const KpiAssignment = require('../models/KpiAssignment');
const KpiItem = require('../models/KpiItem');
const PliRule = require('../models/PliRule');
const { getMonthsInQuarter } = require('../utils/quarterHelper');
const { calculateQuarterlyScore, matchPliSlab } = require('../utils/scoreCalculator');

/**
 * Monthly KPI report for individual or filtered set
 */
const getMonthlyReport = async (query) => {
  const filter = {};
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);
  if (query.employee) filter.employee = query.employee;

  const assignments = await KpiAssignment.find(filter)
    .populate('employee', 'name employeeCode department')
    .populate('manager', 'name employeeCode')
    .sort({ month: 1 });

  // Attach items for each assignment
  const results = [];
  for (const a of assignments) {
    const items = await KpiItem.find({ kpiAssignment: a._id });
    results.push({ assignment: a, items });
  }

  return results;
};

/**
 * Quarterly summary report with PLI recommendation
 */
const getQuarterlyReport = async (query) => {
  const { financialYear, quarter } = query;
  const months = getMonthsInQuarter(quarter);

  // Get ALL assignments for the quarter (not just locked) so we can show status info
  const allAssignments = await KpiAssignment.find({
    financialYear,
    month: { $in: months },
  })
    .populate('employee', 'name employeeCode department designation')
    .populate('manager', 'name employeeCode');

  // Group by employee
  const employeeMap = {};
  for (const a of allAssignments) {
    const empId = a.employee._id.toString();
    if (!employeeMap[empId]) {
      employeeMap[empId] = {
        employee: a.employee,
        manager: a.manager,
        months: {},
      };
    }
    employeeMap[empId].months[a.month] = {
      score: a.status === 'locked' ? a.monthlyWeightedScore : null,
      status: a.status,
    };
  }

  // Get PLI rules
  const pliRule = await PliRule.findOne({ financialYear, quarter, isActive: true });

  // Calculate quarterly scores (only locked months count towards score)
  const results = Object.values(employeeMap).map((entry) => {
    const monthlyScores = months.map((m) => entry.months[m]?.score ?? null);
    const quarterlyScore = calculateQuarterlyScore(monthlyScores);
    const pliSlab = pliRule ? matchPliSlab(quarterlyScore, pliRule.slabs) : null;

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
      allMonthsLocked: months.every((m) => entry.months[m]?.status === 'locked'),
      pliRecommendation: pliSlab,
    };
  });

  return results;
};

/**
 * Department performance report
 */
const getDepartmentReport = async (query) => {
  const filter = {};
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);

  return KpiAssignment.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: 'users',
        localField: 'employee',
        foreignField: '_id',
        as: 'emp',
      },
    },
    { $unwind: '$emp' },
    {
      $lookup: {
        from: 'departments',
        localField: 'emp.department',
        foreignField: '_id',
        as: 'dept',
      },
    },
    { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { department: '$dept.name', departmentId: '$dept._id' },
        totalAssignments: { $sum: 1 },
        avgScore: { $avg: '$monthlyWeightedScore' },
        locked: { $sum: { $cond: [{ $eq: ['$status', 'locked'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $ne: ['$status', 'locked'] }, 1, 0] } },
      },
    },
    { $sort: { '_id.department': 1 } },
  ]);
};

/**
 * Pending submissions report
 */
const getPendingReport = async (query) => {
  const filter = { status: { $nin: ['locked', 'final_reviewed'] } };
  if (query.financialYear) filter.financialYear = query.financialYear;
  if (query.month) filter.month = Number(query.month);

  return KpiAssignment.find(filter)
    .populate('employee', 'name employeeCode department')
    .populate('manager', 'name employeeCode')
    .sort({ status: 1, month: 1 });
};

module.exports = { getMonthlyReport, getQuarterlyReport, getDepartmentReport, getPendingReport };
