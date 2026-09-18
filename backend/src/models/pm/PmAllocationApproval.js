const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmAllocationApproval = sequelize.define('PmAllocationApproval', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  // NULL on a TICKET exception (migration 047) — it belongs to no project.
  projectId:      { type: DataTypes.CHAR(36), allowNull: true },
  userId:         { type: DataTypes.CHAR(36), allowNull: false },
  requestedById:  { type: DataTypes.CHAR(36), allowNull: false },
  approvedById:   { type: DataTypes.CHAR(36), allowNull: true },
  // DB column is still NOT NULL (migration 027); every write sets both fields.
  allocationPct:  { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
  hoursPerDay:    { type: DataTypes.DECIMAL(3, 1), allowNull: true },
  // What the requester typed: per_day (hoursPerDay) or total (allocationTotalHours ÷ working days)
  allocationMode:       { type: DataTypes.ENUM('per_day', 'total'), allowNull: false, defaultValue: 'per_day' },
  allocationTotalHours: { type: DataTypes.DECIMAL(6, 1), allowNull: true },
  fromDate:       { type: DataTypes.DATEONLY, allowNull: false },
  toDate:         { type: DataTypes.DATEONLY, allowNull: false },
  status:         { type: DataTypes.ENUM('pending','approved','rejected'), allowNull: false, defaultValue: 'pending' },
  reason:         { type: DataTypes.TEXT, allowNull: false },
  approverNote:   { type: DataTypes.TEXT, allowNull: true },
  // Migration 044 — 'capacity_release' asks another project to free hours (legacy flow);
  // 'exception' asks an approver to allow an over-capacity allocation.
  requestType:      { type: DataTypes.ENUM('capacity_release', 'exception'), allowNull: false, defaultValue: 'capacity_release' },
  overloadHours:    { type: DataTypes.DECIMAL(4, 1), allowNull: true },
  memberId:         { type: DataTypes.CHAR(36), allowNull: true },
  previousSnapshot: { type: DataTypes.JSON, allowNull: true },
  // Migration 045 — the allocation SEGMENT an exception request is about
  segmentId:        { type: DataTypes.CHAR(36), allowNull: true },
  // Migration 047 — the HELPDESK TICKET an exception request is about (hd_tickets.id
  // is an INT). Set ⇔ projectId/memberId/segmentId are NULL; a PENDING row here means
  // that ticket's allocation is not counted towards capacity (D1 for tickets).
  ticketId:         { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'pm_allocation_approvals',
  timestamps: true,
});

module.exports = PmAllocationApproval;
