/**
 * HdAttachment — Uploaded file metadata record.
 * Table: hd_attachments
 *
 * Files are stored on disk via Multer; this table holds the metadata.
 * ticketId and conversationId are optional (attachment may be linked to either or both).
 *
 * Serve files via: GET /api/helpdesk/attachments/:storedName
 * Delete from disk when this record is deleted (handled in the service layer).
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdAttachment = sequelize.define('HdAttachment', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  ticketId: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    field:     'ticket_id',
    references: { model: 'hd_tickets', key: 'id' },
  },
  conversationId: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    field:     'conversation_id',
    references: { model: 'hd_conversations', key: 'id' },
  },
  // PLI Portal user UUID
  uploadedBy: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'uploaded_by',
  },
  filename: {
    type:      DataTypes.STRING(300),
    allowNull: false,
    comment:   'Original filename as provided by the uploader',
  },
  storedName: {
    type:      DataTypes.STRING(300),
    allowNull: false,
    field:     'stored_name',
    comment:   'UUID-based filename on disk (prevents collisions and path traversal)',
  },
  mimeType: {
    type:      DataTypes.STRING(100),
    allowNull: true,
    field:     'mime_type',
  },
  sizeBytes: {
    type:      DataTypes.INTEGER,
    allowNull: true,
    field:     'size_bytes',
    validate:  { min: 0 },
  },
}, {
  tableName:  'hd_attachments',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   false,
});

module.exports = HdAttachment;
