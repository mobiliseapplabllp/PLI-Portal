'use strict';

/**
 * @module controllers/helpdesk/reminder
 * CRUD for per-ticket reminders (hd_reminders).
 */

const HdReminder = require('../../models/helpdesk/HdReminder');
const HdTicket   = require('../../models/helpdesk/HdTicket');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

/**
 * GET /helpdesk/tickets/:id/reminders
 * List all reminders for a ticket visible to the current user.
 */
const listReminders = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket   = await HdTicket.findByPk(ticketId, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const hdUser = req.hdUser;
    const where  = { ticketId };
    // Non-admins only see their own reminders
    if (!hdUser.isAdmin && !hdUser.permissions?.canManage) {
      where.userId = hdUser.id;
    }

    const reminders = await HdReminder.findAll({
      where,
      order: [['remind_at', 'ASC']],
    });

    return sendSuccess(res, reminders, 'Reminders fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/:id/reminders
 * Create a reminder for a ticket.
 * Body: { remindAt: ISO string, message?: string }
 */
const createReminder = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.id);
    const ticket   = await HdTicket.findByPk(ticketId, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const { remindAt, message } = req.body;

    if (!remindAt) return sendError(res, 'remindAt is required', 400);
    const remindDate = new Date(remindAt);
    if (isNaN(remindDate.getTime())) return sendError(res, 'remindAt must be a valid date', 400);
    if (remindDate <= new Date()) return sendError(res, 'remindAt must be in the future', 400);

    const reminder = await HdReminder.create({
      ticketId,
      userId:   req.hdUser.id,
      remindAt: remindDate,
      message:  message?.trim() || null,
    });

    return sendSuccess(res, reminder, 'Reminder created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/tickets/:ticketId/reminders/:id
 * Delete a reminder (owner or admin only).
 */
const deleteReminder = async (req, res, next) => {
  try {
    const reminder = await HdReminder.findByPk(req.params.reminderId);
    if (!reminder) return next(new NotFoundError('Reminder'));

    const hdUser = req.hdUser;
    if (reminder.userId !== hdUser.id && !hdUser.isAdmin) {
      return next(new ForbiddenError('Only the reminder owner or admin can delete it'));
    }

    await reminder.destroy();
    return sendSuccess(res, null, 'Reminder deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { listReminders, createReminder, deleteReminder };
