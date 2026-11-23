'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdDocument = sequelize.define('HdDocument', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ticketId: { type: DataTypes.INTEGER, allowNull: false, field: 'ticket_id' },
  category: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'Others' },
  filename: { type: DataTypes.STRING(255), allowNull: false },
  // NULL for a blob-stored row (new uploads) — set only on legacy
  // disk-stored rows, which the download endpoint falls back to.
  storedName: { type: DataTypes.STRING(255), allowNull: true, field: 'stored_name' },
  mimeType: { type: DataTypes.STRING(100), allowNull: true, field: 'mime_type' },
  sizeBytes: { type: DataTypes.INTEGER, allowNull: true, field: 'size_bytes', validate: { min: 0 } },
  uploadedById: { type: DataTypes.UUID, allowNull: true, field: 'uploaded_by_id' },
  // New uploads store bytes directly here — same pattern as
  // KpiAssignment.employeeAttachmentBlob/managerAttachmentBlob.
  fileBlob: { type: DataTypes.BLOB('long'), allowNull: true, field: 'file_blob' },
}, {
  tableName: 'hd_documents',
  underscored: true,
  timestamps: true,
  indexes: [{ fields: ['ticket_id'] }],
});

module.exports = HdDocument;
