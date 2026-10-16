const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { CYCLE_STATUS } = require('../config/constants');

const AppraisalCycle = sequelize.define(
  'AppraisalCycle',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    financialYear: { type: DataTypes.STRING(16), allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    // NULL = applies to every department (the global fallback). A department
    // only gets its own row when an admin explicitly creates one.
    departmentId: { type: DataTypes.UUID, allowNull: true },
    quarter: { type: DataTypes.ENUM('Q1', 'Q2', 'Q3', 'Q4'), allowNull: false },
    // Deadline order: commitment → employeeSubmission → managerReview → finalReview
    commitmentDeadline: { type: DataTypes.DATE, allowNull: true },
    employeeSubmissionDeadline: { type: DataTypes.DATE, allowNull: true },
    managerReviewDeadline: { type: DataTypes.DATE, allowNull: true },
    finalReviewDeadline: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(CYCLE_STATUS)),
      defaultValue: CYCLE_STATUS.DRAFT,
    },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    tableName: 'appraisal_cycles',
    indexes: [{ unique: true, fields: ['financialYear', 'month', 'departmentId'], name: 'uq_appraisal_cycle_fy_month_dept' }],
  }
);

module.exports = AppraisalCycle;
