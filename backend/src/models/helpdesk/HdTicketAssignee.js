/**
 * HdTicketAssignee — Multi-assignee mapping with workload weight per ticket.
 * Table: hd_ticket_assignees
 *
 * weight: percentage of workload assigned to this agent (all weights for a ticket
 * should ideally sum to 100, but this is not enforced at the DB level).
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdTicketAssignee = sequelize.define('HdTicketAssignee', {
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
  // PLI Portal user UUID
  userId: {
    type:      DataTypes.STRING(36),
    allowNull: false,
    field:     'user_id',
  },
  weight: {
    type:         DataTypes.INTEGER,
    defaultValue: 100,
    validate:     { min: 1, max: 100 },
  },
  assignedAt: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field:        'assigned_at',
  },
}, {
  tableName:  'hd_ticket_assignees',
  underscored: true,
  timestamps:  false,
  indexes: [
    { unique: true, fields: ['ticket_id', 'user_id'] },
  ],
});

module.exports = HdTicketAssignee;
