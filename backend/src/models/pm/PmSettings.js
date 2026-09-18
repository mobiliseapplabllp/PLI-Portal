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
    // Capacity per person per working day; allocation % is derived from this
    workingHoursPerDay: { type: DataTypes.DECIMAL(3, 1), allowNull: false, defaultValue: 8.0 },
    // Ordinals (1–5) of the Saturdays in a month that are working days, e.g. [2,4]
    workingSaturdays: { type: DataTypes.JSON, allowNull: true, defaultValue: [2, 4] },
    // Roles allowed to approve allocation exceptions (migration 044). Getter
    // normalises NULL / legacy string JSON to a non-empty array.
    exceptionApproverRoles: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: ['admin'],
      get() {
        let v = this.getDataValue('exceptionApproverRoles');
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = null; } }
        return Array.isArray(v) && v.length ? v.map(String) : ['admin'];
      },
    },
    // Hard cap on hours/day an exception may request; DECIMAL → number for callers
    exceptionMaxHoursPerDay: {
      type: DataTypes.DECIMAL(3, 1),
      allowNull: false,
      defaultValue: 12.0,
      get() { const v = Number(this.getDataValue('exceptionMaxHoursPerDay')); return Number.isFinite(v) && v > 0 ? v : 12; },
    },
  },
  { tableName: 'pm_settings' }
);

module.exports = PmSettings;
