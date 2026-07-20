const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ClientEmployee = sequelize.define(
  'ClientEmployee',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    clientOrganisationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    mobileNo: { type: DataTypes.STRING(20), allowNull: true },
    designation: { type: DataTypes.STRING(100), allowNull: true },
    department: { type: DataTypes.STRING(100), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    tableName: 'client_employees',
    indexes: [{ unique: true, fields: ['clientOrganisationId', 'email'] }],
  }
);

module.exports = ClientEmployee;
