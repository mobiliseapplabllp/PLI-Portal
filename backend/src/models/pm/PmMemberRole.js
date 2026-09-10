const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmMemberRole = sequelize.define(
  'PmMemberRole',
  {
    id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:      { type: DataTypes.STRING(100), allowNull: false, unique: true },
    isActive:  { type: DataTypes.BOOLEAN, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'pm_member_roles' }
);

module.exports = PmMemberRole;
