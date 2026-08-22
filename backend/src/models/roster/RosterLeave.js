const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

// Per-employee leave range. Anyone on leave over a Saturday is rostered Off and
// excluded from the alternation baseline, so being away does not cost them
// their next turn off.
const RosterLeave = sequelize.define(
  'RosterLeave',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    fromDate: { type: DataTypes.DATEONLY, allowNull: false },
    toDate: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'roster_leaves' }
);

module.exports = RosterLeave;
