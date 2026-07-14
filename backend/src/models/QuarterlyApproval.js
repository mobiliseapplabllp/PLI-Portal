const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuarterlyApproval = sequelize.define(
  'QuarterlyApproval',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    // Employee's department at time of approval (denormalised for audit trail)
    departmentId: { type: DataTypes.UUID, allowNull: true },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    quarter: { type: DataTypes.ENUM('Q1', 'Q2', 'Q3', 'Q4'), allowNull: false },
    finalApproverId: { type: DataTypes.UUID, allowNull: true },
    // System-computed reference score from manager statuses (never changes after creation)
    calculatedQuarterlyScore: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
    // FA's final score used for PLI payout = Σ(FA values) / Σ(3 × monthlyWt) × 100
    quarterlyScore: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    status: {
      type: DataTypes.ENUM('draft', 'approved'),
      defaultValue: 'draft',
    },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    // Snapshot of which scoring config was active when this QA was built (audit trail)
    scoringConfigId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'quarterly_approvals',
    indexes: [
      {
        unique: true,
        fields: ['employeeId', 'financialYear', 'quarter'],
        name: 'unique_employee_quarter_approval',
      },
    ],
  }
);

module.exports = QuarterlyApproval;
