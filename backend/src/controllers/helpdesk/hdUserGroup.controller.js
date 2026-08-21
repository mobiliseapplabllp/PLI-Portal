'use strict';
/**
 * hdUserGroup.controller.js
 * Manages helpdesk group assignments for PLI users.
 */
const { User, HdGroup } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * GET /helpdesk/user-groups
 * Returns all users with their current helpdesk group assignment.
 */
const listUserGroups = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Admin or manager access required'));

    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'hdGroupId'],
      include: [{
        model:      HdGroup,
        as:         'hdGroup',
        attributes: ['id', 'name'],
        required:   false,
      }],
      order: [['name', 'ASC']],
    });

    return sendSuccess(res, users, 'User groups fetched');
  } catch (err) { next(err); }
};

/**
 * PUT /helpdesk/user-groups/:userId
 * Assigns (or unassigns) a user to a helpdesk group.
 * Body: { groupId: number | null }
 */
const assignUserGroup = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Admin or manager access required'));

    const { userId } = req.params;
    const { groupId } = req.body;

    const user = await User.findByPk(userId);
    if (!user) return next(new NotFoundError('User'));

    if (groupId !== null && groupId !== undefined) {
      const group = await HdGroup.findByPk(groupId);
      if (!group) return sendError(res, 'Group not found', 404);
    }

    user.hdGroupId = groupId || null;
    await user.save();

    return sendSuccess(res, { userId, groupId: user.hdGroupId }, 'User group updated');
  } catch (err) { next(err); }
};

/**
 * PUT /helpdesk/user-groups/bulk
 * Bulk-assigns multiple users to groups.
 * Body: { assignments: [{ userId, groupId }] }
 */
const bulkAssignUserGroups = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin)
      return next(new ForbiddenError('Admin access required'));

    const { assignments } = req.body;
    if (!Array.isArray(assignments) || assignments.length === 0)
      return sendError(res, 'assignments must be a non-empty array', 400);

    const results = [];
    for (const { userId, groupId } of assignments) {
      const user = await User.findByPk(userId);
      if (user) {
        user.hdGroupId = groupId || null;
        await user.save();
        results.push({ userId, groupId: user.hdGroupId, status: 'updated' });
      } else {
        results.push({ userId, groupId, status: 'not_found' });
      }
    }

    return sendSuccess(res, results, 'Bulk assignment complete');
  } catch (err) { next(err); }
};

module.exports = { listUserGroups, assignUserGroup, bulkAssignUserGroups };
