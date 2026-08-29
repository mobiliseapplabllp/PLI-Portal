const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmSettings = sequelize.define(
  'PmSettings',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
    allowedCreatorRoles: {
      type: DataTypes.JSON,
      defaultValue: ['admin', 'manager', 'senior_manager'],
    },
    dailyReportTime: { type: DataTypes.STRING(8), defaultValue: '09:00' },
    dailyReportEnabled: { type: DataTypes.BOOLEAN, defaultValue: true },
    reportCcEmails: { type: DataTypes.JSON, defaultValue: ['veervikram.singh@mobilise.co.in'] },
    consolidatedReport: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailAlertOnProjectCreate: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailAlertOnMilestoneComplete: { type: DataTypes.BOOLEAN, defaultValue: false },
    emailAlertOnRaidRaised: { type: DataTypes.BOOLEAN, defaultValue: false },
    helpdeskDailyReportEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    helpdeskDailyReportTime: { type: DataTypes.STRING(8), defaultValue: '09:00' },
  },
  { tableName: 'pm_settings' }
);

module.exports = PmSettings;
