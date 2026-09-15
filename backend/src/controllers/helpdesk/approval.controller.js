'use strict';

/**
 * @module controllers/helpdesk/approval
 * Email-token based one-click approval workflow for helpdesk tickets.
 */

const crypto             = require('crypto');
const { HdTicketApproval, HdTicket, HdGroup } = require('../../models/helpdesk');
const User = require('../../models/User');
const { sendSuccess, sendError }     = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { sendEmail }      = require('../../utils/emailService');

const { APPROVAL_STATUS }       = HdTicketApproval;
const { TICKET_STATUS }         = HdTicket;
const PORTAL_BASE_URL           = process.env.PORTAL_BASE_URL || 'http://localhost:3000';

// â”€â”€â”€ Controllers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GET /helpdesk/approvals
 * List approvals. Admins/managers see all; others see only their own.
 * @type {import('express').RequestHandler}
 */
const listApprovals = async (req, res, next) => {
  try {
    const hdUser = req.hdUser;
    const where  = {};

    const isPrivileged = hdUser.isAdmin || hdUser.permissions.canApprove;
    if (!isPrivileged) {
      where.approverId = hdUser.id;
    }

    const approvals = await HdTicketApproval.findAll({
      where,
      include: [
        { model: User, as: 'approver',        attributes: ['id', 'name', 'email'], required: false },
        { model: User, as: 'requestedByUser', attributes: ['id', 'name'],          required: false },
      ],
      order: [['created_at', 'DESC']],
    });

    return sendSuccess(res, approvals, 'Approvals fetched');
  } catch (err) {
    next(err);
  }
};

// ─── Default approver resolution ─────────────────────────────────────────────

const NO_APPROVER = Object.freeze({ userId: null, name: null, email: null, source: null });

/** An active user's { id, name, email }, or null. */
async function activeUser(userId) {
  if (!userId) return null;
  return User.findOne({ where: { id: userId, isActive: true }, attributes: ['id', 'name', 'email'] });
}

/**
 * Who should approve a ticket when the caller does not pick someone:
 *   1. the requester's KPI reporting manager (`users.managerId`, must be active) → 'reporting_manager'
 *   2. the ticket group's manager (`hd_groups.manager_id`, must be active)      → 'group_manager'
 *   3. nobody                                                                    → source null
 *
 * @param {{ requesterId?: string|null, groupId?: number|null }} ticket
 * @returns {Promise<{ userId: string|null, name: string|null, email: string|null, source: 'reporting_manager'|'group_manager'|null }>}
 */
async function resolveDefaultApprover(ticket) {
  if (ticket.requesterId) {
    const requester = await User.findByPk(ticket.requesterId, { attributes: ['id', 'managerId'] });
    const manager   = await activeUser(requester?.managerId);
    if (manager) return { userId: manager.id, name: manager.name, email: manager.email, source: 'reporting_manager' };
  }
  if (ticket.groupId) {
    const group   = await HdGroup.findByPk(ticket.groupId, { attributes: ['id', 'managerId'] });
    const manager = await activeUser(group?.managerId);
    if (manager) return { userId: manager.id, name: manager.name, email: manager.email, source: 'group_manager' };
  }
  return { ...NO_APPROVER };
}

/**
 * GET /helpdesk/approvals/:ticketId/default-approver
 * The approver `requestApproval` would use when no approverId is sent.
 * Response: { userId, name, email, source } — userId/source null when nobody could be determined.
 * @type {import('express').RequestHandler}
 */
const getDefaultApprover = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const ticket   = await HdTicket.findByPk(ticketId, { attributes: ['id', 'requesterId', 'groupId'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const approver = await resolveDefaultApprover(ticket);
    return sendSuccess(res, approver, approver.userId ? 'Default approver resolved' : 'No default approver');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/approvals/:ticketId/request
 * Request approval for a ticket. Body: { approverId?, notes? }
 * When approverId is omitted the default approver is used (see resolveDefaultApprover);
 * 400 if none can be determined. Response data carries `approverSource`
 * ('manual' | 'reporting_manager' | 'group_manager').
 * @type {import('express').RequestHandler}
 */
const requestApproval = async (req, res, next) => {
  try {
    const ticketId   = Number(req.params.ticketId);
    const { notes }  = req.body;
    let { approverId } = req.body;
    let approverSource = 'manual';

    const ticket = await HdTicket.findByPk(ticketId);
    if (!ticket) return next(new NotFoundError('Ticket'));

    if (!approverId) {
      const resolved = await resolveDefaultApprover(ticket);
      if (!resolved.userId) return sendError(res, 'No approver could be determined — select one', 400);
      approverId     = resolved.userId;
      approverSource = resolved.source;
    }

    const token = crypto.randomBytes(32).toString('hex');

      // ── Guard: prevent duplicate pending approvals ──────────────────────────
      const existing = await HdTicketApproval.findOne({
        where: { ticketId: ticket.id, approverId, status: 'pending' },
      });
      if (existing) {
        return sendError(
          res,
          'An approval request is already pending for this approver on this ticket.',
          409,
        );
      }

    const approval = await HdTicketApproval.create({
      ticketId,
      approverId,
      requestedBy: req.hdUser.id,
      token,
      status: APPROVAL_STATUS.PENDING,
      notes:  notes || null,
    });

    const approveUrl = `${PORTAL_BASE_URL}/api/helpdesk/approvals/respond?token=${token}&action=approve`;
    const rejectUrl  = `${PORTAL_BASE_URL}/api/helpdesk/approvals/respond?token=${token}&action=reject`;

    // Look up the approver's actual email address before sending
    const approverUser = await User.findByPk(approverId, { attributes: ['email', 'name'] });
    const approverEmail = approverUser?.email;

    if (approverEmail) {
      sendEmail(
        approverEmail,
        `Approval Requested: ${ticket.reqNumber}`,
        `<p>You have been requested to approve ticket <strong>${ticket.reqNumber}</strong> â€” ${ticket.title}.</p>
         <p><a href="${approveUrl}">Approve</a> &nbsp;|&nbsp; <a href="${rejectUrl}">Reject</a></p>`,
      ).catch(() => {});
    }

    return sendSuccess(res, { ...approval.get({ plain: true }), approverSource }, 'Approval requested', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/approvals/respond  â€” PUBLIC (no auth)
 * One-click approve/reject via token link from email.
 * Query: ?token=X&action=approve|reject
 * @type {import('express').RequestHandler}
 */
const respondApproval = async (req, res, next) => {
  try {
    const { token, action } = req.query;

    if (!token)  return sendError(res, 'token is required', 400);
    if (!['approve', 'reject'].includes(action))
      return sendError(res, 'action must be approve or reject', 400);

    const approval = await HdTicketApproval.findOne({ where: { token } });
    if (!approval) return sendError(res, 'Invalid or expired token', 404);

    if (approval.status !== APPROVAL_STATUS.PENDING)
      return sendError(res, 'This approval request has already been acted upon', 409);

    // Block if the parent ticket is already closed or resolved
    const ticketCheck = await HdTicket.findByPk(approval.ticketId, { attributes: ['id', 'status'] });
    if (ticketCheck && ['closed', 'resolved'].includes(ticketCheck.status)) {
      return sendError(res, 'The ticket has already been closed', 409);
    }

    const newStatus = action === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED;
    approval.status = newStatus;
    if (newStatus === APPROVAL_STATUS.APPROVED) approval.approvedAt = new Date();

    // Invalidate the token so it cannot be replayed
    approval.token = `used_${crypto.randomUUID()}`;
    await approval.save();

    // Update ticket status accordingly
    const ticket = await HdTicket.findByPk(approval.ticketId);
    if (ticket) {
      if (newStatus === APPROVAL_STATUS.APPROVED) {
        ticket.status = TICKET_STATUS.IN_PROGRESS;
      } else {
        ticket.status = TICKET_STATUS.PENDING;
      }
      await ticket.save();
    }

    return sendSuccess(res, { status: newStatus }, `Approval ${newStatus}`);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/approvals/:ticketId/status
 * Get all approvals for a ticket.
 * @type {import('express').RequestHandler}
 */
const getApprovalStatus = async (req, res, next) => {
  try {
    const ticketId = Number(req.params.ticketId);
    const ticket   = await HdTicket.findByPk(ticketId, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const approvals = await HdTicketApproval.findAll({
      where: { ticketId },
      include: [
        { model: User, as: 'approver',        attributes: ['id', 'name', 'email'], required: false },
        { model: User, as: 'requestedByUser', attributes: ['id', 'name'],          required: false },
      ],
      order: [['created_at', 'DESC']],
    });

    return sendSuccess(res, approvals, 'Approval status fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/approvals/:approvalId/respond-auth
 * Authenticated approve/reject â€” for in-app approval from TicketDetail.
 * Only the designated approver can respond.
 * @type {import('express').RequestHandler}
 */
const respondApprovalAuth = async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const { action, notes } = req.body; // action: 'approve' | 'reject'
    const hdUser = req.hdUser;

    if (!['approve', 'reject'].includes(action)) {
      return sendError(res, 'action must be "approve" or "reject"', 400);
    }

    const approval = await HdTicketApproval.findByPk(approvalId);
    if (!approval) return next(new NotFoundError('Approval'));
    if (approval.approverId !== hdUser.id && !hdUser.isAdmin) {
      return next(new ForbiddenError('Only the designated approver can respond'));
    }
    if (approval.status !== APPROVAL_STATUS.PENDING) {
      return sendError(res, 'This approval has already been responded to', 409);
    }

    approval.status = action === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED;
    approval.notes = notes || null;
    if (action === 'approve') approval.approvedAt = new Date();
    // Invalidate token so email link no longer works
    approval.token = require('crypto').randomUUID();
    await approval.save();

    // ── Also transition the ticket status (mirrors respondApproval email flow) ──
    const ticket = await HdTicket.findByPk(approval.ticketId);
    if (ticket) {
      ticket.status = action === 'approve' ? 'in-progress' : 'pending';
      await ticket.save();
    }

    return sendSuccess(res, { approval, ticketStatus: ticket?.status }, `Approval ${approval.status}`);
  } catch (err) { next(err); }
};

module.exports = {
  listApprovals, requestApproval, respondApproval, getApprovalStatus, respondApprovalAuth,
  getDefaultApprover, resolveDefaultApprover,
};
