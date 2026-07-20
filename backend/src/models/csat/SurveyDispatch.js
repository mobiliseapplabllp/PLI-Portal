const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const SurveyDispatch = sequelize.define(
  'SurveyDispatch',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    surveyId: { type: DataTypes.UUID, allowNull: false },
    clientOrganisationId: { type: DataTypes.UUID, allowNull: false },
    // Snapshot of employee IDs — used by cron to create recurring child recipients
    employeeIds: { type: DataTypes.JSON, allowNull: false },
    emailSubject: { type: DataTypes.STRING(255), allowNull: false },
    totalRecipients: { type: DataTypes.INTEGER, defaultValue: 0 },
    dispatchMode: {
      type: DataTypes.ENUM('instant', 'scheduled', 'recurring'),
      defaultValue: 'instant',
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'active', 'closed'),
      defaultValue: 'pending',
      allowNull: false,
    },
    // Instant: NULL. Scheduled: chosen datetime. Recurring: first fire date.
    scheduledAt: { type: DataTypes.DATE, allowNull: true },
    recurrencePattern: {
      type: DataTypes.ENUM('weekly', 'monthly', 'quarterly'),
      allowNull: true,
    },
    recurrenceEndAt: { type: DataTypes.DATE, allowNull: true },
    // Updated by cron after each recurring fire — next child dispatch time
    nextDispatchAt: { type: DataTypes.DATE, allowNull: true },
    // NULL on parent rows; set to parent.id on child rows created by cron
    parentDispatchId: { type: DataTypes.UUID, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    reminderDays: { type: DataTypes.INTEGER, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
    sentById: { type: DataTypes.UUID, allowNull: true },
    approvalStatus: {
      type: DataTypes.ENUM(
        'not_required', 'pending_approval', 'changes_requested',
        'approved', 'rejected', 'expired_unapproved'
      ),
      defaultValue: 'not_required',
      allowNull: false,
    },
    tempChangeSummary: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'survey_dispatches',
  }
);

module.exports = SurveyDispatch;
