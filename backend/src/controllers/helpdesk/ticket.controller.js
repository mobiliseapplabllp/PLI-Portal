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

// Lazy-load ExcelJS only when needed (avoids startup cost)
let ExcelJS;
function getExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

const DEFAULT_PAGE      = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;

const TRACKED_FIELDS = [
  'title', 'description', 'status', 'priority', 'category',
  'requestType', 'mode', 'impact', 'urgency', 'resolution', 'site', 'raisedByTeam',
  'assigneeId', 'groupId', 'projectId', 'dueDate', 'billable',
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
  // Absolute fallback: cryptographically random suffix — avoids timestamp
  // collisions when two callers exhaust retries at the same millisecond.
  return `REQ-F${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
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
        { model: HdTicket,  as: 'linkedTicket',  attributes: ['id', 'reqNumber', 'title', 'status', 'priority'], required: false },
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

    let destPath;
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
        const ALLOWED_EXTS = ['.pdf','.png','.jpg','.jpeg','.docx','.xlsx','.csv','.txt','.doc','.xls'];
        if (!ALLOWED_EXTS.includes(ext.toLowerCase())) {
          // FIX: rollback the open transaction before returning — otherwise the
          // connection is leaked and held open until the idle-timeout fires.
          await t.rollback();
          return res.status(400).json({ success: false, message: `File type ${ext} is not allowed. Allowed: ${ALLOWED_EXTS.join(', ')}` });
        }
        const storedName = `${crypto.randomUUID()}${ext}`;
        destPath   = path.join(UPLOAD_DIR, storedName);
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
      if (req.file && destPath && fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch(_) {}
      }
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

    // ── Authorization ─────────────────────────────────────────────────────────
    // Admins and canAssign agents can update any ticket.
    // Everyone else (e.g. a requester) may only update their own ticket.
    if (!req.hdUser?.isAdmin && !req.hdUser?.permissions?.canAssign) {
      if (String(ticket.requesterId) !== String(req.hdUser?.id)) {
        return res.status(403).json({ success: false, message: 'You do not have permission to update this ticket' });
      }
    }

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

    const attachments = await HdAttachment.findAll({ where: { ticketId: ticket.id } });
    await ticket.destroy();
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, att.storedName);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch(_) {}
      }
    }
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

    const t = await sequelize.transaction();
    try {
      for (const ticket of tickets) {
        const old = ticket.assigneeId;
        ticket.assigneeId = assigneeId;
        await ticket.save({ transaction: t });
        await logHistory(ticket.id, 'assigneeId', old, assigneeId, req.hdUser.id, t);
      }
      await t.commit();
    } catch(err) {
      await t.rollback();
      throw err;
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

    const t = await sequelize.transaction();
    try {
      await ticket.save({ transaction: t });
      await logHistory(ticket.id, 'linkedTicketId', old.linkedTicketId, linkedTicketId, req.hdUser.id, t);
      await logHistory(ticket.id, 'linkType',       old.linkType,       linkType,       req.hdUser.id, t);
      await t.commit();
    } catch(err) {
      await t.rollback();
      throw err;
    }

    return sendSuccess(res, ticket, 'Ticket linked');
  } catch (err) {
    next(err);
  }
};

// ── Bulk Upload ───────────────────────────────────────────────────────────────
/**
 * POST /api/helpdesk/tickets/bulk-upload
 * Body: { rows: [{ "Title *", "Category", "Priority", "Description", ... }] }
 * Accepts rows parsed from the xlsx template by the frontend.
 * Keys are header-normalized (e.g. "Title *" → "title") before processing.
 * Returns { created, skipped, errors } — per-row errors never abort the batch.
 */
const bulkUpload = async (req, res, next) => {
  try {
    // ── Permission guard — require admin or both canAssign AND create access ─
    // canAssign alone is insufficient; it grants ticket management, not creation.
    // Until a dedicated canBulkCreate flag exists, restrict to admins only to
    // prevent privilege escalation via the import endpoint.
    if (!req.hdUser?.isAdmin) {
      return sendError(res, 'Only admins can bulk upload tickets', 403);
    }

    const { rows } = req.body || {};

    // Fix 3 — Row limit guard
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: 'No rows provided' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 rows per import' });
    }

    // Fix 1 — Header normalization: "Title *" → "title", "Category" → "category", etc.
    const normalize = (row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        const clean = k.replace(/\*/g, '').trim().toLowerCase().replace(/\s+/g, '_');
        out[clean] = typeof v === 'string' ? v.trim() : v;
      }
      return out;
    };

    // Fix 5 — Enum sets used for validation
    const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
    const VALID_STATUSES   = ['open', 'in-progress', 'pending', 'resolved', 'closed'];

    const created = [];
    const errors  = [];

    // Fix 2 — No shared transaction; each row is an independent insert so one
    //          failure does not roll back previously committed tickets.
    for (let idx = 0; idx < rows.length; idx++) {
      // Fix 1 — Normalize raw header keys from the xlsx parser
      const r = normalize(rows[idx]);

      // Fix 4 — Title is required, min 3 characters
      if (!r.title || String(r.title).trim().length < 3) {
        errors.push({ row: idx + 1, field: 'title', msg: 'Title is required (min 3 characters)' });
        continue;
      }

      // Priority normalization and validation
      const priority = (r.priority || 'medium').toLowerCase();
      if (r.priority && !VALID_PRIORITIES.includes(priority)) {
        errors.push({ row: idx + 1, field: 'priority', msg: `Invalid priority "${r.priority}". Use: ${VALID_PRIORITIES.join(', ')}` });
        continue;
      }

      // Status (optional, defaults to 'open' — resolved/closed not allowed on import)
      const VALID_IMPORT_STATUSES = ['open', 'in-progress', 'pending'];
      const status = (r.status || 'open').toLowerCase().trim();
      if (r.status && !VALID_IMPORT_STATUSES.includes(status)) {
        errors.push({ row: idx + 1, field: 'status', msg: `Invalid status "${r.status}". Allowed: ${VALID_IMPORT_STATUSES.join(', ')}` });
        continue;
      }

      // Mode (optional — pass the raw template value through as-is; key is lowercased by normalize but value is untouched)
      const mode = r.mode ? String(r.mode).trim() : null;

      // Impact (optional, case-insensitive, stored as lowercase)
      const VALID_IMPACTS = ['low', 'medium', 'high'];
      const impact = r.impact ? String(r.impact).trim().toLowerCase() : null;
      if (impact && !VALID_IMPACTS.includes(impact)) {
        errors.push({ row: idx + 1, field: 'impact', msg: `Invalid impact "${r.impact}". Use: Low, Medium, High` });
        continue;
      }

      // Urgency (optional, same rules as impact)
      const urgency = r.urgency ? String(r.urgency).trim().toLowerCase() : null;
      if (urgency && !VALID_IMPACTS.includes(urgency)) {
        errors.push({ row: idx + 1, field: 'urgency', msg: `Invalid urgency "${r.urgency}". Use: Low, Medium, High` });
        continue;
      }

      // Site (optional, free text)
      const site = r.site ? String(r.site).trim() : null;

      // Raised by team (optional, free text)
      const raisedByTeam = r.raised_by_team ? String(r.raised_by_team).trim() : null;

      // Billable (optional ENUM: 'Billable' or 'Non-Billable', defaults to 'Non-Billable')
      const billableRaw  = r.billable ? String(r.billable).trim() : 'Non-Billable';
      const billableNorm = billableRaw.toLowerCase() === 'billable' ? 'Billable' : 'Non-Billable';

      // Requester name and email (for external/widget tickets)
      const widgetName  = r.requester_name  ? String(r.requester_name).trim()  : null;
      const widgetEmail = r.requester_email ? String(r.requester_email).trim() : null;

      // Group resolution (group_name column → groupId integer)
      let groupId = null;
      if (r.group_name) {
        const groupName = String(r.group_name).trim();
        const group = await HdGroup.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            groupName.toLowerCase()
          ),
          attributes: ['id'],
        });
        if (!group) {
          errors.push({ row: idx + 1, field: 'group_name', msg: `Group "${groupName}" not found` });
          continue;
        }
        groupId = group.id;
      }

      // Assignee resolution (assignee_email → userId UUID string)
      let assigneeId = null;
      if (r.assignee_email) {
        const email = String(r.assignee_email).trim().toLowerCase();
        const agent = await User.findOne({
          where: sequelize.where(
            sequelize.fn('LOWER', sequelize.col('email')),
            email
          ),
          attributes: ['id'],
        });
        if (!agent) {
          errors.push({ row: idx + 1, field: 'assignee_email', msg: `User with email "${email}" not found` });
          continue;
        }
        assigneeId = agent.id;
      }

      // requesterId guard: cannot create ticket without an authenticated user
      if (!req.hdUser?.id) {
        errors.push({ row: idx + 1, msg: 'Auth session missing — cannot assign requester' });
        continue;
      }

      // Wrap each row in its own short-lived transaction so generateReqNumber
      // can use SELECT FOR UPDATE, preventing concurrent-upload collisions.
      let rowTx;
      try {
        rowTx = await sequelize.transaction();
        const reqNumber = await generateReqNumber(rowTx);

        // request_type: validate against allowed values; store original casing
        const VALID_REQUEST_TYPES = ['incident', 'service request'];
        const rawRequestType      = (r.request_type || '').trim();
        const requestType         = VALID_REQUEST_TYPES.includes(rawRequestType.toLowerCase())
          ? rawRequestType
          : null;

        // due_date: accept ISO strings or date values coerced by the xlsx parser
        let dueDate = null;
        if (r.due_date) {
          const d = new Date(r.due_date);
          if (!isNaN(d.getTime())) dueDate = d;
        }

        const ticket = await HdTicket.create({
          reqNumber,
          title:       String(r.title).trim(),
          category:    (r.category    || '').trim() || null,
          description: (r.description || '').trim() || null,
          priority,
          requestType,
          dueDate,
          status,
          requesterId: req.hdUser.id,
          mode,
          impact,
          urgency,
          site,
          raisedByTeam,
          billable:    billableNorm,
          widgetName,
          widgetEmail,
          groupId,
          assigneeId,
        }, { transaction: rowTx });

        await rowTx.commit();
        rowTx = null; // committed — no rollback needed

        // Log creation event in history (non-fatal — outside committed tx)
        try {
          await logHistory(ticket.id, 'status', null, ticket.status, req.hdUser?.id);
        } catch (_) { /* non-fatal */ }

        created.push(ticket.id);
      } catch (rowErr) {
        // Roll back the per-row transaction if still open
        if (rowTx) { try { await rowTx.rollback(); } catch (_) {} }
        // Sanitize: never expose raw SQL fragments from rowErr.message
        const safeMsg = rowErr.name === 'SequelizeValidationError'
          ? rowErr.errors.map(e => e.message).join('; ')
          : 'Database error creating ticket';
        errors.push({ row: idx + 1, msg: safeMsg });
      }
    }

    // Fix 9 — Consistent response format; partial success is still HTTP 200
    return res.status(200).json({
      success: true,
      message: `${created.length} ticket(s) created, ${errors.length} row(s) skipped`,
      data: { created: created.length, skipped: errors.length, errors },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/template/import
 * Download an Excel import template with dropdown validation for all manual ticket fields.
 * Columns A-F are existing; G-Q are new (status, mode, impact, urgency, site,
 * raised_by_team, group_name, assignee_email, requester_name, requester_email, billable).
 * @type {import('express').RequestHandler}
 */
const getImportTemplate = async (req, res, next) => {
  try {
    const XL = getExcelJS();
    const wb = new XL.Workbook();

    // ── Main data sheet ────────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Import Template');

    // Column headers use plain lowercase snake_case so that the parsed row keys
    // match exactly what the bulk-upload controller reads after normalisation.
    ws.columns = [
      { header: 'title',           key: 'title',           width: 40 },
      { header: 'description',     key: 'description',     width: 50 },
      { header: 'category',        key: 'category',        width: 20 },
      { header: 'priority',        key: 'priority',        width: 15 },
      { header: 'request_type',    key: 'request_type',    width: 18 },
      { header: 'due_date',        key: 'due_date',        width: 16 },
      { header: 'status',          key: 'status',          width: 15 },
      { header: 'mode',            key: 'mode',            width: 18 },
      { header: 'impact',          key: 'impact',          width: 15 },
      { header: 'urgency',         key: 'urgency',         width: 15 },
      { header: 'site',            key: 'site',            width: 20 },
      { header: 'raised_by_team',  key: 'raised_by_team',  width: 20 },
      { header: 'group_name',      key: 'group_name',      width: 28 },
      { header: 'assignee_email',  key: 'assignee_email',  width: 28 },
      { header: 'requester_name',  key: 'requester_name',  width: 25 },
      { header: 'requester_email', key: 'requester_email', width: 28 },
      { header: 'billable',        key: 'billable',        width: 18 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    headerRow.height = 20;

    // ── Fetch all option types from DB with fallbacks ──────────────────────────
    let categories  = ['Technical', 'HR', 'Finance', 'Operations', 'General'];
    let modeOpts    = ['Web Form', 'E-Mail', 'Phone Call'];
    let impactOpts  = ['Low', 'Medium', 'High'];
    let urgencyOpts = ['Low', 'Medium', 'High'];
    let siteOpts    = [];
    let teamOpts    = [];
    let groupNames  = [];   // from HdGroup table
    let agentEmails = [];   // active users — for assignee_email & requester_email lookups

    try {
      const HdOption = require('../../models/helpdesk/HdOption');
      // HdGroup and User already imported at top of file
      const [catRows, modeRows, impactRows, urgencyRows, siteRows, teamRows, groupRows, userRows] = await Promise.all([
        HdOption.findAll({ where: { type: 'category' }, order: [['sort_order', 'ASC'], ['name', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'mode' },     order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'impact' },   order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'urgency' },  order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'site' },     order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'team' },     order: [['sort_order', 'ASC']], raw: true }),
        HdGroup.findAll({ attributes: ['name'], order: [['name', 'ASC']], raw: true }),
        User.findAll({ where: { isActive: true }, attributes: ['name', 'email'], order: [['name', 'ASC']], raw: true }),
      ]);
      if (catRows.length)     categories  = catRows.map((o) => o.name);
      if (modeRows.length)    modeOpts    = modeRows.map((o) => o.name);
      if (impactRows.length)  impactOpts  = impactRows.map((o) => o.name);
      if (urgencyRows.length) urgencyOpts = urgencyRows.map((o) => o.name);
      if (siteRows.length)    siteOpts    = siteRows.map((o) => o.name);
      if (teamRows.length)    teamOpts    = teamRows.map((o) => o.name);
      groupNames  = groupRows.map((g) => g.name);
      agentEmails = userRows.map((u) => u.email).filter(Boolean);
    } catch (optErr) {
      console.warn('[HD Template] Failed to load options from DB, using fallbacks:', optErr.message);
    }

    // Fixed lists
    const priorities   = Object.values(TICKET_PRIORITY); // low, medium, high, critical
    const statuses     = ['open', 'in-progress', 'pending'];
    const requestTypes = ['Incident', 'Service Request'];
    const billableOpts = ['Billable', 'Non-Billable'];

    // ── Valid Options sheet (visible tab — users see ALL allowed values here) ────
    // Layout: each column = one field. Dropdowns in Import Template reference this sheet.
    //  A=category  B=priority  C=status  D=request_type  E=mode  F=impact
    //  G=urgency   H=billable  I=site    J=raised_by_team  K=group_name  L=assignee_email / requester_email
    const dropSheet = wb.addWorksheet('Valid Options');
    const hdrs = ['category','priority','status','request_type','mode','impact','urgency','billable','site','raised_by_team','group_name','user_email (assignee/requester)'];
    dropSheet.getRow(1).values = hdrs;
    dropSheet.getRow(1).font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    dropSheet.getRow(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    dropSheet.getRow(1).height = 18;

    const optCols = [
      categories,
      priorities,
      statuses,
      requestTypes,
      modeOpts,
      impactOpts,
      urgencyOpts,
      billableOpts,
      siteOpts,
      teamOpts,
      groupNames,
      agentEmails,
    ];
    optCols.forEach((list, ci) => {
      list.forEach((v, ri) => { dropSheet.getCell(ri + 2, ci + 1).value = v; });
      dropSheet.getColumn(ci + 1).width = ci === 11 ? 35 : 22;
    });

    // Row 2: example/hint row — shows users the expected format; actual data starts at row 3
    ws.addRow({
      title:           'My example ticket',
      description:     'Detailed description here',
      category:        categories[0],
      priority:        'medium',
      request_type:    'Incident',
      due_date:        '',
      status:          'open',
      mode:            'Web Form',
      impact:          'Medium',
      urgency:         'Medium',
      site:            '',
      raised_by_team:  '',
      group_name:      '',
      assignee_email:  '',
      requester_name:  '',
      requester_email: '',
      billable:        'Non-Billable',
    });
    const exampleRow = ws.getRow(2);
    exampleRow.font = { italic: true, color: { argb: 'FF6B7280' } };

    // Freeze header
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // ── Apply dropdown validation as ranges (rows 2–502) ─────────────────────
    // Starts at row 2 (example row) so dropdown arrows are visible immediately on open.
    // Columns: A=title B=description C=category D=priority E=request_type F=due_date
    //          G=status H=mode I=impact J=urgency K=site L=raised_by_team
    //          M=group_name(free) N=assignee_email(free) O=requester_name(free)
    //          P=requester_email(free) Q=billable

    // Helper: register a DV range referencing a 'Valid Options' column
    const addSheetDV = (range, col, count, title, err) => {
      if (count === 0) return; // no options — leave as free text
      ws.dataValidations.add(range, {
        type: 'list', allowBlank: true,
        formulae: [`'Valid Options'!$${col}$2:$${col}$${count + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: title, error: err,
      });
    };
    // Helper: register a DV range with inline string (for short fixed lists)
    const addInlineDV = (range, vals, title) => {
      ws.dataValidations.add(range, {
        type: 'list', allowBlank: true,
        formulae: [`"${vals.join(',')}"`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: title, error: `Allowed: ${vals.join(', ')}`,
      });
    };

    // Valid Options columns:  A=category B=priority C=status D=request_type E=mode
    //                         F=impact G=urgency H=billable I=site J=raised_by_team
    //                         K=group_name L=user_email

    // C = category         → Valid Options col A
    addSheetDV('C2:C502', 'A', categories.length,  'Invalid Category',     'Please select a category from the list');
    // D = priority         → inline (short fixed ENUM)
    addInlineDV('D2:D502', priorities,   'Invalid Priority');
    // E = request_type     → inline
    addInlineDV('E2:E502', requestTypes, 'Invalid Request Type');
    // G = status           → inline
    addInlineDV('G2:G502', statuses,     'Invalid Status');
    // H = mode             → Valid Options col E (from DB / fallback)
    addSheetDV('H2:H502', 'E', modeOpts.length,    'Invalid Mode',         'Please select a mode from the list');
    // I = impact           → Valid Options col F
    addSheetDV('I2:I502', 'F', impactOpts.length,  'Invalid Impact',       'Please select an impact level');
    // J = urgency          → Valid Options col G
    addSheetDV('J2:J502', 'G', urgencyOpts.length, 'Invalid Urgency',      'Please select an urgency level');
    // K = site             → Valid Options col I (conditional)
    addSheetDV('K2:K502', 'I', siteOpts.length,    'Invalid Site',         'Please select a site from the list');
    // L = raised_by_team   → Valid Options col J (conditional)
    addSheetDV('L2:L502', 'J', teamOpts.length,    'Invalid Team',         'Please select a team from the list');
    // M = group_name       → Valid Options col K (from HdGroup table)
    addSheetDV('M2:M502', 'K', groupNames.length,  'Invalid Group',        'Please select a group name from the list');
    // N = assignee_email   → Valid Options col L (active users)
    addSheetDV('N2:N502', 'L', agentEmails.length, 'Invalid Assignee',     'Please select an email from the list');
    // O = requester_name   → free text (any external person name — no dropdown)
    // P = requester_email  → Valid Options col L (same user list — reuse)
    addSheetDV('P2:P502', 'L', agentEmails.length, 'Invalid Email',        'Please select an email from the list');
    // Q = billable         → Valid Options col H
    addSheetDV('Q2:Q502', 'H', billableOpts.length,'Invalid Billable',     'Select: Billable or Non-Billable');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="helpdesk-import-template.xlsx"');

    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/export
 * Export all tickets (matching current filters) as an Excel file.
 * Supports the same filter query params as listTickets.
 * @type {import('express').RequestHandler}
 */
const exportTickets = async (req, res, next) => {
  try {
    const { status, priority, category, groupId, projectId, assigneeId, search, dateFrom, dateTo } = req.query;
    const hdUser = req.hdUser;

    const where = {};

    // Respect the same scope rules as listTickets
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

    const tickets = await HdTicket.findAll({
      where,
      include: [
        { model: User, as: 'assigneeUser',  attributes: ['id', 'name'], required: false, constraints: false },
        { model: User, as: 'requesterUser', attributes: ['id', 'name'], required: false, constraints: false },
      ],
      order: [['created_at', 'DESC']],
    });

    const XL = getExcelJS();
    const wb = new XL.Workbook();
    const ws = wb.addWorksheet('Helpdesk Tickets');

    ws.columns = [
      { header: 'Req Number',   key: 'reqNumber',    width: 14 },
      { header: 'Title',        key: 'title',        width: 40 },
      { header: 'Category',     key: 'category',     width: 20 },
      { header: 'Priority',     key: 'priority',     width: 12 },
      { header: 'Status',       key: 'status',       width: 14 },
      { header: 'Assignee',     key: 'assigneeName', width: 25 },
      { header: 'Requester',    key: 'requesterName',width: 25 },
      { header: 'Description',  key: 'description',  width: 50 },
      { header: 'Created At',   key: 'createdAt',    width: 20 },
      { header: 'Closed At',    key: 'closedAt',     width: 20 },
    ];

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.height = 20;

    for (const t of tickets) {
      const plain = t.get({ plain: true });
      ws.addRow({
        reqNumber:     plain.reqNumber   || '',
        title:         plain.title       || '',
        category:      plain.category    || '',
        priority:      plain.priority    || '',
        status:        plain.status      || '',
        assigneeName:  plain.assigneeUser?.name  || plain.widgetName || '',
        requesterName: plain.requesterUser?.name || '',
        description:   plain.description || '',
        createdAt:     plain.createdAt   ? new Date(plain.createdAt).toLocaleString() : '',
        closedAt:      plain.closedAt    ? new Date(plain.closedAt).toLocaleString()  : '',
      });
    }

    // Freeze header and auto-filter
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: `J1` };

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="helpdesk-tickets-${dateStr}.xlsx"`);

    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
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
  bulkUpload,
  getHistory,
  linkTicket,
  getImportTemplate,
  exportTickets,
};
