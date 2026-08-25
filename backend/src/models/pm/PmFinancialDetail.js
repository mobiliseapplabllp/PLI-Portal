const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const PmFinancialDetail = sequelize.define(
  'PmFinancialDetail',
  {
    id:             { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId:      { type: DataTypes.UUID, allowNull: false, unique: true },
    currency:       { type: DataTypes.STRING(10), defaultValue: 'INR' },
    budgetAmount:   { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    actualCost:     { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    invoicedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    paymentTerms:   { type: DataTypes.TEXT, allowNull: true },
    notes:          { type: DataTypes.TEXT, allowNull: true },
    updatedById:    { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'pm_financial_details' }
);

module.exports = PmFinancialDetail;
