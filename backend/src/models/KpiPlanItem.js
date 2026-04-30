const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { KPI_CATEGORIES, KPI_UNITS, KPI_HEADS, KPI_ASSIGNED_TO } = require('../config/constants');

const KpiPlanItem = sequelize.define(
  'KpiPlanItem',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    kpiPlanId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    // KPI head / tab this item belongs to
    kpiHead: {
      type: DataTypes.ENUM(...KPI_HEADS),
      allowNull: false,
      defaultValue: 'Performance',
    },
    // Whether this KPI is assigned to a leader or team member
    assignedTo: {
      type: DataTypes.ENUM(...KPI_ASSIGNED_TO),
      allowNull: false,
      defaultValue: 'team_member',
    },
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
    // Item weightage within the plan (0–100)
    monthlyWeightage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    targetValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    thresholdValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    stretchTarget: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: 'kpi_plan_items',
  }
);

module.exports = KpiPlanItem;
