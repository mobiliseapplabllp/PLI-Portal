const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ClientOrganisation = sequelize.define(
  'ClientOrganisation',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    industry: { type: DataTypes.STRING(100), allowNull: true },
    managedById: { type: DataTypes.UUID, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'client_organisations',
  }
);

module.exports = ClientOrganisation;
