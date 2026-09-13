const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ProjectMember = sequelize.define(
  'ProjectMember',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING(100), allowNull: true },
    responsibilities: { type: DataTypes.TEXT, allowNull: true },
    // Legacy — derived from hoursPerDay / pm_settings.workingHoursPerDay and kept
    // in sync on every write for older readers. Never the source of truth.
    allocationPct:    { type: DataTypes.TINYINT.UNSIGNED, allowNull: true },
    // Phase 0: hours/day is the allocation input
    hoursPerDay:      { type: DataTypes.DECIMAL(3, 1), allowNull: true },
    // false = pre-filled from legacy allocationPct by migration 039, awaiting PM confirmation
    hoursConfirmed:   { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // What the user typed: 'per_day' (hoursPerDay is the input) or 'total'
    // (allocationTotalHours is the input; hoursPerDay derived = total ÷ working days).
    allocationMode:       { type: DataTypes.ENUM('per_day', 'total'), allowNull: false, defaultValue: 'per_day' },
    allocationTotalHours: { type: DataTypes.DECIMAL(6, 1), allowNull: true },
    allocationFrom:   { type: DataTypes.DATEONLY, allowNull: true },
    allocationTo:     { type: DataTypes.DATEONLY, allowNull: true },
    allocationStatus: { type: DataTypes.ENUM('active','pending','approved','rejected'), defaultValue: 'active', allowNull: false },
  },
  {
    tableName: 'pm_project_members',
    indexes: [{ unique: true, fields: ['projectId', 'userId'] }],
  }
);

module.exports = ProjectMember;
