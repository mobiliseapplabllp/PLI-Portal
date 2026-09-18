const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

/**
 * One allocation PERIOD of a project member (migration 045): hours/day over
 * fromDate..toDate. A member owns N non-overlapping segments; the legacy
 * columns on pm_project_members are a mirrored summary of them
 * (allocation.service.mirrorMemberSummary) and never the source of truth.
 */
const AllocationSegment = sequelize.define('AllocationSegment', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  memberId:   { type: DataTypes.CHAR(36), allowNull: false },   // FK → pm_project_members ON DELETE CASCADE
  projectId:  { type: DataTypes.CHAR(36), allowNull: false },   // denormalised from the member
  userId:     { type: DataTypes.CHAR(36), allowNull: false },   // denormalised from the member
  fromDate:   { type: DataTypes.DATEONLY, allowNull: false },
  toDate:     { type: DataTypes.DATEONLY, allowNull: false },
  allocationMode:       { type: DataTypes.ENUM('per_day', 'total'), allowNull: false, defaultValue: 'per_day' },
  hoursPerDay:          { type: DataTypes.DECIMAL(3, 1), allowNull: false },
  allocationTotalHours: { type: DataTypes.DECIMAL(6, 1), allowNull: true },
  hoursConfirmed:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // 'pending' segments never count towards capacity; 'approved' count with their (over-cap) hours
  exceptionStatus:      { type: DataTypes.ENUM('none', 'pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'none' },
  exceptionApprovalId:  { type: DataTypes.CHAR(36), allowNull: true },
  note:        { type: DataTypes.STRING(255), allowNull: true },
  createdById: { type: DataTypes.CHAR(36), allowNull: true },
}, {
  tableName: 'pm_allocation_segments',
  timestamps: true,
});

module.exports = AllocationSegment;
