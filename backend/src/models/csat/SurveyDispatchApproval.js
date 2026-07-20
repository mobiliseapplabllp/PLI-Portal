const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SurveyDispatchApproval = sequelize.define(
  'SurveyDispatchApproval',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    surveyDispatchId: { type: DataTypes.UUID, allowNull: false },
    requestedById: { type: DataTypes.UUID, allowNull: false },
    reviewedById: { type: DataTypes.UUID, allowNull: true },
    status: {
      type: DataTypes.ENUM('pending', 'changes_requested', 'approved', 'rejected'),
      defaultValue: 'pending',
      allowNull: false,
    },
    overallFeedback: { type: DataTypes.TEXT, allowNull: true },
    approvalDeadline: { type: DataTypes.DATE, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: false },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    escalationSentAt: { type: DataTypes.DATE, allowNull: true },
    changeSummary: { type: DataTypes.JSON, allowNull: true },
    version: { type: DataTypes.INTEGER, defaultValue: 1, allowNull: false },
  },
  {
    tableName: 'survey_dispatch_approvals',
  }
);

module.exports = SurveyDispatchApproval;
