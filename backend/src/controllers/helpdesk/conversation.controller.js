'use strict';

/**
 * @module controllers/helpdesk/conversation
 * Threaded replies and internal notes on a helpdesk ticket.
 */

const { Op }    = require('sequelize');
const {
  HdConversation,
  HdTicket,
  HdAttachment,
  HdTicketHistory,
}               = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { sendEmail } = require('../../utils/emailService');

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/tickets/:id/conversations
 * List conversations for a ticket.
 * Non-admins cannot see internal notes unless they authored them.
 * @type {import('express').RequestHandler}
 */
const listConversations = async (req, res, next) => {
  try {
    const hdUser = req.hdUser;
    const ticketId = Number(req.params.id);

    const ticket = await HdTicket.findByPk(ticketId, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const where = { ticketId };
    if (!hdUser.isAdmin) {
      where[Op.or] = [
        { isInternal: false },
        { userId: hdUser.id },
      ];
    }

    const conversations = await HdConversation.findAll({
      where,
      // Never send the raw bytes back in a JSON response.
      include: [{ model: HdAttachment, as: 'files', required: false, attributes: { exclude: ['fileBlob'] } }],
      order:   [['created_at', 'ASC']],
    });

    return sendSuccess(res, conversations, 'Conversations fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/:id/conversations
 * Add a reply or internal note. Handles optional file upload via multer.
 * @type {import('express').RequestHandler}
 */
const addConversation = async (req, res, next) => {
  try {
    const ticketId   = Number(req.params.id);
    const hdUser     = req.hdUser;
    const { message, isInternal } = req.body;

    if (!message || !message.trim())
      return sendError(res, 'message is required', 400);

    const ticket = await HdTicket.findByPk(ticketId);
    if (!ticket) return next(new NotFoundError('Ticket'));

    const conversation = await HdConversation.create({
      ticketId,
      userId:      hdUser.id,
      authorName:  hdUser.name,
      authorEmail: hdUser.email,
      message:     message.trim(),
      isInternal:  isInternal === true || isInternal === 'true',
    });

    // Handle uploaded file (multer memoryStorage) — blob-stored, same pattern
    // as HdDocument / the standalone attachment upload endpoint.
    if (req.file) {
      await HdAttachment.create({
        ticketId,
        conversationId: conversation.id,
        uploadedBy:     hdUser.id,
        filename:       req.file.originalname,
        storedName:     null,
        mimeType:       req.file.mimetype,
        sizeBytes:      req.file.size,
        fileBlob:       req.file.buffer,
      });
    }

    // Email notification — non-blocking
    if (!conversation.isInternal && ticket.widgetEmail) {
      sendEmail(
        ticket.widgetEmail,
        `New reply on ticket ${ticket.reqNumber}`,
        `<p>${hdUser.name} replied to your ticket <strong>${ticket.reqNumber}</strong>:</p><p>${message}</p>`,
      ).catch(() => {});
    }

    return sendSuccess(res, conversation, 'Conversation added', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/conversations/:id
 * Edit a conversation. Only the author or an admin can edit, and only while
 * the ticket is still open — once closed, replies are frozen (matches the
 * same "closed means closed" reasoning as everything else on a closed
 * ticket). Every message edit is logged to hd_ticket_history (old → new,
 * who, when) so nothing is silently rewritten — the same append-only audit
 * trail every other ticket field change already goes through.
 * @type {import('express').RequestHandler}
 */
const updateConversation = async (req, res, next) => {
  try {
    const hdUser = req.hdUser;
    const conv   = await HdConversation.findByPk(req.params.id);
    if (!conv) return next(new NotFoundError('Conversation'));

    if (!hdUser.isAdmin && conv.userId !== hdUser.id)
      return next(new ForbiddenError('Only the author or an admin can edit this conversation'));

    const ticket = await HdTicket.findByPk(conv.ticketId, { attributes: ['id', 'status'] });
    if (ticket?.status === 'closed')
      return sendError(res, 'This ticket is closed — replies can no longer be edited', 409);

    const { message, isInternal } = req.body;
    const oldMessage = conv.message;
    if (message !== undefined) conv.message = message.trim();
    if (isInternal !== undefined) conv.isInternal = isInternal === true || isInternal === 'true';

    await conv.save();

    if (message !== undefined && message.trim() !== oldMessage) {
      await HdTicketHistory.create({
        ticketId:  conv.ticketId,
        changedBy: hdUser.id,
        field:     'conversation_message',
        oldValue:  oldMessage,
        newValue:  conv.message,
      });
    }

    return sendSuccess(res, conv, 'Conversation updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/conversations/:id
 * Delete a conversation. Only the author or an admin can delete.
 * @type {import('express').RequestHandler}
 */
const deleteConversation = async (req, res, next) => {
  try {
    const hdUser = req.hdUser;
    const conv   = await HdConversation.findByPk(req.params.id);
    if (!conv) return next(new NotFoundError('Conversation'));

    if (!hdUser.isAdmin && conv.userId !== hdUser.id)
      return next(new ForbiddenError('Only the author or an admin can delete this conversation'));

    await conv.destroy();
    return sendSuccess(res, null, 'Conversation deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listConversations,
  addConversation,
  updateConversation,
  deleteConversation,
};
