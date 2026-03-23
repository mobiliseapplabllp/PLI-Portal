const authService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/response');

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const ip = req.ip || req.connection.remoteAddress;
    const result = await authService.login(identifier, password, ip);
    sendSuccess(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res) => {
  // JWT is stateless — client discards token. Just acknowledge.
  sendSuccess(res, null, 'Logged out successfully');
};

const getMe = async (req, res) => {
  sendSuccess(res, req.user, 'User profile');
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user._id, currentPassword, newPassword);
    sendSuccess(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = { login, logout, getMe, changePassword };
