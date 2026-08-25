const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmRaidItem = sequelize.define(
  'PmRaidItem',
  {
    id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    type: {
      type: DataTypes.ENUM('Risk', 'Assumption', 'Issue', 'Dependency'),
      defaultValue: 'Risk',
    },
    title:       { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    impact: {
      type: DataTypes.ENUM('High', 'Medium', 'Low'),
      defaultValue: 'Medium',
    },
    probability: {
      type: DataTypes.ENUM('High', 'Medium', 'Low'),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('Open', 'In Progress', 'Closed', 'Deferred'),
      defaultValue: 'Open',
    },
    owner:          { type: DataTypes.STRING(255), allowNull: true },
    ownerId:        { type: DataTypes.UUID, allowNull: true },
    raisedDate:     { type: DataTypes.DATEONLY, allowNull: true },
    targetDate:     { type: DataTypes.DATEONLY, allowNull: true },
    closedDate:     { type: DataTypes.DATEONLY, allowNull: true },
    mitigationPlan: { type: DataTypes.TEXT, allowNull: true },
    createdById:    { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'pm_raid_items' }
);

module.exports = PmRaidItem;
