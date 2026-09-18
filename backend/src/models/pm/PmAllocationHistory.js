const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HISTORY_ACTIONS = [
  'add', 'update', 'remove', 'confirm',
  'exception_request', 'exception_approve', 'exception_reject', 'exception_cancel',
  'release',
];

/**
 * Audit trail of every allocation segment / exception write (migration 045).
 * Written only through allocation.service.logAllocation. Append-only — no updatedAt.
 *
 * A PROJECT row carries projectId + memberId (+ segmentId). A helpdesk TICKET
 * allocation exception carries ticketId instead, with projectId / memberId /
 * segmentId NULL — migration 048 relaxed those columns and added ticketId, so a
 * ticket decision is audited exactly like a project one.
 */
const PmAllocationHistory = sequelize.define('PmAllocationHistory', {
  id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  projectId: { type: DataTypes.CHAR(36), allowNull: true },
  memberId:  { type: DataTypes.CHAR(36), allowNull: true },
  segmentId: { type: DataTypes.CHAR(36), allowNull: true },
  ticketId:  { type: DataTypes.INTEGER,  allowNull: true },    // hd_tickets.id (INT), never both
  userId:    { type: DataTypes.CHAR(36), allowNull: false },   // the allocated person
  action:    { type: DataTypes.ENUM(...HISTORY_ACTIONS), allowNull: false },
  before:    { type: DataTypes.JSON, allowNull: true },
  after:     { type: DataTypes.JSON, allowNull: true },
  byId:      { type: DataTypes.CHAR(36), allowNull: true },    // who made the change
  note:      { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'pm_allocation_history',
  timestamps: true,
  updatedAt: false,
});

PmAllocationHistory.HISTORY_ACTIONS = HISTORY_ACTIONS;

module.exports = PmAllocationHistory;
