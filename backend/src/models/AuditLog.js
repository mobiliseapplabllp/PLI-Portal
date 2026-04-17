const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entityType: { type: DataTypes.STRING(64), allowNull: false },
    entityId: { type: DataTypes.UUID, allowNull: false },
    action: { type: DataTypes.STRING(64), allowNull: false },
    changedById: { type: DataTypes.UUID, allowNull: false },
    oldValue: { type: DataTypes.JSON, allowNull: true },
    newValue: { type: DataTypes.JSON, allowNull: true },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
  },
  { tableName: 'audit_logs' }
);

module.exports = AuditLog;
