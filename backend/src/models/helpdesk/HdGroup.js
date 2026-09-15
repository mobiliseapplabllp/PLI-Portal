const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdGroup = sequelize.define('HdGroup', {
  id:               { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:             { type: DataTypes.STRING(120), allowNull: false },
  // users.id of the team manager — FK fk_hd_groups_manager (ON DELETE SET NULL) since migration 044.
  managerId:        { type: DataTypes.STRING(36), allowNull: true, field: 'manager_id' },
  // KPI departments.id this team is backed by. No FK (cross-module) — validated in group.controller.
  // Users whose users.departmentId matches are members of this group unless they carry an hd_group_id override.
  departmentId:     { type: DataTypes.STRING(36), allowNull: true, field: 'department_id' },
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
