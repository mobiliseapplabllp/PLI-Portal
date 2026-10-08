const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmMilestoneTemplate = sequelize.define(
  'PmMilestoneTemplate',
  {
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // projectType is the type's NAME, kept as a display copy for everything that
    // reads it. projectTypeId is the real reference (FK → pm_project_types.id,
    // migration 052); the rename endpoint keeps the name in sync from it, so a
    // renamed type never loses its templates again.
    projectType:   { type: DataTypes.STRING(100), allowNull: false },
    projectTypeId: { type: DataTypes.INTEGER, allowNull: true },
    name:        { type: DataTypes.STRING(255), allowNull: false },
    minPct:      { type: DataTypes.DECIMAL(5, 2), defaultValue: 0.00 },
    maxPct:      { type: DataTypes.DECIMAL(5, 2), defaultValue: 100.00 },
    sortOrder:   { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive:    { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { tableName: 'pm_milestone_templates' }
);

module.exports = PmMilestoneTemplate;
