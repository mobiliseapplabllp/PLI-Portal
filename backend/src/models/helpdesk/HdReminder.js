/**
 * HdReminder — Scheduled reminder for a ticket, delivered via email.
 * Table: hd_reminders
 *
 * The reminder cron job queries WHERE sent = 0 AND remind_at <= NOW()
 * and marks each record sent = 1 after delivering the email.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdReminder = sequelize.define('HdReminder', {
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
  // PLI Portal user UUID — recipient of the reminder
  userId: {
    type:      DataTypes.STRING(36),
    allowNull: false,
    field:     'user_id',
  },
  remindAt: {
    type:      DataTypes.DATE,
    allowNull: false,
    field:     'remind_at',
    validate:  { isDate: { msg: 'remindAt must be a valid date' } },
  },
  message: {
    type:      DataTypes.TEXT,
    allowNull: true,
  },
  sent: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    comment:      '1 = email has been dispatched; record should not be re-processed',
  },
}, {
  tableName:  'hd_reminders',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   false,
});

module.exports = HdReminder;
