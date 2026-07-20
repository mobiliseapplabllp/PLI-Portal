const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SurveyDispatchApprovalFeedback = sequelize.define(
  'SurveyDispatchApprovalFeedback',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    surveyDispatchApprovalId: { type: DataTypes.UUID, allowNull: false },
    surveyQuestionId: { type: DataTypes.UUID, allowNull: false },
    feedback: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: 'survey_dispatch_approval_feedbacks',
  }
);

module.exports = SurveyDispatchApprovalFeedback;
