'use strict';

/**
 * @module controllers/helpdesk/solution
 * Knowledge-base article CRUD.
 * listPublic is unauthenticated; all others require helpdeskAuth.
 */

const { Op }        = require('sequelize');
const { HdSolution } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/solutions/public  — PUBLIC (no auth)
 * List only public (isPublic = true) KB articles.
 * Supports query: ?search=&category=
 * @type {import('express').RequestHandler}
 */
const listPublic = async (req, res, next) => {
  try {
    const { search, category } = req.query;
    const where = { isPublic: true };

    if (search) {
      where[Op.or] = [
        { title:   { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } },
      ];
    }
    if (category) where.category = { [Op.like]: `%${category}%` };

    const articles = await HdSolution.findAll({
      where,
      attributes: ['id', 'title', 'category', 'views', 'createdAt'],
      order:      [['views', 'DESC'], ['created_at', 'DESC']],
    });

    return sendSuccess(res, articles, 'Public articles fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/solutions
 * List all KB articles (authenticated).
 * Supports query: ?search=&category=&isPublic=
 * @type {import('express').RequestHandler}
 */
const listSolutions = async (req, res, next) => {
  try {
    const { search, category, isPublic } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { title:   { [Op.like]: `%${search}%` } },
        { content: { [Op.like]: `%${search}%` } },
      ];
    }
    if (category)           where.category = { [Op.like]: `%${category}%` };
    if (isPublic !== undefined) where.isPublic = isPublic === 'true';

    const articles = await HdSolution.findAll({ where, order: [['created_at', 'DESC']] });
    return sendSuccess(res, articles, 'Solutions fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/solutions/:id
 * Get a single KB article by id. Increments views counter.
 * @type {import('express').RequestHandler}
 */
const getSolution = async (req, res, next) => {
  try {
    const article = await HdSolution.findByPk(req.params.id);
    if (!article) return next(new NotFoundError('Solution'));

    // Increment views without awaiting to keep response fast
    HdSolution.increment('views', { where: { id: article.id } }).catch(() => {});

    return sendSuccess(res, article, 'Solution fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/solutions
 * Create a KB article. Requires canManageKb permission.
 * @type {import('express').RequestHandler}
 */
const createSolution = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageKb)
      return next(new ForbiddenError('KB management permission required'));

    const { title, content, category, isPublic } = req.body;
    if (!title   || !title.trim())   return sendError(res, 'title is required', 400);
    if (!content || !content.trim()) return sendError(res, 'content is required', 400);

    const article = await HdSolution.create({
      title:     title.trim(),
      content:   content.trim(),
      category:  category  || null,
      isPublic:  !!isPublic,
      createdBy: req.hdUser.id,
    });

    return sendSuccess(res, article, 'Solution created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/solutions/:id
 * Update a KB article. Requires canManageKb permission.
 * @type {import('express').RequestHandler}
 */
const updateSolution = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageKb)
      return next(new ForbiddenError('KB management permission required'));

    const article = await HdSolution.findByPk(req.params.id);
    if (!article) return next(new NotFoundError('Solution'));

    const { title, content, category, isPublic } = req.body;
    if (title    !== undefined) article.title    = title.trim();
    if (content  !== undefined) article.content  = content.trim();
    if (category !== undefined) article.category = category;
    if (isPublic !== undefined) article.isPublic = !!isPublic;

    await article.save();
    return sendSuccess(res, article, 'Solution updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/solutions/:id
 * Delete a KB article. Requires canManageKb permission.
 * @type {import('express').RequestHandler}
 */
const deleteSolution = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageKb)
      return next(new ForbiddenError('KB management permission required'));

    const article = await HdSolution.findByPk(req.params.id);
    if (!article) return next(new NotFoundError('Solution'));

    await article.destroy();
    return sendSuccess(res, null, 'Solution deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { listPublic, listSolutions, getSolution, createSolution, updateSolution, deleteSolution };
