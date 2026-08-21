const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { ROSTER_COMP_OFF_STATUS } = require('../../config/constants');

// Compensatory-off credit — earned automatically when a published Off Saturday is
// changed to Working per company work requirement. Cancelled if the change is undone.
const RosterCompOff = sequelize.define(
  'RosterCompOff',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    rosterEntryId: { type: DataTypes.UUID, allowNull: true },
    earnedDate: { type: DataTypes.DATEONLY, allowNull: false }, // the Saturday worked
    reason: { type: DataTypes.STRING(512), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(ROSTER_COMP_OFF_STATUS)),
      allowNull: false,
      defaultValue: ROSTER_COMP_OFF_STATUS.EARNED,
    },
    availedDate: { type: DataTypes.DATEONLY, allowNull: true },
    grantedById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'roster_comp_offs' }
);

module.exports = RosterCompOff;
