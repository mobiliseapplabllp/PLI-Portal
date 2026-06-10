const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ProjectMember = sequelize.define(
  'ProjectMember',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING(100), allowNull: true },
    responsibilities: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'pm_project_members',
    indexes: [{ unique: true, fields: ['projectId', 'userId'] }],
  }
);

module.exports = ProjectMember;
