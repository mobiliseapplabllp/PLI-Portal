const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

// One row per Saturday. Entries hang off this; publish state lives per-entry so
// each manager can publish their own team independently.
const RosterWeek = sequelize.define(
  'RosterWeek',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    saturdayDate: { type: DataTypes.DATEONLY, allowNull: false, unique: 'uq_roster_week_date' },
    label: { type: DataTypes.STRING(64), allowNull: true }, // e.g. "WK 4 (22 Aug 2026)"
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'roster_weeks' }
);

module.exports = RosterWeek;
