'use strict';
const path    = require('path');
const fs      = require('fs');
const { v4: uuid } = require('uuid');
const multer  = require('multer');
const HdDocument = require('../../models/helpdesk/HdDocument');
const { sendError } = require('../../utils/response');

const UPLOAD_DIR = path.join(__dirname, '../../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

exports.uploadMiddleware = upload.single('file');

exports.uploadDocument = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const file = req.file;
    if (!file) return sendError(res, 'No file uploaded', 400);
    const category = req.body.category || 'Others';
    const ext = path.extname(file.originalname) || '';
    const storedName = `${uuid()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), file.buffer);
    const doc = await HdDocument.create({
      ticketId: Number(ticketId),
      category,
      filename: file.originalname,
      storedName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById: req.user?._id ?? req.user?.id ?? null,
    });
    return res.status(201).json({ data: doc });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.listDocuments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const docs = await HdDocument.findAll({
      where: { ticketId: Number(ticketId) },
      include: [{ association: 'uploadedBy', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']],
    });
    return res.json({ data: docs });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.downloadDocument = async (req, res) => {
  try {
    const { ticketId, docId } = req.params;
    const doc = await HdDocument.findOne({ where: { id: docId, ticketId: Number(ticketId) } });
    if (!doc) return sendError(res, 'Document not found', 404);
    const filePath = path.join(UPLOAD_DIR, doc.storedName);
    if (!fs.existsSync(filePath)) return sendError(res, 'File not found on server', 404);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const { ticketId, docId } = req.params;
    const doc = await HdDocument.findOne({ where: { id: docId, ticketId: Number(ticketId) } });
    if (!doc) return sendError(res, 'Document not found', 404);
    const filePath = path.join(UPLOAD_DIR, doc.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await doc.destroy();
    return res.json({ data: { deleted: true } });
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};
