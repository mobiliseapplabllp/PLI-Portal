const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { ROSTER_STATUS } = require('../../config/constants');

// Append-only history of every status change on a roster entry.
// RosterEntry itself keeps only the most recent change, so before this an
// employee could not see who moved their Saturday, or why, after a second edit.
const RosterEntryChange = sequelize.define(
  'RosterEntryChange',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    rosterEntryId: { type: DataTypes.UUID, allowNull: false },
    fromStatus: { type: DataTypes.ENUM(...Object.values(ROSTER_STATUS)), allowNull: true },
    toStatus: { type: DataTypes.ENUM(...Object.values(ROSTER_STATUS)), allowNull: false },
    reason: { type: DataTypes.STRING(512), allowNull: true },
    // manual | swap | bulk | leave | holiday | auto
    source: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'manual' },
    changedById: { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'roster_entry_changes' }
);

module.exports = RosterEntryChange;
