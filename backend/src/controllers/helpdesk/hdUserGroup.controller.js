'use strict';
/**
 * hdUserGroup.controller.js
 * Manages helpdesk group assignments for PLI users.
 */
const { User, HdGroup } = require('../../models/helpdesk');
const Department = require('../../models/Department');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * GET /helpdesk/user-groups
 * Returns all users with their helpdesk group, as "derived + override":
 *   derivedGroupId/Name   — group backed by the user's KPI department: lowest
 *                            hd_groups.id with department_id = users.departmentId
 *                            (same rule as resolveGroupByDepartment in middleware/helpdeskAuth.js)
 *   overrideGroupId/Name  — explicit users.hd_group_id exception (null = none)
 *   effectiveGroupId/Name — override ?? derived (what helpdeskAuth actually uses)
 * Legacy fields (hdGroupId, hdGroup) are kept for compatibility.
 *
 * Batched: groups and departments are each loaded once and mapped in memory —
 * three queries regardless of user count (resolveGroupByDepartment itself is
 * per-user, so it is not called in this loop to avoid N+1).
 */
const listUserGroups = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Admin or manager access required'));

    const [users, groups, departments] = await Promise.all([
      User.findAll({
        attributes: ['id', 'name', 'email', 'role', 'hdGroupId', 'departmentId'],
        include: [{ model: HdGroup, as: 'hdGroup', attributes: ['id', 'name'], required: false }],
        order: [['name', 'ASC']],
      }),
      HdGroup.findAll({ attributes: ['id', 'name', 'departmentId'], order: [['id', 'ASC']], raw: true }),
      Department.findAll({ attributes: ['id', 'name'], raw: true }),
    ]);

    const groupById = new Map(groups.map((g) => [g.id, g]));
    // Ordered by id ASC, so the first group seen per department is the lowest id.
    const groupByDept = new Map();
    for (const g of groups) {
      if (g.departmentId && !groupByDept.has(g.departmentId)) groupByDept.set(g.departmentId, g);
    }
    const deptName = new Map(departments.map((d) => [d.id, d.name]));

    const rows = users.map((u) => {
      const plain     = u.get({ plain: true });
      const derived   = plain.departmentId ? groupByDept.get(plain.departmentId) || null : null;
      const override  = plain.hdGroupId != null ? groupById.get(plain.hdGroupId) || null : null;
      const effective = override || derived;
      return {
        ...plain,
        departmentName:     plain.departmentId ? deptName.get(plain.departmentId) ?? null : null,
        derivedGroupId:     derived ? derived.id : null,
        derivedGroupName:   derived ? derived.name : null,
        overrideGroupId:    plain.hdGroupId ?? null,
        overrideGroupName:  override ? override.name : null,
        effectiveGroupId:   effective ? effective.id : null,
        effectiveGroupName: effective ? effective.name : null,
      };
    });

    return sendSuccess(res, rows, 'User groups fetched');
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
