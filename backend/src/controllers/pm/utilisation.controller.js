/**
 * Utilisation Controller — monthly committed hours vs capacity, across
 * PM allocations + Helpdesk ticket allocations.
 *
 *   GET /pm/users/:userId/utilisation?month=YYYY-MM   (self, or management for anyone)
 *   GET /pm/utilisation?from=YYYY-MM&to=YYYY-MM&userIds=a,b,c   (management only — enforced in routes)
 */

const utilisationService = require('../../services/pm/utilisation.service');
const { sendSuccess } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');

const MGMT_ROLES = ['admin', 'manager', 'senior_manager', 'md', 'director'];

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const handleError = (e, res, next) => {
  if (e instanceof ValidationError) {
    return res.status(400).json({ success: false, message: e.message });
  }
  return next(e);
};

const getUserUtilisation = async (req, res, next) => {
  try {
    const month = req.query.month || currentMonth();
    const requesterId = String(req.user._id ?? req.user.id);
    const isMgmt = MGMT_ROLES.includes(req.user.role);
    if (!isMgmt && requesterId !== String(req.params.userId)) {
      return res.status(403).json({ success: false, message: 'You can only view your own utilisation' });
    }
    const data = await utilisationService.getUserUtilisation(req.params.userId, month);
    return sendSuccess(res, data);
  } catch (e) {
    return handleError(e, res, next);
  }
};

const getTeamUtilisation = async (req, res, next) => {
  try {
    const from = req.query.from || currentMonth();
    const to = req.query.to || from;
    const userIds = req.query.userIds
      ? String(req.query.userIds).split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    const data = await utilisationService.getTeamUtilisation({ userIds, from, to });
    return sendSuccess(res, data);
  } catch (e) {
    return handleError(e, res, next);
  }
};

module.exports = { getUserUtilisation, getTeamUtilisation, MGMT_ROLES };
