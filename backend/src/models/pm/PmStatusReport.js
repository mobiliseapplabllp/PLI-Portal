const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmStatusReport = sequelize.define(
  'PmStatusReport',
  {
    id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId:  { type: DataTypes.UUID, allowNull: false },
    reportDate: { type: DataTypes.DATEONLY, allowNull: false },
    period: {
      type: DataTypes.ENUM('Weekly', 'Fortnightly', 'Monthly', 'Ad-hoc'),
      defaultValue: 'Weekly',
    },
    ragStatus: {
      type: DataTypes.ENUM('Green', 'Amber', 'Red'),
      defaultValue: 'Green',
    },
    summary:     { type: DataTypes.TEXT, allowNull: true },
    risks:       { type: DataTypes.TEXT, allowNull: true },
    nextSteps:   { type: DataTypes.TEXT, allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'pm_status_reports' }
);

module.exports = PmStatusReport;
