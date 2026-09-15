'use strict';

/**
 * @module controllers/helpdesk/group
 * CRUD for helpdesk groups (teams). A group may be backed by a KPI department
 * (`departmentId` → departments.id) and led by a PLI user (`managerId` → users.id).
 * Create, update, and delete are admin-only; list and get are open to all authenticated users.
 *
 * `departments` and `users` are KPI-owned tables: read only, never written here.
 */

const { HdGroup }         = require('../../models/helpdesk');
const User                = require('../../models/User');
const Department          = require('../../models/Department');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Attach `departmentName` to each group with a single departments query. */
async function withDepartmentNames(groups) {
  const rows = groups.map((g) => (typeof g.get === 'function' ? g.get({ plain: true }) : { ...g }));
  const ids  = [...new Set(rows.map((g) => g.departmentId).filter(Boolean))];
  const names = new Map();
  if (ids.length) {
    const depts = await Department.findAll({ where: { id: ids }, attributes: ['id', 'name'] });
    for (const d of depts) names.set(String(d.id), d.name);
  }
  for (const g of rows) g.departmentName = g.departmentId ? (names.get(String(g.departmentId)) ?? null) : null;
  return rows;
}

/**
 * Validate the optional departmentId / managerId inputs.
 * `undefined` = not sent (leave as is); null/'' = clear; otherwise must exist.
 * @returns {Promise<string|null>} error message, or null when valid
 */
async function validateRefs({ departmentId, managerId }) {
  if (departmentId !== undefined && departmentId !== null && departmentId !== '') {
    const dept = await Department.findByPk(departmentId, { attributes: ['id'] });
    if (!dept) return 'departmentId does not match an existing department';
  }
  if (managerId !== undefined && managerId !== null && managerId !== '') {
    const user = await User.findOne({ where: { id: managerId, isActive: true }, attributes: ['id'] });
    if (!user) return 'managerId must be an existing active user';
  }
  return null;
}

const orNull = (v) => (v === undefined || v === null || v === '' ? null : v);

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/groups
 * List all groups (each with `departmentName`).
 * @type {import('express').RequestHandler}
 */
const listGroups = async (req, res, next) => {
  try {
    const groups = await HdGroup.findAll({ order: [['name', 'ASC']] });
    return sendSuccess(res, await withDepartmentNames(groups), 'Groups fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/groups/:id
 * Get a single group by id (with `departmentName`).
 * @type {import('express').RequestHandler}
 */
const getGroup = async (req, res, next) => {
  try {
    const group = await HdGroup.findByPk(req.params.id);
    if (!group) return next(new NotFoundError('Group'));
    const [row] = await withDepartmentNames([group]);
    return sendSuccess(res, row, 'Group fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/groups
 * Create a group — admin only.
 * Body: { name, managerId?, departmentId?, enableApprovals?, enableSla? }
 * managerId must be an active user; departmentId must be an existing department (400 otherwise).
 * @type {import('express').RequestHandler}
 */
const createGroup = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Admin access required'));

    const { name, managerId, departmentId, enableApprovals, enableSla } = req.body;
    if (!name || !name.trim()) return sendError(res, 'name is required', 400);

    const refError = await validateRefs({ departmentId, managerId });
    if (refError) return sendError(res, refError, 400);

    const group = await HdGroup.create({
      name:            name.trim(),
      managerId:       orNull(managerId),
      departmentId:    orNull(departmentId),
      enableApprovals: !!enableApprovals,
      enableSla:       !!enableSla,
    });

    const [row] = await withDepartmentNames([group]);
    return sendSuccess(res, row, 'Group created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/groups/:id
 * Update a group — admin only. Same validation as create; send null to clear a reference.
 * @type {import('express').RequestHandler}
 */
const updateGroup = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Admin access required'));

    const group = await HdGroup.findByPk(req.params.id);
    if (!group) return next(new NotFoundError('Group'));

    const { name, managerId, departmentId, enableApprovals, enableSla } = req.body;
    if (name !== undefined && (!name || !name.trim())) return sendError(res, 'name cannot be empty', 400);

    const refError = await validateRefs({ departmentId, managerId });
    if (refError) return sendError(res, refError, 400);

    if (name            !== undefined) group.name            = name.trim();
    if (managerId       !== undefined) group.managerId       = orNull(managerId);
    if (departmentId    !== undefined) group.departmentId    = orNull(departmentId);
    if (enableApprovals !== undefined) group.enableApprovals = !!enableApprovals;
    if (enableSla       !== undefined) group.enableSla       = !!enableSla;

    await group.save();
    const [row] = await withDepartmentNames([group]);
    return sendSuccess(res, row, 'Group updated');
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
