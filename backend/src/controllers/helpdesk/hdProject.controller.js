'use strict';

/**
 * @module controllers/helpdesk/hdProject
 * CRUD for helpdesk projects, including public widget token management.
 */

const crypto      = require('crypto');
const { HdProject } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/projects
 * List helpdesk projects.
 * - ?groupId=N   → only projects belonging to that group (used by CreateTicket)
 * - ?all=true    → all projects regardless of group (admin/settings)
 * Without filters, returns projects visible to the caller's group.
 * @type {import('express').RequestHandler}
 */
const listProjects = async (req, res, next) => {
  try {
    const { groupId, all } = req.query;
    const where = {};
    if (groupId) {
      where.groupId = parseInt(groupId, 10) || null;
    }
    const projects = await HdProject.findAll({
      where,
      order: [['name', 'ASC']],
    });
    return sendSuccess(res, projects, 'Projects fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/projects/:id
 * Get a single project by id.
 * @type {import('express').RequestHandler}
 */
const getProject = async (req, res, next) => {
  try {
    const project = await HdProject.findByPk(req.params.id);
    if (!project) return next(new NotFoundError('Project'));
    return sendSuccess(res, project, 'Project fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/projects
 * Create a project. Admin or canManageProjects only.
 * Auto-generates publicToken using crypto.randomUUID().
 * @type {import('express').RequestHandler}
 */
const createProject = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Insufficient permissions'));

    const { name, description, managerId, groupId, status } = req.body;
    if (!name || !name.trim()) return sendError(res, 'name is required', 400);

    const project = await HdProject.create({
      name:        name.trim(),
      description: description || null,
      managerId:   managerId   || req.hdUser.id,
      groupId:     groupId     || null,
      status:      status      || 'Active',
      publicToken: crypto.randomUUID(),
    });

    return sendSuccess(res, project, 'Project created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/projects/:id
 * Update a project. Admin or canManageProjects only.
 * @type {import('express').RequestHandler}
 */
const updateProject = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Insufficient permissions'));

    const project = await HdProject.findByPk(req.params.id);
    if (!project) return next(new NotFoundError('Project'));

    const { name, description, managerId, groupId, status } = req.body;
    if (name        !== undefined) project.name        = name.trim();
    if (description !== undefined) project.description = description;
    if (managerId   !== undefined) project.managerId   = managerId;
    if (groupId     !== undefined) project.groupId     = groupId || null;
    if (status      !== undefined) project.status      = status;

    await project.save();
    return sendSuccess(res, project, 'Project updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/projects/:id
 * Delete a project — admin only.
 * @type {import('express').RequestHandler}
 */
const deleteProject = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin)
      return next(new ForbiddenError('Admin access required'));

    const project = await HdProject.findByPk(req.params.id);
    if (!project) return next(new NotFoundError('Project'));

    await project.destroy();
    return sendSuccess(res, null, 'Project deleted');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/projects/:id/regenerate-token
 * Regenerate the public widget token. Admin or canManageProjects only.
 * @type {import('express').RequestHandler}
 */
const regenerateToken = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Insufficient permissions'));

    const project = await HdProject.findByPk(req.params.id);
    if (!project) return next(new NotFoundError('Project'));

    project.publicToken = crypto.randomUUID();
    await project.save();

    return sendSuccess(res, { publicToken: project.publicToken }, 'Public token regenerated');
  } catch (err) {
    next(err);
  }
};

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject, regenerateToken };
