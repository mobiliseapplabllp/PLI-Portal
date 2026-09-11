const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { PM_MILESTONE_STATUS } = require('../../config/constants');

const Milestone = sequelize.define(
  'Milestone',
  {
    id:        { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },

    // ── Hierarchy ──────────────────────────────────────────────────────────────
    // NULL = top-level default milestone; set = sub-milestone
    parentMilestoneId: { type: DataTypes.UUID, allowNull: true, defaultValue: null },

    // ── Type flag ─────────────────────────────────────────────────────────────
    // true  = auto-created from milestone template (default milestone)
    // false = PM-added sub-milestone
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },

    // ── Core fields ───────────────────────────────────────────────────────────
    name:        { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    plannedStartDate: { type: DataTypes.DATEONLY, allowNull: true, comment: 'Planned start date' },
    plannedEndDate:   { type: DataTypes.DATEONLY, allowNull: true, comment: 'Planned end date' },
    actualStartDate:  { type: DataTypes.DATEONLY, allowNull: true, comment: 'Actual start date' },
    actualEndDate:    { type: DataTypes.DATEONLY, allowNull: true, comment: 'Actual end date' },

    accountableUserId:    { type: DataTypes.UUID, allowNull: true },

    // ── Planned-date lock ─────────────────────────────────────────────────────
    // Planned dates are the baseline and lock once set. An admin can unlock a
    // milestone for ONE change; the next successful planned-date write re-locks.
    // NULL = locked.
    plannedDatesUnlockedAt: { type: DataTypes.DATE,       allowNull: true, defaultValue: null },
    plannedDatesUnlockedBy: { type: DataTypes.STRING(36), allowNull: true, defaultValue: null },

    status: {
      type: DataTypes.STRING(100),
      defaultValue: PM_MILESTONE_STATUS.NOT_STARTED, // constant must equal 'not_started' — matches DB DEFAULT
    },

    order:               { type: DataTypes.INTEGER, defaultValue: 0 },
    completionPercentage:{ type: DataTypes.INTEGER, defaultValue: 0 },

    // ── Percentage weight fields ───────────────────────────────────────────────
    // weightPercentage: actual % this milestone carries in the project (PM sets this)
    // minPct / maxPct : prescribed range (from template, for default milestones only)
    weightPercentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: null },
    minPct:           { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: null },
    maxPct:           { type: DataTypes.DECIMAL(5, 2), allowNull: true, defaultValue: null },
  },
  { tableName: 'pm_milestones' }
);

module.exports = Milestone;
