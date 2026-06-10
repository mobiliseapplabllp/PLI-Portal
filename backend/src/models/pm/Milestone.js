const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { PM_MILESTONE_STATUS } = require('../../config/constants');

const Milestone = sequelize.define(
  'Milestone',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    accountableUserId: { type: DataTypes.UUID, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(PM_MILESTONE_STATUS)),
      defaultValue: PM_MILESTONE_STATUS.NOT_STARTED,
    },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    completionPercentage: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'pm_milestones' }
);

module.exports = Milestone;
