const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');

const clientIp = (req) => req.ip || req.connection?.remoteAddress;

const requestOtp = async (req, res, next) => {
  try {
    const result = await authService.requestLoginOtp(req.body.identifier, clientIp(req));
    // Deliberately generic — never reveals whether the account exists
    sendSuccess(res, result, 'If the account exists, a sign-in code has been sent to its registered email.');
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyLoginOtp(req.body.identifier, req.body.code, clientIp(req));
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

module.exports = { logout, getMe, requestOtp, verifyOtp };
