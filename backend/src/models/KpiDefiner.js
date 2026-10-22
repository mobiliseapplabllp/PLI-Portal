const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Admin grants a specific user KPI-definition "Definer" rights, auto-scoped
// to that user's OWN department (never admin-picked) — see kpiPlan.service.js
// assertCanDefine() and kpiDefinitionApproval.service.js.
const KpiDefiner = sequelize.define(
  'KpiDefiner',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true },
    departmentId: { type: DataTypes.UUID, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
    grantedById: { type: DataTypes.UUID, allowNull: true },
    grantedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'kpi_definers' }
);

module.exports = KpiDefiner;
