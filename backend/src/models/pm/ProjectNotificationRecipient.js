const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ProjectNotificationRecipient = sequelize.define(
  'ProjectNotificationRecipient',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    externalEmail: { type: DataTypes.STRING(255), allowNull: true },
    label: { type: DataTypes.STRING(100), allowNull: true },
  },
  { tableName: 'pm_notification_recipients' }
);

module.exports = ProjectNotificationRecipient;
