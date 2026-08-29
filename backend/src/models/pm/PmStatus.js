const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmStatus = sequelize.define(
  'PmStatus',
  {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:      { type: DataTypes.STRING(100), allowNull: false, unique: true },
    color:     { type: DataTypes.STRING(20), defaultValue: '#6B7280' },
    isActive:  { type: DataTypes.BOOLEAN, defaultValue: true },
    isSystem:  { type: DataTypes.BOOLEAN, defaultValue: false },
    sortOrder:       { type: DataTypes.INTEGER, defaultValue: 0 },
    forProject:      { type: DataTypes.BOOLEAN, defaultValue: true },
    forMilestone:    { type: DataTypes.BOOLEAN, defaultValue: true },
    forSubMilestone: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { tableName: 'pm_statuses' }
);

module.exports = PmStatus;
