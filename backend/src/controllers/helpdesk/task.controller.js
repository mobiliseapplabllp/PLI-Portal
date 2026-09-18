'use strict';

/**
 * @module controllers/helpdesk/task
 * CRUD for sub-tasks attached to a helpdesk ticket.
 */

const { Op } = require('sequelize');
const { HdTask, HdTicket } = require('../../models/helpdesk');
const { ticketVisibilityWhere } = require('./ticket.controller');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const { TASK_STATUS } = HdTask;

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/tickets/:id/tasks
 * List all sub-tasks for a ticket.
 * @type {import('express').RequestHandler}
 */
const listTasks = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket   = await HdTicket.findByPk(ticketId, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const tasks = await HdTask.findAll({
      where: { ticketId },
      order: [['created_at', 'ASC']],
    });

    return sendSuccess(res, tasks, 'Tasks fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/:id/tasks
 * Create a sub-task on a ticket.
 * Body: { title, assignedTo?, dueDate?, status? }
 * @type {import('express').RequestHandler}
 */
const createTask = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket   = await HdTicket.findByPk(ticketId, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const { title, assignedTo, dueDate, status } = req.body;
    if (!title || !title.trim()) return sendError(res, 'title is required', 400);

    if (status && !Object.values(TASK_STATUS).includes(status))
      return sendError(res, `status must be one of: ${Object.values(TASK_STATUS).join(', ')}`, 400);

    const task = await HdTask.create({
      ticketId,
      title:      title.trim(),
      assignedTo: assignedTo || null,
      dueDate:    dueDate    || null,
      status:     status     || TASK_STATUS.OPEN,
    });

    return sendSuccess(res, task, 'Task created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/tasks/:id
 * Update a sub-task.
 * @type {import('express').RequestHandler}
 */
const updateTask = async (req, res, next) => {
  try {
    const task = await HdTask.findByPk(req.params.id);
    if (!task) return next(new NotFoundError('Task'));

    // Authorization: admins, or anyone the ticket is visible to under the
    // team rule (B4 — same helper as listTickets), or the ticket's owner.
    const hdUser = req.hdUser;
    if (!hdUser.isAdmin) {
      const ticket = await HdTicket.findByPk(task.ticketId, { attributes: ['id', 'assigneeId', 'requesterId'] });
      if (!ticket) return next(new NotFoundError('Ticket'));
      const isOwner = ticket.assigneeId === hdUser.id || ticket.requesterId === hdUser.id;
      let inTeam = false;
      if (!isOwner) {
        const vis = await ticketVisibilityWhere(hdUser);
        inTeam = vis === null
          || (await HdTicket.count({ where: { [Op.and]: [{ id: ticket.id }, vis] } })) > 0;
      }
      if (!inTeam && !isOwner) {
        return next(new ForbiddenError('You do not have permission to update tasks on this ticket'));
      }
    }

    const { title, assignedTo, dueDate, status } = req.body;

    if (title      !== undefined) task.title      = title.trim();
    if (assignedTo !== undefined) task.assignedTo = assignedTo;
    if (dueDate    !== undefined) task.dueDate    = dueDate;
    if (status     !== undefined) {
      if (!Object.values(TASK_STATUS).includes(status))
        return sendError(res, `status must be one of: ${Object.values(TASK_STATUS).join(', ')}`, 400);
      task.status = status;
    }

    await task.save();
    return sendSuccess(res, task, 'Task updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/tasks/:id
 * Delete a sub-task. Admin or canManageTickets required.
 * @type {import('express').RequestHandler}
 */
const deleteTask = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageTickets)
      return next(new ForbiddenError('Insufficient permissions'));

    const task = await HdTask.findByPk(req.params.id);
    if (!task) return next(new NotFoundError('Task'));

    await task.destroy();
    return sendSuccess(res, null, 'Task deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { listTasks, createTask, updateTask, deleteTask };
