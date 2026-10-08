'use strict';

/**
 * @module controllers/helpdesk/widget
 * Public (no-auth) embeddable widget endpoints.
 * Widget users are identified by email + publicToken only — no JWT.
 */

const sequelize      = require('../../config/database');
const { HdProject, HdTicket, HdTicketHistory } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError }          = require('../../utils/errors');
const { sendEmail }              = require('../../utils/emailService');
const statusResolver             = require('../../services/helpdesk/statusResolver.service');

const { TICKET_PRIORITY } = HdTicket;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate the next REQ-XXXX number inside a transaction.
 * @param {import('sequelize').Transaction} t
 * @returns {Promise<string>}
 */
async function generateReqNumber(t) {
  const last = await HdTicket.findOne({
    attributes: ['reqNumber'],
    order:       [['reqNumber', 'DESC']],
    lock:        t.LOCK.UPDATE,
    transaction: t,
  });

  let next = 1;
  if (last && last.reqNumber) {
    const num = parseInt(last.reqNumber.replace('REQ-', ''), 10);
    if (!Number.isNaN(num)) next = num + 1;
  }
  return `REQ-${String(next).padStart(4, '0')}`;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/widget/config?token=PUBLIC_TOKEN
 * Return minimal project config for embedding the widget.
 * @type {import('express').RequestHandler}
 */
const getWidgetConfig = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return sendError(res, 'token is required', 400);

    const project = await HdProject.findOne({
      where:      { publicToken: token },
      attributes: ['id', 'name', 'pmProjectId'],
      include:    [{ association: 'pmProject', attributes: ['id', 'name'], required: false }],
    });

    if (!project) return sendError(res, 'Invalid widget token', 404);

    // Name comes from the common PM project when the token row is linked to one.
    return sendSuccess(res, { id: project.id, name: project.pmProject?.name || project.name }, 'Widget config');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/widget/tickets
 * Submit a ticket via the public widget.
 * Body: { token, name, email, title, description, category }
 * @type {import('express').RequestHandler}
 */
const submitWidgetTicket = async (req, res, next) => {
  try {
    const { token, name, email, title, description, category } = req.body;

    if (!token)    return sendError(res, 'token is required', 400);
    if (!name)     return sendError(res, 'name is required', 400);
    if (!email)    return sendError(res, 'email is required', 400);
    if (!title)    return sendError(res, 'title is required', 400);
    if (!category) return sendError(res, 'category is required', 400);

    const project = await HdProject.findOne({ where: { publicToken: token } });
    if (!project) {
      return sendError(res, 'Invalid or expired widget token', 401);
    }
    if (!project.publicToken || project.publicToken !== token) {
      return sendError(res, 'Widget token mismatch', 401);
    }
    if (project.status && project.status !== 'Active') {
      return sendError(res, 'This project is not accepting submissions', 403);
    }

    const openStatus = await statusResolver.getBuiltInStatus('open');
    const t = await sequelize.transaction();
    try {
      const reqNumber = await generateReqNumber(t);

      const ticket = await HdTicket.create(
        {
          title:        title.trim(),
          description:  description || null,
          category:     category.trim(),
          priority:     TICKET_PRIORITY.MEDIUM,
          status:       openStatus.name,
          statusId:     openStatus.id,
          projectId:    project.id,                       // token row (widget lookups key on it)
          pmProjectId:  project.pmProjectId || null,      // the common PM project, for lists/reports
          widgetSource: true,
          widgetName:   name.trim(),
          widgetEmail:  email.trim().toLowerCase(),
          reqNumber,
        },
        { transaction: t },
      );

      await HdTicketHistory.create(
        {
          ticketId:  ticket.id,
          field:     'status',
          oldValue:  null,
          newValue:  openStatus.name,
          changedBy: null,
        },
        { transaction: t },
      );

      await t.commit();

      // Confirmation email to submitter
      sendEmail(
        email,
        `Ticket Received: ${reqNumber}`,
        `<p>Hi ${name},</p>
         <p>Your support ticket <strong>${reqNumber}</strong> has been received.</p>
         <p><strong>Title:</strong> ${title}</p>
         <p>We'll get back to you as soon as possible.</p>`,
      ).catch(() => {});

      return sendSuccess(res, { id: ticket.id, reqNumber }, 'Ticket submitted', 201);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/widget/tickets?token=X&email=Y
 * List tickets for a widget submitter by email.
 * @type {import('express').RequestHandler}
 */
const getWidgetTicketsByEmail = async (req, res, next) => {
  try {
    const { token, email } = req.query;
    if (!token) return sendError(res, 'token is required', 400);
    if (!email) return sendError(res, 'email is required', 400);

    const project = await HdProject.findOne({ where: { publicToken: token } });
    if (!project) return sendError(res, 'Invalid widget token', 404);

    const tickets = await HdTicket.findAll({
      where: {
        projectId:   project.id,
        widgetEmail: email.trim().toLowerCase(),
        widgetSource: true,
      },
      attributes: ['id', 'reqNumber', 'title', 'status', 'priority', 'createdAt', 'updatedAt'],
      order:      [['created_at', 'DESC']],
    });

    return sendSuccess(res, tickets, 'Widget tickets fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/widget/tickets/:id?token=X&email=Y
 * Get a single widget ticket (only if widgetEmail matches or widgetSource=true).
 * @type {import('express').RequestHandler}
 */
const getWidgetTicketById = async (req, res, next) => {
  try {
    const { token, email } = req.query;
    if (!token) return sendError(res, 'token is required', 400);
    if (!email) return sendError(res, 'email is required', 400);

    const project = await HdProject.findOne({ where: { publicToken: token } });
    if (!project) return sendError(res, 'Invalid widget token', 404);

    const ticket = await HdTicket.findOne({
      where: {
        id:           req.params.id,
        projectId:    project.id,
        widgetSource: true,
        widgetEmail:  email.trim().toLowerCase(),
      },
    });

    if (!ticket) return sendError(res, 'Ticket not found or access denied', 404);

    return sendSuccess(res, ticket, 'Widget ticket fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/widget/tickets/:id/reopen
 * Reopen a widget ticket. Body: { token, email }
 * @type {import('express').RequestHandler}
 */
const reopenWidgetTicket = async (req, res, next) => {
  try {
    const { token, email } = req.body;
    if (!token) return sendError(res, 'token is required', 400);
    if (!email) return sendError(res, 'email is required', 400);

    const project = await HdProject.findOne({ where: { publicToken: token } });
    if (!project) return sendError(res, 'Invalid widget token', 404);

    const ticket = await HdTicket.findOne({
      where: {
        id:           req.params.id,
        projectId:    project.id,
        widgetSource: true,
        widgetEmail:  email.trim().toLowerCase(),
      },
    });

    if (!ticket) return sendError(res, 'Ticket not found or access denied', 404);

    const priorStatus = ticket.status;
    const openStatus  = await statusResolver.getBuiltInStatus('open');
    ticket.status      = openStatus.name;
    ticket.statusId     = openStatus.id;
    ticket.reopenCount += 1;
    ticket.closedAt    = null;
    await ticket.save();

    await HdTicketHistory.create({
      ticketId:  ticket.id,
      field:     'status',
      oldValue:  priorStatus,
      newValue:  openStatus.name,
      changedBy: null,
    });

    // Notify project manager
    if (project.managerId) {
      sendEmail(
        project.managerId,
        `Widget Ticket Reopened: ${ticket.reqNumber}`,
        `<p>Ticket <strong>${ticket.reqNumber}</strong> — ${ticket.title} has been reopened by the submitter (${email}).</p>`,
      ).catch(() => {});
    }

    return sendSuccess(res, { id: ticket.id, status: ticket.status, reopenCount: ticket.reopenCount }, 'Ticket reopened');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getWidgetConfig,
  submitWidgetTicket,
  getWidgetTicketsByEmail,
  getWidgetTicketById,
  reopenWidgetTicket,
};
