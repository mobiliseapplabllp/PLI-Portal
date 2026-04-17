const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PliRule = sequelize.define(
  'PliRule',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    quarter: { type: DataTypes.ENUM('Q1', 'Q2', 'Q3', 'Q4'), allowNull: false },
    remarks: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'pli_rules',
    indexes: [{ unique: true, fields: ['financialYear', 'quarter'] }],
  }
);

module.exports = PliRule;
