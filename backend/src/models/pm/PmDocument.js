/**
 * PmDocument — Uploaded document metadata for PM projects and milestones.
 * Table: pm_documents
 *
 * Files are stored on disk via Multer (memoryStorage); this table holds metadata.
 * entityType + entityId form a polymorphic FK linking to either a project or milestone.
 *
 * Serve files via:   GET /api/pm/projects/:projectId/documents/:docId/download
 * Delete from disk when this record is deleted (handled in the controller).
 */
'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmDocument = sequelize.define('PmDocument', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  entityType: {
    type: DataTypes.ENUM('project', 'milestone'),
    allowNull: false,
    field: 'entity_type',
  },
  entityId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'entity_id',
  },
  category: {
    type: DataTypes.STRING(150),
    allowNull: false,
    defaultValue: 'Others',
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Original filename as provided by the uploader',
  },
  storedName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'stored_name',
    comment: 'UUID-based filename on disk (prevents collisions and path traversal)',
  },
  mimeType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'mime_type',
  },
  sizeBytes: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'size_bytes',
    validate: { min: 0 },
  },
  uploadedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'uploaded_by_id',
  },
}, {
  tableName: 'pm_documents',
  underscored: true,
  timestamps: true,
  indexes: [
    { fields: ['entity_type', 'entity_id'] },
  ],
});

module.exports = PmDocument;
