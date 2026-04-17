const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');

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
    // Monthly weightage: this item's contribution to the monthly score (0–100)
    // Sum across all items in a plan must equal 100 before publishing.
    monthlyWeightage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    // Quarterly weightage cap: max quarterly credit this item can earn.
    // Informational — no 100% constraint on sum.
    quarterlyWeightage: {
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
