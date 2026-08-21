'use strict';

/**
 * @module controllers/helpdesk/attachment
 * File upload, serve, and delete for helpdesk attachments.
 * Files are stored on disk via Multer (memoryStorage); metadata in hd_attachments.
 */

const path      = require('path');
const fs        = require('fs');
const crypto    = require('crypto');
const { HdAttachment } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /helpdesk/attachments
 * Upload a single file (multer middleware must run before this handler).
 * Optionally link to a ticket or conversation via body: { ticketId?, conversationId? }
 * @type {import('express').RequestHandler}
 */
const uploadAttachment = async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded', 400);

    const { ticketId, conversationId } = req.body;

    const ext        = path.extname(req.file.originalname);
    const storedName = `${crypto.randomUUID()}${ext}`;
    const destPath   = path.resolve(UPLOAD_DIR, storedName);

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(destPath, req.file.buffer);

    const attachment = await HdAttachment.create({
      ticketId:       ticketId       ? Number(ticketId)       : null,
      conversationId: conversationId ? Number(conversationId) : null,
      uploadedBy:     req.hdUser.id,
      filename:       req.file.originalname,
      storedName,
      mimeType:       req.file.mimetype,
      sizeBytes:      req.file.size,
    });

    return sendSuccess(res, attachment, 'File uploaded', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/attachments/:storedName
 * Stream a file from disk by its stored name.
 * @type {import('express').RequestHandler}
 */
const serveAttachment = async (req, res, next) => {
  try {
    // Prevent path traversal
    const storedName = path.basename(req.params.storedName);
    const filePath   = path.resolve(UPLOAD_DIR, storedName);

    if (!fs.existsSync(filePath))
      return sendError(res, 'File not found', 404);

    const record = await HdAttachment.findOne({ where: { storedName } });
    if (record && record.mimeType) {
      res.setHeader('Content-Type', record.mimeType);
    }
    if (record && record.filename) {
      res.setHeader('Content-Disposition', `inline; filename="${record.filename}"`);
    }

    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/attachments/:id
 * Delete an attachment record and the corresponding file on disk.
 * Only the uploader or an admin can delete.
 * @type {import('express').RequestHandler}
 */
const deleteAttachment = async (req, res, next) => {
  try {
    const attachment = await HdAttachment.findByPk(req.params.id);
    if (!attachment) return next(new NotFoundError('Attachment'));

    if (!req.hdUser.isAdmin && attachment.uploadedBy !== req.hdUser.id)
      return next(new ForbiddenError('Only the uploader or an admin can delete this attachment'));

    const filePath = path.resolve(UPLOAD_DIR, attachment.storedName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await attachment.destroy();
    return sendSuccess(res, null, 'Attachment deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadAttachment, serveAttachment, deleteAttachment };
