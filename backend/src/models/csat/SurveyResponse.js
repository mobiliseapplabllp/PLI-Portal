const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SurveyResponse = sequelize.define(
  'SurveyResponse',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    surveyRecipientId: { type: DataTypes.UUID, allowNull: false },
    surveyQuestionId: { type: DataTypes.UUID, allowNull: false },
    // JSON string for checkbox; integer string for rating; plain text for others
    answer: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'survey_responses',
  }
);

module.exports = SurveyResponse;
