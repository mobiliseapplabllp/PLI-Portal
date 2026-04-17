const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { QUARTER_MAP } = require('../config/constants');

const KpiPlan = sequelize.define(
  'KpiPlan',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    quarter: { type: DataTypes.ENUM('Q1', 'Q2', 'Q3', 'Q4'), allowNull: false },
    // scope: 'team' means this plan applies to a specific manager's team;
    //        'department' means it applies to all employees in a department.
    scope: {
      type: DataTypes.ENUM('team', 'department'),
      allowNull: false,
    },
    managerId: {
      type: DataTypes.UUID,
      allowNull: true, // set when scope = 'team'
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true, // set when scope = 'department'
    },
    // Running sum of all items' monthlyWeightage — must equal 100 before publishing
    totalMonthlyWeightage: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    // Running sum of all items' quarterlyWeightage — informational (no 100% constraint)
    totalQuarterlyWeightage: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'kpi_plans',
    indexes: [
      // One team plan per month
      {
        unique: true,
        fields: ['financialYear', 'month', 'managerId'],
        where: { managerId: { [require('sequelize').Op.ne]: null } },
        name: 'unique_team_plan',
      },
      // One department plan per month
      {
        unique: true,
        fields: ['financialYear', 'month', 'departmentId'],
        where: { departmentId: { [require('sequelize').Op.ne]: null } },
        name: 'unique_dept_plan',
      },
    ],
  }
);

module.exports = KpiPlan;
