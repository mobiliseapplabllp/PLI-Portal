const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { NOTIFICATION_TYPES } = require('../config/constants');

const typeValues = Object.values(NOTIFICATION_TYPES);

const Notification = sequelize.define(
  'Notification',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    recipientId: { type: DataTypes.UUID, allowNull: false },
    type: { type: DataTypes.ENUM(...typeValues), allowNull: false },
    title: { type: DataTypes.STRING(512), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: true },
    referenceType: {
      type: DataTypes.ENUM('kpi_assignment', 'appraisal_cycle', 'user'),
      allowNull: true,
    },
    referenceId: { type: DataTypes.UUID, allowNull: true },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { tableName: 'notifications' }
);

module.exports = Notification;
