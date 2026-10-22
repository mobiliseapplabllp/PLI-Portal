const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Admin assigns exactly one approver per department (any user). No row for a
// department = falls back to admin — see kpiDefinitionApproval.service.js.
const KpiDefinitionApprover = sequelize.define(
  'KpiDefinitionApprover',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    departmentId: { type: DataTypes.UUID, allowNull: false, unique: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    assignedById: { type: DataTypes.UUID, allowNull: true },
    assignedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  },
  { tableName: 'kpi_definition_approvers' }
);

module.exports = KpiDefinitionApprover;
