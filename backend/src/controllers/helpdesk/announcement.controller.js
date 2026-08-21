'use strict';

/**
 * @module controllers/helpdesk/announcement
 * CRUD for helpdesk system-wide announcements.
 * List returns only active (non-expired) records.
 */

const { Op }             = require('sequelize');
const { HdAnnouncement } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/announcements
 * List active announcements (expiresAt IS NULL OR expiresAt > NOW()).
 * @type {import('express').RequestHandler}
 */
const listAnnouncements = async (req, res, next) => {
  try {
    const announcements = await HdAnnouncement.scope('active').findAll({
      order: [['created_at', 'DESC']],
    });
    return sendSuccess(res, announcements, 'Announcements fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/announcements/all
 * List all announcements including expired (admin/manager only).
 * @type {import('express').RequestHandler}
 */
const listAllAnnouncements = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canViewReports)
      return next(new ForbiddenError('Insufficient permissions'));

    const announcements = await HdAnnouncement.findAll({ order: [['created_at', 'DESC']] });
    return sendSuccess(res, announcements, 'All announcements fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/announcements/:id
 * Get a single announcement.
 * @type {import('express').RequestHandler}
 */
const getAnnouncement = async (req, res, next) => {
  try {
    const ann = await HdAnnouncement.findByPk(req.params.id);
    if (!ann) return next(new NotFoundError('Announcement'));
    return sendSuccess(res, ann, 'Announcement fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/announcements
 * Create an announcement — admin only.
 * Body: { title, body, expiresAt? }
 * @type {import('express').RequestHandler}
 */
const createAnnouncement = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Manager or admin access required'));

    const { title, body, expiresAt } = req.body;
    if (!title || !title.trim()) return sendError(res, 'title is required', 400);
    if (!body  || !body.trim())  return sendError(res, 'body is required', 400);

    const ann = await HdAnnouncement.create({
      title:     title.trim(),
      body:      body.trim(),
      createdBy: req.hdUser.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return sendSuccess(res, ann, 'Announcement created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/announcements/:id
 * Update an announcement — admin only.
 * @type {import('express').RequestHandler}
 */
const updateAnnouncement = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin)
      return next(new ForbiddenError('Admin access required'));

    const ann = await HdAnnouncement.findByPk(req.params.id);
    if (!ann) return next(new NotFoundError('Announcement'));

    const { title, body, expiresAt } = req.body;
    if (title     !== undefined) ann.title     = title.trim();
    if (body      !== undefined) ann.body      = body.trim();
    if (expiresAt !== undefined) ann.expiresAt = expiresAt ? new Date(expiresAt) : null;

    await ann.save();
    return sendSuccess(res, ann, 'Announcement updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/announcements/:id
 * Delete an announcement — admin only.
 * @type {import('express').RequestHandler}
 */
const deleteAnnouncement = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin)
      return next(new ForbiddenError('Admin access required'));

    const ann = await HdAnnouncement.findByPk(req.params.id);
    if (!ann) return next(new NotFoundError('Announcement'));

    await ann.destroy();
    return sendSuccess(res, null, 'Announcement deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listAnnouncements,
  listAllAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
