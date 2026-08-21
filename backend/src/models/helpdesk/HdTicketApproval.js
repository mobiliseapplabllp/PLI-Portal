/**
 * HdTicketApproval — Email-token based one-click approval workflow.
 * Table: hd_ticket_approvals
 *
 * Flow:
 *   1. Agent calls POST /helpdesk/approvals/:ticketId/request
 *   2. Server creates record with unique crypto token, sends email to approver
 *   3. Approver clicks link → GET /helpdesk/approvals/respond?token=X&action=approve
 *   4. Server validates token (single-use), updates status, nulls token
 *
 * The token column is UNIQUE to prevent race conditions on concurrent clicks.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

/** @enum {string} */
const APPROVAL_STATUS = Object.freeze({
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const HdTicketApproval = sequelize.define('HdTicketApproval', {
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
  // PLI Portal user UUIDs
  approverId: {
    type:      DataTypes.STRING(36),
    allowNull: false,
    field:     'approver_id',
  },
  requestedBy: {
    type:      DataTypes.STRING(36),
    allowNull: false,
    field:     'requested_by',
  },
  token: {
    type:      DataTypes.STRING(128),
    allowNull: false,
    unique:    true,
    comment:   'Single-use crypto token sent in email link',
  },
  status: {
    type:         DataTypes.ENUM(...Object.values(APPROVAL_STATUS)),
    allowNull:    false,
    defaultValue: APPROVAL_STATUS.PENDING,
  },
  notes: {
    type:      DataTypes.TEXT,
    allowNull: true,
    comment:   'Optional comment from approver',
  },
  approvedAt: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'approved_at',
  },
}, {
  tableName:  'hd_ticket_approvals',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   false,
});

HdTicketApproval.APPROVAL_STATUS = APPROVAL_STATUS;

module.exports = HdTicketApproval;
