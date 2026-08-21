/**
 * HdConversation — Threaded replies and internal notes on a ticket.
 * Table: hd_conversations
 *
 * isInternal = true  → visible only to agents (internal note)
 * isInternal = false → visible to requester (public reply)
 *
 * attachments JSON shape: [{ filename, storedName, mimeType, sizeBytes }]
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdConversation = sequelize.define('HdConversation', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  ticketId: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    field:     'ticket_id',
    references: { model: 'hd_tickets', key: 'id' },
  },
  // PLI Portal user UUID (null for unauthenticated widget replies)
  userId: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'user_id',
  },
  authorName: {
    type:      DataTypes.STRING(200),
    allowNull: true,
    field:     'author_name',
    comment:   'Fallback display name for widget (non-user) replies',
  },
  authorEmail: {
    type:      DataTypes.STRING(200),
    allowNull: true,
    field:     'author_email',
  },
  message: {
    type:      DataTypes.TEXT,
    allowNull: false,
    validate:  { notEmpty: { msg: 'Message cannot be empty' } },
  },
  attachments: {
    type:         DataTypes.JSON,
    allowNull:    true,
    defaultValue: [],
  },
  isInternal: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'is_internal',
  },
}, {
  tableName:  'hd_conversations',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   'updated_at',
});

module.exports = HdConversation;
