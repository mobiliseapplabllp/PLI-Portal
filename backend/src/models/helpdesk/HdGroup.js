const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdGroup = sequelize.define('HdGroup', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:             { type: DataTypes.STRING(120), allowNull: false },
  managerId:        { type: DataTypes.STRING(36), allowNull: true, field: 'manager_id' },
  enableApprovals:  { type: DataTypes.BOOLEAN, defaultValue: false, field: 'enable_approvals' },
  enableSla:        { type: DataTypes.BOOLEAN, defaultValue: false, field: 'enable_sla' },
}, {
  tableName: 'hd_groups',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = HdGroup;
