const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmMilestoneTemplate = sequelize.define(
  'PmMilestoneTemplate',
  {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    projectType: { type: DataTypes.STRING(100), allowNull: false },
    name:        { type: DataTypes.STRING(255), allowNull: false },
    minPct:      { type: DataTypes.DECIMAL(5, 2), defaultValue: 0.00 },
    maxPct:      { type: DataTypes.DECIMAL(5, 2), defaultValue: 100.00 },
    sortOrder:   { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive:    { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { tableName: 'pm_milestone_templates' }
);

module.exports = PmMilestoneTemplate;
