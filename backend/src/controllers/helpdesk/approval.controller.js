'use strict';

/**
 * @module controllers/helpdesk/approval
 * Email-token based one-click approval workflow for helpdesk tickets.
 */

const crypto             = require('crypto');
const { HdTicketApproval, HdTicket } = require('../../models/helpdesk');
const User = require('../../models/User');
const { sendSuccess, sendError }     = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { sendEmail }      = require('../../utils/emailService');
const statusResolver     = require('../../services/helpdesk/statusResolver.service');

const { APPROVAL_STATUS }       = HdTicketApproval;
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

/**
 * POST /helpdesk/approvals/:ticketId/request
 * Request approval for a ticket. Body: { approverId }
 * @type {import('express').RequestHandler}
 */
const requestApproval = async (req, res, next) => {
  try {
    const ticketId   = Number(req.params.ticketId);
    const { approverId, notes } = req.body;

    if (!approverId) return sendError(res, 'approverId is required', 400);

    const ticket = await HdTicket.findByPk(ticketId);
    if (!ticket) return next(new NotFoundError('Ticket'));

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

    return sendSuccess(res, approval, 'Approval requested', 201);
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

    // Block if the parent ticket is already closed or resolved — by statusId
    // against the built-in keys, not a literal string comparison.
    const ticketCheck = await HdTicket.findByPk(approval.ticketId, { attributes: ['id', 'statusId'] });
    if (ticketCheck) {
      const closedIds = await statusResolver.getClosedStatusIds();
      if (closedIds.includes(ticketCheck.statusId)) {
        return sendError(res, 'The ticket has already been closed', 409);
      }
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
      const targetKey = newStatus === APPROVAL_STATUS.APPROVED ? 'in-progress' : 'pending';
      const targetOpt = await statusResolver.getBuiltInStatus(targetKey);
      ticket.status   = targetOpt.name;
      ticket.statusId = targetOpt.id;
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

module.exports = { listApprovals, requestApproval, respondApproval, getApprovalStatus, respondApprovalAuth };
