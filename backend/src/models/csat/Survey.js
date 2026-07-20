const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Survey = sequelize.define(
  'Survey',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    thankYouMessage: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft',
      allowNull: false,
    },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'surveys',
  }
);

module.exports = Survey;
