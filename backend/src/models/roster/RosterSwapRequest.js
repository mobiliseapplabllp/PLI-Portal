const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { ROSTER_SWAP_STATUS } = require('../../config/constants');

// Employee ⇄ employee Saturday swap for one week.
// Flow: requester creates (pending_peer) → colleague accepts (pending_manager)
//       → manager/admin approves (statuses swapped on both entries) or rejects.
const RosterSwapRequest = sequelize.define(
  'RosterSwapRequest',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    rosterWeekId: { type: DataTypes.UUID, allowNull: false },
    requesterId: { type: DataTypes.UUID, allowNull: false },
    targetId: { type: DataTypes.UUID, allowNull: false },
    requesterEntryId: { type: DataTypes.UUID, allowNull: false },
    targetEntryId: { type: DataTypes.UUID, allowNull: false },
    reason: { type: DataTypes.STRING(512), allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(ROSTER_SWAP_STATUS)),
      allowNull: false,
      defaultValue: ROSTER_SWAP_STATUS.PENDING_PEER,
    },
    peerAcceptedAt: { type: DataTypes.DATE, allowNull: true },
    decidedById: { type: DataTypes.UUID, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    decisionComment: { type: DataTypes.STRING(512), allowNull: true },
  },
  { tableName: 'roster_swap_requests' }
);

module.exports = RosterSwapRequest;
