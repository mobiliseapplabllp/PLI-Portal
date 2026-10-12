'use strict';
/**
 * HdTicketAllocationProposal — negotiation history for ticket allocation
 * agreement (migration 057, Operations/Helpdesk only — never PM allocation).
 * Table: hd_ticket_allocation_proposals
 *
 * One row per proposal or counter-proposal. The latest 'pending' row for a
 * ticket is the one awaiting a response; everything before it is 'accepted',
 * 'rejected', or 'superseded' (replaced by a newer proposal before anyone
 * responded to it).
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const VALID_ROLES = Object.freeze(['manager', 'employee']);
const VALID_STATUSES = Object.freeze(['pending', 'accepted', 'rejected', 'superseded']);

const HdTicketAllocationProposal = sequelize.define('HdTicketAllocationProposal', {
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
  proposedByUserId: {
    type:      DataTypes.STRING(36),
    allowNull: false,
    field:     'proposed_by_user_id',
  },
  proposedByRole: {
    type:      DataTypes.STRING(10),
    allowNull: false,
    field:     'proposed_by_role',
    validate:  { isIn: { args: [VALID_ROLES], msg: `proposedByRole must be one of: ${VALID_ROLES.join(', ')}` } },
  },
  totalHours: {
    type:      DataTypes.DECIMAL(6, 1),
    allowNull: false,
    field:     'total_hours',
  },
  allocationFrom: {
    type:      DataTypes.DATEONLY,
    allowNull: false,
    field:     'allocation_from',
  },
  allocationTo: {
    type:      DataTypes.DATEONLY,
    allowNull: false,
    field:     'allocation_to',
  },
  status: {
    type:         DataTypes.STRING(20),
    allowNull:    false,
    defaultValue: 'pending',
    field:        'status',
    validate:     { isIn: { args: [VALID_STATUSES], msg: `status must be one of: ${VALID_STATUSES.join(', ')}` } },
  },
  respondedByUserId: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'responded_by_user_id',
  },
  respondedAt: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'responded_at',
  },
}, {
  tableName:   'hd_ticket_allocation_proposals',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   'updated_at',
});

HdTicketAllocationProposal.VALID_ROLES = VALID_ROLES;
HdTicketAllocationProposal.VALID_STATUSES = VALID_STATUSES;

module.exports = HdTicketAllocationProposal;
