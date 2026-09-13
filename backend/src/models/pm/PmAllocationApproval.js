const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmAllocationApproval = sequelize.define('PmAllocationApproval', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  projectId:      { type: DataTypes.CHAR(36), allowNull: false },
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
}, {
  tableName: 'pm_allocation_approvals',
  timestamps: true,
});

module.exports = PmAllocationApproval;
