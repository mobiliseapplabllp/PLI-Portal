const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

// Company holidays. A Saturday falling on one is an off-day for everybody, and
// is skipped when computing the alternation baseline.
const RosterHoliday = sequelize.define(
  'RosterHoliday',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    holidayDate: { type: DataTypes.DATEONLY, allowNull: false, unique: 'uq_holiday_date' },
    name: { type: DataTypes.STRING(255), allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'roster_holidays' }
);

module.exports = RosterHoliday;
