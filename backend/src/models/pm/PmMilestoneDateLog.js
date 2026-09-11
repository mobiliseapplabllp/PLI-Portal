const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmMilestoneDateLog = sequelize.define('PmMilestoneDateLog', {
  id:           { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  milestoneId:  { type: DataTypes.CHAR(36), allowNull: false },
  changedById:  { type: DataTypes.CHAR(36), allowNull: false },
  // Date-change events carry old/new dates. Lock events (plannedDatesUnlock /
  // plannedDatesLock) carry null dates — the event type, reason, who and when
  // are the audit record.
  field:        { type: DataTypes.ENUM(
                    'plannedStartDate','plannedEndDate','actualStartDate','actualEndDate',
                    'plannedDatesUnlock','plannedDatesLock'
                  ), allowNull: false },
  oldValue:     { type: DataTypes.DATEONLY, allowNull: true },
  newValue:     { type: DataTypes.DATEONLY, allowNull: true },
  reason:       { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'pm_milestone_date_logs',
  timestamps: true,
  updatedAt: false,
});

module.exports = PmMilestoneDateLog;
