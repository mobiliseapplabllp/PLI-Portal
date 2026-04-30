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
      type: DataTypes.ENUM(
        'draft', 'assigned', 'commitment_submitted', 'commitment_approved',
        'employee_submitted', 'manager_reviewed',
        'final_reviewed', 'final_approved', 'locked'
      ),
      defaultValue: KPI_STATUS.DRAFT,
    },
    // Reason stored when manager rejects a commitment
    commitmentRejectionComment: { type: DataTypes.TEXT, allowNull: true },
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

    // ── Attachments stored as BLOBs (employee self-review + manager review) ──
    employeeAttachmentBlob: { type: DataTypes.BLOB('long'), allowNull: true },
    employeeAttachmentName: { type: DataTypes.STRING(255), allowNull: true },
    employeeAttachmentMime: { type: DataTypes.STRING(128), allowNull: true },
    managerAttachmentBlob: { type: DataTypes.BLOB('long'), allowNull: true },
    managerAttachmentName: { type: DataTypes.STRING(255), allowNull: true },
    managerAttachmentMime: { type: DataTypes.STRING(128), allowNull: true },
  },
  {
    tableName: 'kpi_assignments',
    indexes: [{ unique: true, fields: ['employeeId', 'financialYear', 'month'] }],
  }
);

module.exports = KpiAssignment;
