const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SurveyQuestion = sequelize.define(
  'SurveyQuestion',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    surveyId: { type: DataTypes.UUID, allowNull: false },
    questionText: { type: DataTypes.TEXT, allowNull: false },
    helperText: { type: DataTypes.TEXT, allowNull: true },
    questionType: {
      type: DataTypes.ENUM('text', 'radio', 'select', 'checkbox', 'rating', 'paragraph'),
      allowNull: false,
    },
    options: { type: DataTypes.JSON, allowNull: true },
    minValue: { type: DataTypes.INTEGER, allowNull: true },
    maxValue: { type: DataTypes.INTEGER, allowNull: true },
    minLabel: { type: DataTypes.STRING(100), allowNull: true },
    maxLabel: { type: DataTypes.STRING(100), allowNull: true },
    isRequired: { type: DataTypes.BOOLEAN, defaultValue: false },
    orderIndex: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: 'survey_questions',
  }
);

module.exports = SurveyQuestion;
