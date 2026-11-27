'use strict';

/**
 * @module controllers/helpdesk/attachment
 * File upload, serve, and delete for helpdesk attachments.
 *
 * New uploads store bytes directly in the database (hd_attachments.file_blob)
 * — same pattern as HdDocument. Legacy rows (uploaded before migration 063,
 * stored_name set, file_blob NULL) keep reading from disk exactly as before;
 * nothing on disk is touched or migrated.
 */

const path      = require('path');
const fs        = require('fs');
const { HdAttachment } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

// Legacy only — new uploads no longer write here.
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

    const attachment = await HdAttachment.create({
      ticketId:       ticketId       ? Number(ticketId)       : null,
      conversationId: conversationId ? Number(conversationId) : null,
      uploadedBy:     req.hdUser.id,
      filename:       req.file.originalname,
      storedName:     null, // blob-stored — nothing on disk for this row
      mimeType:       req.file.mimetype,
      sizeBytes:      req.file.size,
      fileBlob:       req.file.buffer,
    });

    const { fileBlob, ...plain } = attachment.get({ plain: true });
    return sendSuccess(res, plain, 'File uploaded', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/attachments/:id/download
 * Serve by primary key — blob-stored rows have no stored_name to key off of.
 * Dual-read: file_blob first (new uploads), disk fallback (legacy rows).
 * @type {import('express').RequestHandler}
 */
const downloadAttachment = async (req, res, next) => {
  try {
    const attachment = await HdAttachment.findByPk(req.params.id);
    if (!attachment) return sendError(res, 'Attachment not found', 404);

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');

    if (attachment.fileBlob) {
      return res.send(attachment.fileBlob);
    }

    if (!attachment.storedName) return sendError(res, 'File not found', 404);
    const filePath = path.resolve(UPLOAD_DIR, attachment.storedName);
    if (!fs.existsSync(filePath)) return sendError(res, 'File not found on server', 404);
    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/attachments/:storedName
 * Legacy direct-link route — only ever matches disk-stored rows (blob-stored
 * ones have storedName = NULL, so this 404s for them by construction; use
 * downloadAttachment (by id) for those instead).
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
 * Delete an attachment record and the corresponding file on disk (legacy
 * rows only — a blob-stored row has no file to remove, destroying the row
 * below is the whole deletion). Only the uploader or an admin can delete.
 * @type {import('express').RequestHandler}
 */
const deleteAttachment = async (req, res, next) => {
  try {
    const attachment = await HdAttachment.findByPk(req.params.id);
    if (!attachment) return next(new NotFoundError('Attachment'));

    if (!req.hdUser.isAdmin && attachment.uploadedBy !== req.hdUser.id)
      return next(new ForbiddenError('Only the uploader or an admin can delete this attachment'));

    if (attachment.storedName) {
      const filePath = path.resolve(UPLOAD_DIR, attachment.storedName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await attachment.destroy();
    return sendSuccess(res, null, 'Attachment deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadAttachment, downloadAttachment, serveAttachment, deleteAttachment };
