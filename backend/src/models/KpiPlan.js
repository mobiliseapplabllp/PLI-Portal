const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { DEFAULT_HEAD_WEIGHTAGES, KPI_PLAN_STATUS } = require('../config/constants');

const KpiPlan = sequelize.define(
  'KpiPlan',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    // Workflow status before publishing
    status: {
      type: DataTypes.ENUM('draft', 'saved', 'ready_for_review'),
      defaultValue: KPI_PLAN_STATUS.DRAFT,
      allowNull: false,
    },
    // Weightage per head: { Performance, CustomerCentric, CoreValues, Trainings } — must sum to 100
    headWeightages: {
      type: DataTypes.JSON,
      defaultValue: DEFAULT_HEAD_WEIGHTAGES,
      allowNull: false,
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
      // One plan per department per financial year
      {
        unique: true,
        fields: ['financialYear', 'departmentId', 'role'],
        name: 'unique_dept_fy_role_plan',
      },
    ],
  }
);

module.exports = KpiPlan;
