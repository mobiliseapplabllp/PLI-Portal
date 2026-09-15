const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdProject = sequelize.define('HdProject', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:        { type: DataTypes.STRING(200), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  status:      { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'Active' },
  groupId:     { type: DataTypes.INTEGER, allowNull: true, field: 'group_id' },
  publicToken: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'public_token' },
  managerId:   { type: DataTypes.STRING(36), allowNull: true, field: 'manager_id' },
  // ONE PROJECT MASTER — soft link to pm_projects.id (no FK; app-enforced). NULL = legacy unlinked profile.
  pmProjectId: { type: DataTypes.STRING(36), allowNull: true, field: 'pm_project_id' },
}, {
  tableName: 'hd_projects',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = HdProject;
