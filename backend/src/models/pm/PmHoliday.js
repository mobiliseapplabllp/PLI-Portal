const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

/**
 * Public holiday list (Phase 1 — Working Calendar).
 * Non-optional holidays remove a working day from capacity; optional
 * (restricted) holidays are informational only.
 */
const PmHoliday = sequelize.define(
  'PmHoliday',
  {
    id:          { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    date:        { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    name:        { type: DataTypes.STRING(150), allowNull: false },
    year:        { type: DataTypes.SMALLINT, allowNull: false },
    isOptional:  { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdById: { type: DataTypes.CHAR(36), allowNull: true },
  },
  { tableName: 'pm_holidays', timestamps: true }
);

module.exports = PmHoliday;
