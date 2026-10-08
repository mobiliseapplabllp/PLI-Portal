'use strict';
/**
 * @module controllers/helpdesk/hdOption
 * CRUD for helpdesk dropdown options (category, mode, impact, urgency, etc.)
 */

const HdOption = require('../../models/helpdesk/HdOption');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { Op } = require('sequelize');

/**
 * GET /helpdesk/options?type=X
 * Returns all options for a given type, ordered by sort_order then name.
 * @type {import('express').RequestHandler}
 */
const listOptions = async (req, res, next) => {
  try {
    const { type } = req.query;

    if (!type) return sendError(res, 'type query param is required', 400);
    if (!HdOption.VALID_TYPES.includes(type))
      return sendError(res, `type must be one of: ${HdOption.VALID_TYPES.join(', ')}`, 400);

    const options = await HdOption.findAll({
      where: { type },
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });

    return sendSuccess(res, options, `${type} options fetched`);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/options
 * Create a new option.
 * Body: { type, name, description?, sortOrder? }
 * @type {import('express').RequestHandler}
 */
const createOption = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Admin access required to manage options'));

    const { type, name, description, sortOrder } = req.body;

    if (!type || !name)
      return sendError(res, 'type and name are required', 400);
    if (!HdOption.VALID_TYPES.includes(type))
      return sendError(res, `type must be one of: ${HdOption.VALID_TYPES.join(', ')}`, 400);

    // Check for duplicate (case-insensitive)
    const existing = await HdOption.findOne({
      where: {
        type,
        name: { [Op.like]: name.trim() },
      },
    });
    if (existing) return sendError(res, `"${name}" already exists under ${type}`, 409);

    const option = await HdOption.create({
      type,
      name:        name.trim(),
      description: description?.trim() || null,
      sortOrder:   sortOrder ?? 0,
    });

    return sendSuccess(res, option, 'Option created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/options/:id
 * Remove an option by id.
 * @type {import('express').RequestHandler}
 */
const deleteOption = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Admin access required to manage options'));

    const option = await HdOption.findByPk(req.params.id);
    if (!option) return next(new NotFoundError('Option'));

    if (option.isBuiltIn) {
      return sendError(res,
        `Cannot delete "${option.name}" — it's a built-in status used by ticket workflow logic ` +
        `(SLA tracking, auto-close timestamps, the approval flow). Add a new status instead if you need something different.`,
        409);
    }

    await option.destroy();
    return sendSuccess(res, null, 'Option deleted');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/options/all
 * Returns options for every type at once — used by ticket forms to load all
 * dropdowns in a single request.
 * @type {import('express').RequestHandler}
 */
const listAllOptions = async (req, res, next) => {
  try {
    const rows = await HdOption.findAll({
      order: [['type', 'ASC'], ['sort_order', 'ASC'], ['name', 'ASC']],
    });

    // Group by type: { category: [...], mode: [...], ... }
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.type]) grouped[r.type] = [];
      grouped[r.type].push(r);
    }

    return sendSuccess(res, grouped, 'All options fetched');
  } catch (err) {
    next(err);
  }
};

module.exports = { listOptions, createOption, deleteOption, listAllOptions };
