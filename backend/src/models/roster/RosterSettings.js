const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

// Singleton (id = 1), same pattern as PmSettings. Everything the rostering
// module used to hardcode — mail schedule, the 5th-Saturday rule, how far ahead
// weeks are created, and the coverage floor — lives here.
const RosterSettings = sequelize.define(
  'RosterSettings',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },

    digestEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    digestDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 }, // Wed
    digestTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '10:30' },

    reminderEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    reminderDay: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 }, // Fri
    reminderTime: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '10:00' },

    // A month with five Saturdays is all-hands. Switch off for companies that
    // alternate straight through regardless.
    fifthSaturdayWorking: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    autoCreateEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    autoCreateWeeksAhead: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },

    // Refuse to publish a week where fewer than this % of the team is Working.
    // 0 disables the check.
    minCoveragePercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'roster_settings' }
);

module.exports = RosterSettings;
