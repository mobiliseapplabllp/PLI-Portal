const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { KPI_CATEGORIES, KPI_UNITS, KPI_SUBMISSION_VALUES } = require('../config/constants');

const KpiItem = sequelize.define(
  'KpiItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    kpiAssignmentId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(512), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    category: {
      type: DataTypes.ENUM(...KPI_CATEGORIES),
      defaultValue: 'Other',
    },
    unit: {
      type: DataTypes.ENUM(...KPI_UNITS),
      defaultValue: 'Number',
    },
    // monthlyWeightage (stored as 'weightage' for backward compat with existing data)
    weightage: { type: DataTypes.INTEGER, allowNull: false },
    // quarterlyWeightage: max quarterly credit this item can earn in the quarter approval
    quarterlyWeightage: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    targetValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    thresholdValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    stretchTarget: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },

    // ── LEGACY fields (kept for backward compat with pre-migration data) ──────
    employeeValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    employeeAttachment: { type: DataTypes.STRING(1024), allowNull: true },
    employeeSubmittedAt: { type: DataTypes.DATE, allowNull: true },
    managerValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    managerScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    managerReviewedAt: { type: DataTypes.DATE, allowNull: true },
    finalValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    finalScore: { type: DataTypes.DECIMAL(6, 2), allowNull: true },
    finalComment: { type: DataTypes.TEXT, allowNull: true },
    finalReviewedAt: { type: DataTypes.DATE, allowNull: true },
    itemStatus: { type: DataTypes.STRING(64), defaultValue: 'draft' },

    // ── NEW: Commitment fields ────────────────────────────────────────────────
    employeeCommitmentStatus: {
      type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES),
      allowNull: true,
    },
    employeeCommitmentComment: { type: DataTypes.TEXT, allowNull: true },
    committedAt: { type: DataTypes.DATE, allowNull: true },

    // ── NEW: Achievement fields ───────────────────────────────────────────────
    employeeStatus: {
      type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES),
      allowNull: true,
    },
    employeeComment: { type: DataTypes.TEXT, allowNull: true },

    // ── NEW: Manager review fields ────────────────────────────────────────────
    managerStatus: {
      type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES),
      allowNull: true,
    },
    managerComment: { type: DataTypes.TEXT, allowNull: true },
    // Stored numeric: Exceeds=+1, Meets=0, Below=-1 — used in quarterly auto-calc
    managerMonthlyNumeric: { type: DataTypes.TINYINT, allowNull: true },

    // ── NEW: Final Approver (monthly) fields ──────────────────────────────────
    finalApproverStatus: {
      type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES),
      allowNull: true,
    },
    finalApproverValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    // Monthly credit given (0 to this item's weightage)
    finalApproverAchievedWeightage: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    finalApproverComment: { type: DataTypes.TEXT, allowNull: true },
    finalApprovedAt: { type: DataTypes.DATE, allowNull: true },
    finalApprovedById: { type: DataTypes.UUID, allowNull: true },

    // ── NEW: Back-reference to source KpiPlanItem ─────────────────────────────
    kpiPlanItemId: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'kpi_items' }
);

module.exports = KpiItem;
