/**
 * HdTicketHistory — Immutable audit trail for every field change on a ticket.
 * Table: hd_ticket_history
 *
 * Records are append-only; no update/delete allowed.
 * changedBy is null for system-initiated changes (e.g. SLA breach detection).
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdTicketHistory = sequelize.define('HdTicketHistory', {
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
  // PLI Portal user UUID; null = system change
  changedBy: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'changed_by',
  },
  field: {
    type:      DataTypes.STRING(60),
    allowNull: false,
    validate:  { notEmpty: true },
  },
  oldValue: {
    type:      DataTypes.TEXT,
    allowNull: true,
    field:     'old_value',
  },
  newValue: {
    type:      DataTypes.TEXT,
    allowNull: true,
    field:     'new_value',
  },
  changedAt: {
    type:         DataTypes.DATE,
    allowNull:    false,
    defaultValue: DataTypes.NOW,
    field:        'changed_at',
  },
}, {
  tableName:  'hd_ticket_history',
  underscored: true,
  timestamps:  false, // changedAt is the only timestamp needed
});

module.exports = HdTicketHistory;
