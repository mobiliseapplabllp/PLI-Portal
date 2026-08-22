const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { ROSTER_STATUS } = require('../../config/constants');

// One row per employee per Saturday.
// plannedStatus  = the original roster (auto-alternated, manager-adjustable pre-publish)
// finalStatus    = after "changes as per company work requirement" (post-publish edits)
const RosterEntry = sequelize.define(
  'RosterEntry',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    rosterWeekId: { type: DataTypes.UUID, allowNull: false },
    employeeId: { type: DataTypes.UUID, allowNull: false },
    managerId: { type: DataTypes.UUID, allowNull: true }, // employee's manager snapshot at creation
    plannedStatus: {
      type: DataTypes.ENUM(...Object.values(ROSTER_STATUS)),
      allowNull: false,
      defaultValue: ROSTER_STATUS.WORKING,
    },
    finalStatus: {
      type: DataTypes.ENUM(...Object.values(ROSTER_STATUS)),
      allowNull: false,
      defaultValue: ROSTER_STATUS.WORKING,
    },
    // Why this entry is Off, when it isn't simple alternation. Set at generation
    // and refreshed while the week is still a draft.
    onLeave: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isHoliday: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    changeReason: { type: DataTypes.STRING(512), allowNull: true },
    changedById: { type: DataTypes.UUID, allowNull: true },
    changedAt: { type: DataTypes.DATE, allowNull: true },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
    publishedById: { type: DataTypes.UUID, allowNull: true },
    emailSentAt: { type: DataTypes.DATE, allowNull: true },
    reminderSentAt: { type: DataTypes.DATE, allowNull: true },
    digestSentAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'roster_entries',
    indexes: [{ unique: true, fields: ['rosterWeekId', 'employeeId'], name: 'uq_roster_week_employee' }],
  }
);

module.exports = RosterEntry;
