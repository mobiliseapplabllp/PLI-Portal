'use strict';

/**
 * @module controllers/helpdesk/assignee
 * Handles operations on individual HdTicketAssignee rows:
 *   DELETE /helpdesk/assignees/:id  — remove an assignee
 *   PUT    /helpdesk/assignees/:id  — update contributionPct
 */

const { HdTicketAssignee } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * DELETE /helpdesk/assignees/:id
 * Remove one HdTicketAssignee row.
 * Only the assigned agent, or a user with canAssign permission, or an admin can remove.
 * @type {import('express').RequestHandler}
 */
const removeAssignee = async (req, res, next) => {
  try {
    const assignee = await HdTicketAssignee.findByPk(req.params.id);
    if (!assignee) return next(new NotFoundError('Assignee record'));

    const hdUser = req.hdUser;
    if (!hdUser.isAdmin && assignee.userId !== hdUser.id && !hdUser.permissions.canAssign) {
      return next(new ForbiddenError('You do not have permission to remove this assignee'));
    }

    await assignee.destroy();

    return sendSuccess(res, { removed: true }, 'Assignee removed');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/assignees/:id
 * Update the contributionPct on one HdTicketAssignee row.
 * Body: { contributionPct: number }
 * @type {import('express').RequestHandler}
 */
const updateAssignee = async (req, res, next) => {
  try {
    const assignee = await HdTicketAssignee.findByPk(req.params.id);
    if (!assignee) return next(new NotFoundError('Assignee record'));

    const hdUser = req.hdUser;
    if (!hdUser.isAdmin && assignee.userId !== hdUser.id && !hdUser.permissions.canAssign) {
      return next(new ForbiddenError('You do not have permission to update this assignee'));
    }

    const { contributionPct } = req.body;
    if (contributionPct !== undefined) {
      const pct = Number(contributionPct);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        return sendError(res, 'contributionPct must be a number between 0 and 100', 400);
      }
      assignee.contributionPct = pct;
    }

    await assignee.save();
    return sendSuccess(res, assignee, 'Assignee updated');
  } catch (err) {
    next(err);
  }
};

module.exports = { removeAssignee, updateAssignee };
