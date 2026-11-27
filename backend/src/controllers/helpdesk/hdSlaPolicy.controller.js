'use strict';
/**
 * @module controllers/helpdesk/hdSlaPolicy
 * Admin-configurable SLA timing per priority (hd_sla_policies).
 */

const HdSlaPolicy = require('../../models/helpdesk/HdSlaPolicy');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * GET /helpdesk/sla-policies
 * Returns every priority's policy — used by both the admin editor and the
 * ticket pages' live SLA status calculation.
 * @type {import('express').RequestHandler}
 */
const listPolicies = async (req, res, next) => {
  try {
    const policies = await HdSlaPolicy.findAll({ order: [['id', 'ASC']] });
    return sendSuccess(res, policies, 'SLA policies fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/sla-policies/:id
 * Update one priority's resolution window / at-risk threshold / active flag.
 * Body: { resolutionHours?, atRiskThresholdHours?, isActive? }
 * @type {import('express').RequestHandler}
 */
const updatePolicy = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Admin access required to manage SLA policies'));

    const policy = await HdSlaPolicy.findByPk(req.params.id);
    if (!policy) return next(new NotFoundError('SLA policy'));

    const { resolutionHours, atRiskThresholdHours, isActive } = req.body;
    if (resolutionHours !== undefined) {
      const n = Number(resolutionHours);
      if (!Number.isFinite(n) || n <= 0) return sendError(res, 'resolutionHours must be a positive number', 400);
      policy.resolutionHours = n;
    }
    if (atRiskThresholdHours !== undefined) {
      const n = Number(atRiskThresholdHours);
      if (!Number.isFinite(n) || n < 0) return sendError(res, 'atRiskThresholdHours must be a non-negative number', 400);
      policy.atRiskThresholdHours = n;
    }
    if (isActive !== undefined) policy.isActive = isActive === true || isActive === 'true';

    await policy.save();
    return sendSuccess(res, policy, 'SLA policy updated');
  } catch (err) {
    next(err);
  }
};

module.exports = { listPolicies, updatePolicy };
