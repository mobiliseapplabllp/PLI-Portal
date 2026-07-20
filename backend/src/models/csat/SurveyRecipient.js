const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SurveyRecipient = sequelize.define(
  'SurveyRecipient',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    surveyDispatchId: { type: DataTypes.UUID, allowNull: false },
    clientEmployeeId: { type: DataTypes.UUID, allowNull: false },
    // UUID v4 token — used as the public survey URL key
    token: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM('sent', 'opened', 'submitted'),
      defaultValue: 'sent',
      allowNull: false,
    },
    // Set on successful SMTP delivery; NULL = email failed or not yet sent
    emailSentAt: { type: DataTypes.DATE, allowNull: true },
    // SMTP error message if delivery failed; NULL = no error
    emailError: { type: DataTypes.TEXT, allowNull: true },
    openedAt: { type: DataTypes.DATE, allowNull: true },
    submittedAt: { type: DataTypes.DATE, allowNull: true },
    reminderSentAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: 'survey_recipients',
    indexes: [{ unique: true, fields: ['token'] }],
  }
);

module.exports = SurveyRecipient;
