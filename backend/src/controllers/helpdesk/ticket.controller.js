'use strict';

/**
 * @module controllers/helpdesk/ticket
 * Full CRUD for helpdesk tickets including history, linking, and bulk operations.
 */

const path             = require('path');
const fs               = require('fs');
const crypto           = require('crypto');
const { Op }           = require('sequelize');
const sequelize        = require('../../config/database');
const UPLOAD_DIR       = process.env.UPLOAD_DIR || 'uploads';
const {
  HdTicket,
  HdTicketHistory,
  HdTicketAssignee,
  HdTicketApproval,
  HdTask,
  HdAttachment,
  HdConversation,
  HdGroup,
  HdProject,
  User,
}                      = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../utils/errors');
const { sendEmail }    = require('../../utils/emailService');

const { TICKET_STATUS, TICKET_PRIORITY, LINK_TYPE } = HdTicket;

const DEFAULT_PAGE      = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;

const TRACKED_FIELDS = [
  'title', 'description', 'status', 'priority', 'category',
  'requestType', 'mode', 'impact', 'urgency', 'resolution', 'site', 'raisedByTeam',
  'assigneeId', 'groupId', 'projectId', 'dueDate',
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Log a single field change to HdTicketHistory.
 * @param {number} ticketId
 * @param {string} field
 * @param {*} oldValue
 * @param {*} newValue
 * @param {string|null} changedBy - PLI user UUID
 * @param {import('sequelize').Transaction|null} [t]
 */
async function logHistory(ticketId, field, oldValue, newValue, changedBy, t) {
  await HdTicketHistory.create(
    {
      ticketId,
      field,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      changedBy: changedBy || null,
    },
    { transaction: t },
  );
}

/**
 * Generate the next REQ-XXXX number inside a transaction with a SELECT FOR UPDATE.
 * @param {import('sequelize').Transaction} t
 * @returns {Promise<string>}
 */
async function generateReqNumber(t) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await HdTicket.findOne({
      attributes: ['reqNumber'],
      order: [
        [
          sequelize.literal('CAST(SUBSTRING(req_number, 5) AS UNSIGNED)'),
          'DESC',
        ],
      ],
      lock: t ? t.LOCK.UPDATE : undefined,
      transaction: t || undefined,
    });

    let next = 1;
    if (last?.reqNumber) {
      const num = parseInt(last.reqNumber.replace(/^REQ-/, ''), 10);
      if (!isNaN(num)) next = num + 1;
    }

    const candidate = `REQ-${String(next).padStart(4, '0')}`;
    // Check if this number is already taken (race condition guard)
    const exists = await HdTicket.findOne({
      where: { reqNumber: candidate },
      transaction: t || undefined,
    });
    if (!exists) return candidate;
    // Another concurrent request grabbed this number — retry with next
  }
  // Absolute fallback: use timestamp-based number
  return `REQ-${Date.now().toString().slice(-6)}`;
}

/** Standard paginated query scope builder. */
function paginationParams(query) {
  let page     = Math.max(1, parseInt(query.page, 10) || DEFAULT_PAGE);
  let pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

// â”€â”€â”€ Controllers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GET /helpdesk/tickets
 * Paginated list with filters; respects req.hdUser.scope.
 * @type {import('express').RequestHandler}
 */
const listTickets = async (req, res, next) => {
  try {
    const { page, pageSize, offset, limit } = paginationParams(req.query);
    const { status, priority, category, groupId, projectId, assigneeId, search, dateFrom, dateTo } = req.query;
    const hdUser = req.hdUser;

    const where = {};

    // Scope
    if (hdUser.scope === 'group' && hdUser.groupId) {
      where.groupId = hdUser.groupId;
    } else if (hdUser.scope === 'own') {
      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: [{ requesterId: hdUser.id }, { assigneeId: hdUser.id }] },
      ];
    }

    if (status)    where.status   = status;
    if (priority)  where.priority = priority;
    if (category)  where.category = { [Op.like]: `%${category}%` };
    // groupId filter: only admins / all-scope users may override the scope restriction
    if (groupId && (hdUser.isAdmin || hdUser.scope === 'all')) {
      where.groupId = Number(groupId);
    }
    if (projectId)  where.projectId  = Number(projectId);
    if (assigneeId) where.assigneeId = assigneeId === 'unassigned' ? null : assigneeId;

    if (search) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: [
          { title:     { [Op.like]: `%${search}%` } },
          { reqNumber: { [Op.like]: `%${search}%` } },
        ]},
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo)   where.createdAt[Op.lte] = new Date(dateTo);
    }

    const { rows: tickets, count: total } = await HdTicket.findAndCountAll({
      where,
      include: [
        { model: HdGroup,   as: 'group',         attributes: ['id', 'name'] },
        { model: HdProject, as: 'project',        attributes: ['id', 'name'], required: false },
        { model: User,      as: 'assigneeUser',   attributes: ['id', 'name'], required: false, constraints: false },
        { model: User,      as: 'requesterUser',  attributes: ['id', 'name'], required: false, constraints: false },
      ],
      order:  [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    return sendSuccess(res, { tickets, total, page, pageSize }, 'Tickets fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/:id
 * Single ticket with all associations.
 * @type {import('express').RequestHandler}
 */
const getTicket = async (req, res, next) => {
  try {
    const hdUser = req.hdUser;
    const ticket = await HdTicket.findByPk(req.params.id, {
      include: [
        {
          model:    HdConversation,
          as:       'conversations',
          required: false,
          where:    (!hdUser.isAdmin)
            ? { [Op.or]: [{ isInternal: false }, { userId: hdUser.id }] }
            : undefined,
          include: [{ model: HdAttachment, as: 'files', required: false }],
        },
        { model: HdTicketHistory,  as: 'history',   required: false, order: [['changed_at', 'DESC']] },
        { model: HdTicketAssignee, as: 'assignees',  required: false },
        { model: HdTicketApproval, as: 'approvals',  required: false },
        { model: HdTask,           as: 'tasks',      required: false },
        { model: HdAttachment,     as: 'attachments', required: false },
        { model: HdGroup,   as: 'group',         attributes: ['id', 'name'] },
        { model: HdProject, as: 'project',       attributes: ['id', 'name'] },
        { model: User,      as: 'assigneeUser',  attributes: ['id', 'name', 'email'], required: false, constraints: false },
        { model: User,      as: 'requesterUser', attributes: ['id', 'name', 'email'], required: false, constraints: false },
      ],
    });

    if (!ticket) return next(new NotFoundError('Ticket'));

    // â”€â”€ Enrich history: resolve changedBy UUID and field values to names â”€â”€â”€â”€â”€
    const ticketPlain = ticket.get({ plain: true });

    if (ticketPlain.history && ticketPlain.history.length > 0) {
      // Sort newest-first (include-level order is ignored by Sequelize for hasMany)
      ticketPlain.history.sort((a, b) =>
        new Date(b.changedAt || b.changed_at) - new Date(a.changedAt || a.changed_at)
      );

      // Collect unique IDs that need name resolution
      const userIds  = new Set();
      const groupIds = new Set();
      for (const h of ticketPlain.history) {
        if (h.changedBy && h.changedBy.includes('-')) userIds.add(h.changedBy);
        if (h.field === 'assigneeId') {
          if (h.oldValue && h.oldValue.includes('-')) userIds.add(h.oldValue);
          if (h.newValue && h.newValue.includes('-')) userIds.add(h.newValue);
        }
        if (h.field === 'groupId') {
          if (h.oldValue && /^\d+$/.test(h.oldValue)) groupIds.add(h.oldValue);
          if (h.newValue && /^\d+$/.test(h.newValue)) groupIds.add(h.newValue);
        }
      }

      // Batch-fetch names
      const [histUsers, histGroups] = await Promise.all([
        userIds.size  ? User.findAll({ where: { id: [...userIds] }, attributes: ['id', 'name'], raw: true }) : [],
        groupIds.size ? HdGroup.findAll({ where: { id: [...groupIds] }, attributes: ['id', 'name'], raw: true }) : [],
      ]);
      const userMap  = Object.fromEntries(histUsers.map(u => [u.id, u.name]));
      const groupMap = Object.fromEntries(histGroups.map(g => [String(g.id), g.name]));

      // Annotate each row
      for (const h of ticketPlain.history) {
        h.changedByName = (h.changedBy && userMap[h.changedBy]) || null;

        if (h.field === 'assigneeId') {
          h.oldDisplay = (h.oldValue && h.oldValue.includes('-'))
            ? (userMap[h.oldValue] || null) : null;
          h.newDisplay = (h.newValue && h.newValue.includes('-'))
            ? (userMap[h.newValue] || null) : null;
        } else if (h.field === 'groupId') {
          h.oldDisplay = h.oldValue ? (groupMap[h.oldValue] || null) : null;
          h.newDisplay = h.newValue ? (groupMap[h.newValue] || null) : null;
        }
      }
    }

    return sendSuccess(res, ticketPlain, 'Ticket fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets
 * Create a new ticket; auto-generates reqNumber.
 * @type {import('express').RequestHandler}
 */
const createTicket = async (req, res, next) => {
  try {
    const {
      title, category, description, priority, status,
      groupId, projectId, dueDate, assigneeId,
      requestType, mode, impact, urgency, site, raisedByTeam,
      // "On behalf of" fields â€” admins/managers creating tickets for others
      requesterName, requesterEmail,
    } = req.body;

    if (!title) return sendError(res, 'title is required', 400);

    const t = await sequelize.transaction();
    try {
      const reqNumber = await generateReqNumber(t);

      const ticket = await HdTicket.create(
        {
          title,
          category:     category     || null,
          description:  description  || null,
          priority:     priority     || TICKET_PRIORITY.MEDIUM,
          status:       status       || TICKET_STATUS.OPEN,
          groupId:      groupId      || null,
          projectId:    projectId    || null,
          dueDate:      dueDate      || null,
          assigneeId:   assigneeId   || null,
          requestType:  requestType  || null,
          mode:         mode         || null,
          impact:       impact       || null,
          urgency:      urgency      || null,
          site:         site         || null,
          raisedByTeam: raisedByTeam || null,
          // If creating on behalf of someone, store their name/email in the widget fields
          widgetName:   requesterName  || null,
          widgetEmail:  requesterEmail || null,
          requesterId:  req.hdUser.id,
          reqNumber,
        },
        { transaction: t },
      );

      await logHistory(ticket.id, 'status', null, ticket.status, req.hdUser.id, t);

      // Save optional attachment uploaded with ticket creation
      if (req.file) {
        const ext        = path.extname(req.file.originalname);
        const storedName = `${crypto.randomUUID()}${ext}`;
        const destPath   = path.join(UPLOAD_DIR, storedName);
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(destPath, req.file.buffer);
        await HdAttachment.create(
          {
            ticketId:   ticket.id,
            uploadedBy: req.hdUser.id,
            filename:   req.file.originalname,
            storedName,
            mimeType:   req.file.mimetype,
            sizeBytes:  req.file.size,
          },
          { transaction: t },
        );
      }

      await t.commit();

      // Non-blocking email notification — send to requester if provided, else creator
      const notifyEmail = requesterEmail || req.hdUser.email;
      if (notifyEmail) {
        sendEmail(
          notifyEmail,
          `Ticket Created: ${reqNumber}`,
          `<p>Your ticket <strong>${reqNumber}</strong> — <em>${title}</em> has been created.</p>`,
        ).catch(() => {});
      }

      return sendSuccess(res, ticket, 'Ticket created', 201);
    } catch (err) {
      await t.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/tickets/:id
 * Update allowed ticket fields; auto-logs every changed field.
 * @type {import('express').RequestHandler}
 */
const updateTicket = async (req, res, next) => {
  try {
    const ticket = await HdTicket.findByPk(req.params.id);
    if (!ticket) return next(new NotFoundError('Ticket'));

    const snapshot = {};
    TRACKED_FIELDS.forEach((f) => { snapshot[f] = ticket[f]; });

    const prevStatus = ticket.status;
    const updates    = {};
    TRACKED_FIELDS.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) updates[f] = req.body[f];
    });

    // ── Approval gate: block status change while any approval is pending ─────
    if (updates.status && updates.status !== prevStatus) {
      const pendingApproval = await HdTicketApproval.findOne({
        where:      { ticketId: ticket.id, status: 'pending' },
        attributes: ['id'],
      });
      if (pendingApproval) {
        return sendError(
          res,
          'This ticket is awaiting approval — its status is locked until the approver accepts or rejects.',
          409,
        );
      }
    }

    Object.assign(ticket, updates);

    // Reopen logic
    const newStatus = ticket.status;
    if (
      [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED].includes(prevStatus) &&
      newStatus === TICKET_STATUS.OPEN
    ) {
      ticket.reopenCount += 1;
      ticket.closedAt    = null;
    }

    await sequelize.transaction(async (t) => {
      await ticket.save({ transaction: t });

      // Log diffs
      for (const f of TRACKED_FIELDS) {
        if (String(snapshot[f] ?? '') !== String(ticket[f] ?? '')) {
          await logHistory(ticket.id, f, snapshot[f], ticket[f], req.hdUser.id, t);
        }
      }
    }); // end transaction

    return sendSuccess(res, ticket, 'Ticket updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/tickets/:id
 * Hard delete â€” admin only.
 * @type {import('express').RequestHandler}
 */
const deleteTicket = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin) return next(new ForbiddenError('Admin access required'));

    const ticket = await HdTicket.findByPk(req.params.id);
    if (!ticket) return next(new NotFoundError('Ticket'));

    await ticket.destroy();
    return sendSuccess(res, null, 'Ticket deleted');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/bulk-assign
 * Assign multiple tickets to one agent.
 * Body: { ticketIds: number[], assigneeId: string }
 * @type {import('express').RequestHandler}
 */
const bulkAssign = async (req, res, next) => {
  try {
    // ── Permission guard ─────────────────────────────────────────────────────
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canAssign) {
      return sendError(res, 'You do not have permission to assign tickets', 403);
    }
    const { ticketIds, assigneeId } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0)
      return sendError(res, 'ticketIds must be a non-empty array', 400);
    if (!assigneeId)
      return sendError(res, 'assigneeId is required', 400);

    const tickets = await HdTicket.findAll({ where: { id: { [Op.in]: ticketIds } } });

    for (const ticket of tickets) {
      const old = ticket.assigneeId;
      ticket.assigneeId = assigneeId;
      await ticket.save();
      await logHistory(ticket.id, 'assigneeId', old, assigneeId, req.hdUser.id);
    }

    return sendSuccess(res, { updated: tickets.length }, 'Tickets assigned');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/:id/history
 * Audit trail for a ticket, newest first.
 * @type {import('express').RequestHandler}
 */
const getHistory = async (req, res, next) => {
  try {
    const ticket = await HdTicket.findByPk(req.params.id, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const rows = await HdTicketHistory.findAll({
      where: { ticketId: req.params.id },
      order: [['changed_at', 'DESC']],
    });

    // Convert to plain objects (camelCase keys via underscored:true model)
    const history = rows.map(h => h.get({ plain: true }));

    // ── Enrich: resolve UUIDs / IDs to display names ───────────────────────
    if (history.length > 0) {
      const userIds  = new Set();
      const groupIds = new Set();

      for (const h of history) {
        if (h.changedBy && h.changedBy.includes('-')) userIds.add(h.changedBy);
        if (h.field === 'assigneeId') {
          if (h.oldValue && h.oldValue.includes('-')) userIds.add(h.oldValue);
          if (h.newValue && h.newValue.includes('-')) userIds.add(h.newValue);
        }
        if (h.field === 'groupId') {
          if (h.oldValue && /^\d+$/.test(h.oldValue)) groupIds.add(h.oldValue);
          if (h.newValue && /^\d+$/.test(h.newValue)) groupIds.add(h.newValue);
        }
      }

      const [histUsers, histGroups] = await Promise.all([
        userIds.size  ? User.findAll({ where: { id: [...userIds] }, attributes: ['id', 'name'], raw: true }) : [],
        groupIds.size ? HdGroup.findAll({ where: { id: [...groupIds] }, attributes: ['id', 'name'], raw: true }) : [],
      ]);
      const userMap  = Object.fromEntries(histUsers.map(u => [u.id, u.name]));
      const groupMap = Object.fromEntries(histGroups.map(g => [String(g.id), g.name]));

      for (const h of history) {
        h.changedByName = (h.changedBy && userMap[h.changedBy]) || null;
        if (h.field === 'assigneeId') {
          h.oldDisplay = (h.oldValue && h.oldValue.includes('-')) ? (userMap[h.oldValue] || null) : null;
          h.newDisplay = (h.newValue && h.newValue.includes('-')) ? (userMap[h.newValue] || null) : null;
        } else if (h.field === 'groupId') {
          h.oldDisplay = h.oldValue ? (groupMap[h.oldValue] || null) : null;
          h.newDisplay = h.newValue ? (groupMap[h.newValue] || null) : null;
        }
      }
    }

    return sendSuccess(res, history, 'History fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/:id/link
 * Link this ticket to another.
 * Body: { linkedTicketId: number, linkType: string }
 * @type {import('express').RequestHandler}
 */
const linkTicket = async (req, res, next) => {
  try {
    const { linkedTicketId, linkType } = req.body;

    if (!linkedTicketId) return sendError(res, 'linkedTicketId is required', 400);
    if (!Object.values(LINK_TYPE).includes(linkType))
      return sendError(res, `linkType must be one of: ${Object.values(LINK_TYPE).join(', ')}`, 400);

    const ticket = await HdTicket.findByPk(req.params.id);
    if (!ticket) return next(new NotFoundError('Ticket'));

    const target = await HdTicket.findByPk(linkedTicketId, { attributes: ['id'] });
    if (!target) return sendError(res, 'Linked ticket not found', 404);

    const old = { linkedTicketId: ticket.linkedTicketId, linkType: ticket.linkType };
    ticket.linkedTicketId = linkedTicketId;
    ticket.linkType       = linkType;
    await ticket.save();

    await logHistory(ticket.id, 'linkedTicketId', old.linkedTicketId, linkedTicketId, req.hdUser.id);
    await logHistory(ticket.id, 'linkType',       old.linkType,       linkType,       req.hdUser.id);

    return sendSuccess(res, ticket, 'Ticket linked');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  bulkAssign,
  getHistory,
  linkTicket,
};
