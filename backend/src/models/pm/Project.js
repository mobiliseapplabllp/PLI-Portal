const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const Project = sequelize.define(
  'Project',
  {
    id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name:            { type: DataTypes.STRING(255), allowNull: false },
    description:     { type: DataTypes.TEXT, allowNull: true },
    purpose:         { type: DataTypes.TEXT, allowNull: true },

    // ── Renamed / repurposed fields ────────────────────────────────────────────
    // ownerId kept for backward compat; accountManagerId is the new "Account Manager" field
    ownerId:           { type: DataTypes.UUID, allowNull: true },
    accountManagerId:  { type: DataTypes.UUID, allowNull: true },

    clientName:      { type: DataTypes.STRING(255), allowNull: true },
    clientEmail:     { type: DataTypes.STRING(255), allowNull: true },
    // FK to client_organisations — application-level integrity (see column
    // comment in the DB). Was a real DB column with no Sequelize field until
    // the bulk-import feature (migration 054) needed to write it.
    clientOrgId:     { type: DataTypes.UUID, allowNull: true },
    notifyClient:    { type: DataTypes.BOOLEAN, defaultValue: false },
    managerId:       { type: DataTypes.UUID, allowNull: true },

    // ── Configurable status (VARCHAR after migration 012) ──────────────────────
    status:          { type: DataTypes.STRING(100), defaultValue: 'Yet to Start' },

    // ── billingType replaces old projectType for Billable/Non-Billable ─────────
    billingType: {
      type: DataTypes.ENUM('Billable', 'Non-Billable'),
      allowNull: false,
      defaultValue: 'Non-Billable',
    },

    // ── projectType now stores project category (Signed/Unsigned/Contract/Demo) ─
    // projectType stays a synced display copy; projectTypeId (migration 053) is
    // the real reference — same pattern as PmMilestoneTemplate (migration 052).
    projectType:     { type: DataTypes.STRING(100), allowNull: true },
    projectTypeId:   { type: DataTypes.INTEGER, allowNull: true },

    // Set only on projects created by the bulk import feature (migration 054) —
    // ties every row from one import run together so a bad import can be undone.
    importBatchId:   { type: DataTypes.UUID, allowNull: true },

    // Usage flags (migration 046) — independent, both may be true.
    // isProduct: planned in Project Management; default milestones are created on
    // creation ONLY when this is true. isOperations: accepts helpdesk tickets.
    isProduct:       { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isOperations:    { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Planned dates — set once at creation, treated as read-only after
    startDate:          { type: DataTypes.DATEONLY, allowNull: true },  // plannedStartDate in UI
    endDate:            { type: DataTypes.DATEONLY, allowNull: true },  // plannedEndDate in UI
    // Actual dates — filled after project kicks off
    actualStartDate:    { type: DataTypes.DATEONLY, allowNull: true },
    actualEndDate:      { type: DataTypes.DATEONLY, allowNull: true },
    createdById:     { type: DataTypes.UUID, allowNull: true },
  },
  { tableName: 'pm_projects' }
);

module.exports = Project;
