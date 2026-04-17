const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');

const KpiTemplate = sequelize.define(
  'KpiTemplate',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(512), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    category: {
      type: DataTypes.ENUM(...KPI_CATEGORIES),
      defaultValue: 'Other',
    },
    unit: {
      type: DataTypes.ENUM(...KPI_UNITS),
      defaultValue: 'Number',
    },
    defaultWeightage: { type: DataTypes.INTEGER, allowNull: true },
    defaultTargetValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    defaultThresholdValue: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    defaultStretchTarget: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'kpi_templates' }
);

module.exports = KpiTemplate;
