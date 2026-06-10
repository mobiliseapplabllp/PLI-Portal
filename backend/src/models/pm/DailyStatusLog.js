const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { PM_OVERALL_STATUS } = require('../../config/constants');

const DailyStatusLog = sequelize.define(
  'DailyStatusLog',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    reportDate: { type: DataTypes.DATEONLY, allowNull: false },
    overallStatus: {
      type: DataTypes.ENUM(...Object.values(PM_OVERALL_STATUS)),
      defaultValue: PM_OVERALL_STATUS.ON_TRACK,
    },
    completedTasks: { type: DataTypes.TEXT, allowNull: true },
    ongoingTasks: { type: DataTypes.TEXT, allowNull: true },
    blockers: { type: DataTypes.TEXT, allowNull: true },
    upcomingWork: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    generatedBy: {
      type: DataTypes.ENUM('auto', 'manual'),
      defaultValue: 'manual',
    },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'pm_daily_status_logs',
    indexes: [{ unique: true, fields: ['projectId', 'reportDate'] }],
  }
);

module.exports = DailyStatusLog;
