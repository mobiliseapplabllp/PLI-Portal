'use strict';

/**
 * @module controllers/helpdesk/group
 * CRUD for helpdesk groups (teams / departments).
 * Create, update, and delete are admin-only; list and get are open to all authenticated users.
 */

const { HdGroup }         = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/groups
 * List all groups.
 * @type {import('express').RequestHandler}
 */
const listGroups = async (req, res, next) => {
  try {
    const groups = await HdGroup.findAll({ order: [['name', 'ASC']] });
    return sendSuccess(res, groups, 'Groups fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/groups/:id
 * Get a single group by id.
 * @type {import('express').RequestHandler}
 */
const getGroup = async (req, res, next) => {
  try {
    const group = await HdGroup.findByPk(req.params.id);
    if (!group) return next(new NotFoundError('Group'));
    return sendSuccess(res, group, 'Group fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/groups
 * Create a group — admin only.
 * Body: { name, managerId?, enableApprovals?, enableSla? }
 * @type {import('express').RequestHandler}
 */
const createGroup = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Admin access required'));

    const { name, managerId, enableApprovals, enableSla } = req.body;
    if (!name || !name.trim()) return sendError(res, 'name is required', 400);

    const group = await HdGroup.create({
      name:            name.trim(),
      managerId:       managerId       || null,
      enableApprovals: !!enableApprovals,
      enableSla:       !!enableSla,
    });

    return sendSuccess(res, group, 'Group created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/groups/:id
 * Update a group — admin only.
 * @type {import('express').RequestHandler}
 */
const updateGroup = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Admin access required'));

    const group = await HdGroup.findByPk(req.params.id);
    if (!group) return next(new NotFoundError('Group'));

    const { name, managerId, enableApprovals, enableSla } = req.body;
    if (name           !== undefined) group.name            = name.trim();
    if (managerId      !== undefined) group.managerId       = managerId;
    if (enableApprovals !== undefined) group.enableApprovals = !!enableApprovals;
    if (enableSla      !== undefined) group.enableSla       = !!enableSla;

    await group.save();
    return sendSuccess(res, group, 'Group updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/groups/:id
 * Delete a group — admin only.
 * @type {import('express').RequestHandler}
 */
const deleteGroup = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin)
      return next(new ForbiddenError('Admin access required'));

    const group = await HdGroup.findByPk(req.params.id);
    if (!group) return next(new NotFoundError('Group'));

    await group.destroy();
    return sendSuccess(res, null, 'Group deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { listGroups, getGroup, createGroup, updateGroup, deleteGroup };
