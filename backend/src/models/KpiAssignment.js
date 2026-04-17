const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { KPI_STATUS } = require('../config/constants');

const KpiAssignment = sequelize.define(
  'KpiAssignment',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    quarter: { type: DataTypes.ENUM('Q1', 'Q2', 'Q3', 'Q4'), allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    managerId: { type: DataTypes.UUID, allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
    status: {
      // Hardcoded ENUM string to match DB column after migration script.
      type: DataTypes.ENUM(
        'draft', 'assigned', 'commitment_submitted',
        'employee_submitted', 'manager_reviewed',
        'final_reviewed', 'final_approved', 'locked'
      ),
      defaultValue: KPI_STATUS.DRAFT,
    },
    totalWeightage: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    isLocked: { type: DataTypes.BOOLEAN, defaultValue: false },
    lockedAt: { type: DataTypes.DATE, allowNull: true },
    lockedById: { type: DataTypes.UUID, allowNull: true },
    committedAt: { type: DataTypes.DATE, allowNull: true },
    employeeSubmittedAt: { type: DataTypes.DATE, allowNull: true },
    managerReviewedAt: { type: DataTypes.DATE, allowNull: true },
    finalReviewedAt: { type: DataTypes.DATE, allowNull: true },   // legacy
    finalApprovedAt: { type: DataTypes.DATE, allowNull: true },
    monthlyWeightedScore: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
  },
  {
    tableName: 'kpi_assignments',
    indexes: [{ unique: true, fields: ['employeeId', 'financialYear', 'month'] }],
  }
);

module.exports = KpiAssignment;
