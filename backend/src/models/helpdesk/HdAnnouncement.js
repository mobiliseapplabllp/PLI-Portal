/**
 * HdAnnouncement — System-wide announcement visible to all portal users.
 * Table: hd_announcements
 *
 * Announcements with expiresAt in the past are considered inactive.
 * A null expiresAt means the announcement never expires.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdAnnouncement = sequelize.define('HdAnnouncement', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  title: {
    type:      DataTypes.STRING(300),
    allowNull: false,
    validate:  { notEmpty: { msg: 'Announcement title is required' } },
  },
  body: {
    type:      DataTypes.TEXT,
    allowNull: false,
    validate:  { notEmpty: { msg: 'Announcement body is required' } },
  },
  // PLI Portal user UUID
  createdBy: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'created_by',
  },
  expiresAt: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'expires_at',
    comment:   'NULL = never expires',
  },
}, {
  tableName:  'hd_announcements',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   false,
  scopes: {
    /** Returns only announcements that have not yet expired. */
    active: {
      where: sequelize.literal(
        '(expires_at IS NULL OR expires_at > NOW())'
      ),
    },
  },
});

module.exports = HdAnnouncement;
