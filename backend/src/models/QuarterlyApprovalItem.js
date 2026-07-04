const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { KPI_SUBMISSION_VALUES } = require('../config/constants');

const QuarterlyApprovalItem = sequelize.define(
  'QuarterlyApprovalItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    quarterlyApprovalId: { type: DataTypes.UUID, allowNull: false },
    kpiPlanItemId: { type: DataTypes.UUID, allowNull: true },
    // Denormalised for display (won't change even if plan item is later edited)
    kpiTitle: { type: DataTypes.STRING(512), allowNull: false },
    monthlyWeightage: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    // Max quarterly credit this item can earn
    quarterlyWeightage: { type: DataTypes.DECIMAL(10, 2), allowNull: false },

    // KPI head for tab grouping (denormalised from KpiPlanItem)
    kpiHead: { type: DataTypes.STRING(64), allowNull: true },

    // Three month references (month numbers, e.g. 4, 5, 6 for Q1)
    month1: { type: DataTypes.INTEGER, allowNull: false },
    month2: { type: DataTypes.INTEGER, allowNull: false },
    month3: { type: DataTypes.INTEGER, allowNull: false },

    // Manager's authoritative status for each month
    month1_managerStatus: { type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES), allowNull: true },
    month2_managerStatus: { type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES), allowNull: true },
    month3_managerStatus: { type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES), allowNull: true },

    // Legacy numeric values (kept for backward compat): Exceeds=+1, Meets=0, Below=-1
    month1_numeric: { type: DataTypes.TINYINT, allowNull: true },
    month2_numeric: { type: DataTypes.TINYINT, allowNull: true },
    month3_numeric: { type: DataTypes.TINYINT, allowNull: true },

    // Legacy sum of 3 numerics (kept for backward compat)
    quarterlyNumericSum: { type: DataTypes.TINYINT, allowNull: true },

    // Auto-calculation flag: true if calculatedQuarterlyActual >= 0
    isAutoCalculated: { type: DataTypes.BOOLEAN, defaultValue: false },

    // Multiplier-based actual contributions per month (system-computed, never edited after creation)
    month1_actual: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
    month2_actual: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
    month3_actual: { type: DataTypes.DECIMAL(10, 4), allowNull: true },

    // Sum of 3 month actuals — preserved for record, never edited after creation
    calculatedQuarterlyActual: { type: DataTypes.DECIMAL(10, 4), allowNull: true },

    // Final Approver's decision per item
    finalStatus: { type: DataTypes.ENUM(...KPI_SUBMISSION_VALUES), allowNull: true },
    // FA's final entered value — separate from calculated, no cap, FA has full authority
    quarterlyAchievedWeightage: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    finalComment: { type: DataTypes.TEXT, allowNull: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'quarterly_approval_items',
  }
);

module.exports = QuarterlyApprovalItem;
