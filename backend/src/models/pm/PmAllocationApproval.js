const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmAllocationApproval = sequelize.define('PmAllocationApproval', {
  id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  projectId:      { type: DataTypes.CHAR(36), allowNull: false },
  userId:         { type: DataTypes.CHAR(36), allowNull: false },
  requestedById:  { type: DataTypes.CHAR(36), allowNull: false },
  approvedById:   { type: DataTypes.CHAR(36), allowNull: true },
  allocationPct:  { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
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
