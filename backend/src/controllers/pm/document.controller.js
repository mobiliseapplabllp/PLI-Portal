'use strict';

/**
 * @module controllers/pm/document
 * Upload, list, serve, and delete documents for PM projects and milestones.
 * Files are stored on disk via Multer (memoryStorage); metadata in pm_documents.
 */

const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const PmDocument = require('../../models/pm/PmDocument');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve entityType + entityId from a request.
 * Milestone route:  /projects/:projectId/milestones/:milestoneId/documents
 * Project route:    /projects/:projectId/documents
 */
function resolveEntity(req) {
  if (req.params.milestoneId) {
    return { entityType: 'milestone', entityId: req.params.milestoneId };
  }
  return { entityType: 'project', entityId: req.params.projectId };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /projects/:projectId/documents
 * POST /projects/:projectId/milestones/:milestoneId/documents
 * Upload a single file (multer middleware must run before this handler).
 * Body: { category? }
 * @type {import('express').RequestHandler}
 */
const uploadDocument = async (req, res, next) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded', 400);

    const { entityType, entityId } = resolveEntity(req);
    const { category } = req.body;

    const ext        = path.extname(req.file.originalname);
    const storedName = `${crypto.randomUUID()}${ext}`;
    const destPath   = path.resolve(UPLOAD_DIR, storedName);

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(destPath, req.file.buffer);

    const doc = await PmDocument.create({
      entityType,
      entityId,
      category:     category || 'Other',
      filename:     req.file.originalname,
      storedName,
      mimeType:     req.file.mimetype,
      sizeBytes:    req.file.size,
      uploadedById: req.user ? req.user.id : null,
    });

    return sendSuccess(res, doc, 'Document uploaded', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /projects/:projectId/documents
 * GET /projects/:projectId/milestones/:milestoneId/documents
 * List all documents for the resolved entity.
 * @type {import('express').RequestHandler}
 */
const listDocuments = async (req, res, next) => {
  try {
    const { entityType, entityId } = resolveEntity(req);

    const docs = await PmDocument.findAll({
      where: { entityType, entityId },
      order: [['createdAt', 'DESC']],
    });

    return sendSuccess(res, docs);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /projects/:projectId/documents/:docId/download
 * GET /projects/:projectId/milestones/:milestoneId/documents/:docId/download
 * Stream a document from disk by its DB id.
 * @type {import('express').RequestHandler}
 */
const downloadDocument = async (req, res, next) => {
  try {
    const doc = await PmDocument.findByPk(req.params.docId);
    if (!doc) return next(new NotFoundError('Document'));

    // Prevent path traversal
    const storedName = path.basename(doc.storedName);
    const filePath   = path.resolve(UPLOAD_DIR, storedName);

    if (!fs.existsSync(filePath))
      return sendError(res, 'File not found on disk', 404);

    if (doc.mimeType) {
      res.setHeader('Content-Type', doc.mimeType);
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.filename)}"`
    );

    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /projects/:projectId/documents/:docId
 * DELETE /projects/:projectId/milestones/:milestoneId/documents/:docId
 * Delete a document record and the corresponding file on disk.
 * Only the uploader or an admin can delete.
 * @type {import('express').RequestHandler}
 */
const deleteDocument = async (req, res, next) => {
  try {
    const doc = await PmDocument.findByPk(req.params.docId);
    if (!doc) return next(new NotFoundError('Document'));

    const isAdmin = req.user && (req.user.role === 'admin' || req.user.isAdmin);
    const isOwner = req.user && doc.uploadedById === req.user.id;

    if (!isAdmin && !isOwner)
      return next(new ForbiddenError('Only the uploader or an admin can delete this document'));

    const filePath = path.resolve(UPLOAD_DIR, path.basename(doc.storedName));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await doc.destroy();
    return sendSuccess(res, null, 'Document deleted');
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadDocument, listDocuments, downloadDocument, deleteDocument };
