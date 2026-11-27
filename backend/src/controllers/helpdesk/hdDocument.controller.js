'use strict';
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const HdDocument = require('../../models/helpdesk/HdDocument');
const HdAttachment = require('../../models/helpdesk/HdAttachment');

// Legacy only — new uploads no longer write here, this stays purely so
// documents uploaded before migration 061 keep downloading correctly.
const UPLOAD_DIR = path.join(__dirname, '../../../uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

exports.uploadMiddleware = upload.single('file');

// Never send the raw bytes back in a JSON response — list/upload responses
// only need the metadata, same shape with or without a blob stored.
const PUBLIC_ATTRS = { exclude: ['fileBlob'] };

exports.uploadDocument = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const file = req.file;
    if (!file) return res.status(400).json({ error: { message: 'No file uploaded' } });
    const category = req.body.category || 'Others';
    const doc = await HdDocument.create({
      ticketId: Number(ticketId),
      category,
      filename: file.originalname,
      storedName: null, // blob-stored — nothing on disk for this row
      mimeType: file.mimetype,
      sizeBytes: file.size,
      fileBlob: file.buffer,
      uploadedById: req.user?._id ?? req.user?.id ?? null,
    });
    const { fileBlob, ...plain } = doc.get({ plain: true });
    return res.status(201).json({ data: plain });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};

exports.listDocuments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const docs = await HdDocument.findAll({
      where: { ticketId: Number(ticketId) },
      attributes: PUBLIC_ATTRS,
      include: [{ association: 'uploadedBy', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });

    // Merge in legacy ticket-level attachments — files uploaded via the old
    // Create Ticket "Attachment" field (before it folded into Documents).
    // conversationId IS NULL excludes conversation-reply attachments, which
    // are shown inline on the reply itself, not here. Each row is shaped to
    // look like a document (source: 'attachment' tells the frontend which
    // download endpoint to call — these were never blob-migrated).
    const legacyAttachments = await HdAttachment.findAll({
      where: { ticketId: Number(ticketId), conversationId: null },
      include: [{ association: 'uploadedByUser', attributes: ['id', 'name'] }],
      // HdAttachment maps createdAt -> created_at explicitly (no `underscored:
      // true` on this model, unlike HdDocument) — the raw column name is
      // required here, 'createdAt' is not a recognized order-by alias.
      order: [['created_at', 'DESC']],
    });
    const legacyAsDocuments = legacyAttachments.map((a) => ({
      id: a.id,
      source: 'attachment',
      category: 'Initial Request Attachment',
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedBy: a.uploadedByUser,
      createdAt: a.createdAt,
    }));

    const merged = [...docs.map((d) => ({ ...d.get({ plain: true }), source: 'document' })), ...legacyAsDocuments]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ data: merged });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const { ticketId, docId } = req.params;
    const doc = await HdDocument.findOne({ where: { id: docId, ticketId: Number(ticketId) } });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');

    // New (blob-stored) documents serve straight from the database.
    if (doc.fileBlob) {
      return res.send(doc.fileBlob);
    }

    // Legacy documents (uploaded before migration 061) — unchanged behavior,
    // read from disk exactly as before.
    if (!doc.storedName) return res.status(404).json({ error: { message: 'File not found' } });
    const filePath = path.join(UPLOAD_DIR, doc.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: { message: 'File not found on server' } });
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const { ticketId, docId } = req.params;
    const doc = await HdDocument.findOne({ where: { id: docId, ticketId: Number(ticketId) } });
    if (!doc) return res.status(404).json({ error: { message: 'Document not found' } });
    // Only legacy (disk-stored) documents have a file to remove — blob-stored
    // ones are deleted entirely by destroying the row itself, below.
    if (doc.storedName) {
      const filePath = path.join(UPLOAD_DIR, doc.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await doc.destroy();
    return res.json({ data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
