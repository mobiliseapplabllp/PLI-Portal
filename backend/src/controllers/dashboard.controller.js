const dashboardService = require('../services/dashboard.service');
const { sendSuccess } = require('../utils/response');

const employeeDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getEmployeeDashboard(req.user._id);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const managerDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getManagerDashboard(req.user._id);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

const adminDashboard = async (req, res, next) => {
  try {
    const data = await dashboardService.getAdminDashboard();
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
};

module.exports = { employeeDashboard, managerDashboard, adminDashboard };
