const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PliSlab = sequelize.define(
  'PliSlab',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    pliRuleId: { type: DataTypes.UUID, allowNull: false },
    minScore: { type: DataTypes.DECIMAL(10, 4), allowNull: false },
    maxScore: { type: DataTypes.DECIMAL(10, 4), allowNull: false },
    payoutPercentage: { type: DataTypes.DECIMAL(10, 4), allowNull: false },
    label: { type: DataTypes.STRING(255), allowNull: true },
  },
  { tableName: 'pli_slabs' }
);

module.exports = PliSlab;
