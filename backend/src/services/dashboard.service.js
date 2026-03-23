const KpiAssignment = require('../models/KpiAssignment');
const User = require('../models/User');
const { KPI_STATUS } = require('../config/constants');
const { getFYAndQuarter, getMonthsInQuarter } = require('../utils/quarterHelper');

const getEmployeeDashboard = async (userId) => {
  const now = new Date();
  const { financialYear, quarter, month } = getFYAndQuarter(now);

  // Fetch user info with manager and kpiReviewApplicable
  const userInfo = await User.findById(userId).select('kpiReviewApplicable').populate('manager', 'name employeeCode');

  // Current month KPIs
  const currentMonthAssignment = await KpiAssignment.findOne({
    employee: userId,
    financialYear,
    month,
  }).populate('manager', 'name');

  // Pending actions (assigned but not submitted)
  const pendingCount = await KpiAssignment.countDocuments({
    employee: userId,
    status: KPI_STATUS.ASSIGNED,
  });

  // Current quarter assignments
  const quarterMonths = getMonthsInQuarter(quarter);
  const quarterAssignments = await KpiAssignment.find({
    employee: userId,
    financialYear,
    month: { $in: quarterMonths },
  }).select('month status monthlyWeightedScore');

  // Recent history (last 6 months)
  const history = await KpiAssignment.find({
    employee: userId,
  })
    .sort({ financialYear: -1, month: -1 })
    .limit(6)
    .select('financialYear month quarter status monthlyWeightedScore');

  return {
    managerName: userInfo?.manager?.name || null,
    kpiReviewApplicable: userInfo?.kpiReviewApplicable ?? true,
    currentMonth: {
      financialYear,
      month,
      quarter,
      assignment: currentMonthAssignment,
    },
    pendingActions: pendingCount,
    quarterSnapshot: quarterAssignments,
    history,
  };
};

const getManagerDashboard = async (userId) => {
  const now = new Date();
  const { financialYear, month } = getFYAndQuarter(now);

  const totalTeamSize = await User.countDocuments({ manager: userId, isActive: true });
  const teamSize = await User.countDocuments({ manager: userId, isActive: true, kpiReviewApplicable: true });

  // Pending assignments (draft — not yet assigned)
  const pendingAssignments = await KpiAssignment.countDocuments({
    manager: userId,
    financialYear,
    month,
    status: KPI_STATUS.DRAFT,
  });

  // Pending employee submissions
  const pendingEmployeeSubmissions = await KpiAssignment.countDocuments({
    manager: userId,
    status: KPI_STATUS.ASSIGNED,
  });

  // Pending manager reviews
  const pendingReviews = await KpiAssignment.countDocuments({
    manager: userId,
    status: KPI_STATUS.EMPLOYEE_SUBMITTED,
  });

  // Team current month summary
  const teamMonthSummary = await KpiAssignment.find({
    manager: userId,
    financialYear,
    month,
  })
    .populate('employee', 'name employeeCode')
    .select('employee status monthlyWeightedScore');

  return {
    totalTeamSize,
    teamSize,
    pendingAssignments,
    pendingEmployeeSubmissions,
    pendingReviews,
    teamMonthSummary,
    currentMonth: { financialYear, month },
  };
};

const getAdminDashboard = async () => {
  const now = new Date();
  const { financialYear, month, quarter } = getFYAndQuarter(now);

  const totalEmployees = await User.countDocuments({ isActive: true });

  // Organization-wide progress for current month
  const statusCounts = await KpiAssignment.aggregate([
    { $match: { financialYear, month } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  // Pending final reviews
  const pendingFinalReviews = await KpiAssignment.countDocuments({
    status: KPI_STATUS.MANAGER_REVIEWED,
  });

  // Department-wise summary
  const deptSummary = await KpiAssignment.aggregate([
    { $match: { financialYear, month } },
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
        _id: '$dept.name',
        total: { $sum: 1 },
        locked: { $sum: { $cond: [{ $eq: ['$status', KPI_STATUS.LOCKED] }, 1, 0] } },
        avgScore: { $avg: '$monthlyWeightedScore' },
      },
    },
  ]);

  return {
    totalEmployees,
    currentMonth: { financialYear, month, quarter },
    statusCounts,
    pendingFinalReviews,
    departmentSummary: deptSummary,
  };
};

module.exports = { getEmployeeDashboard, getManagerDashboard, getAdminDashboard };
