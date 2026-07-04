const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ScoringConfig = sequelize.define(
  'ScoringConfig',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    quarter: { type: DataTypes.ENUM('Q1', 'Q2', 'Q3', 'Q4'), allowNull: false },
    meetsMultiplier:   { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 1.0 },
    belowMultiplier:   { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: -0.5 },
    exceedsMultiplier: { type: DataTypes.DECIMAL(6, 3), allowNull: false, defaultValue: 1.5 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'scoring_configs',
    indexes: [
      {
        unique: true,
        fields: ['financialYear', 'quarter'],
        name: 'uq_scoring_config_fy_q',
      },
    ],
  }
);

module.exports = ScoringConfig;
