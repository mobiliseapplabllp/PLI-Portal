'use strict';
/**
 * HdSlaPolicy — admin-configurable SLA timing per priority.
 * Table: hd_sla_policies
 *
 * resolutionHours: auto-computes a new ticket's dueDate (= createdAt +
 * resolutionHours) ONLY when the creator didn't pick one explicitly — an
 * explicit dueDate always wins, so manual due-date entry keeps working
 * exactly as before this feature existed.
 *
 * atRiskThresholdHours: drives the live SLA status shown on the ticket
 * (computeSlaStatus in TicketDetail.jsx) — "At Risk" once this many hours
 * remain before dueDate. Replaces what used to be a single hardcoded
 * 4-hour window for every ticket regardless of priority.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const HdSlaPolicy = sequelize.define('HdSlaPolicy', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  priority: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  resolutionHours: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'resolution_hours' },
  atRiskThresholdHours: { type: DataTypes.DECIMAL(10, 2), allowNull: false, field: 'at_risk_threshold_hours' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
}, {
  tableName: 'hd_sla_policies',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = HdSlaPolicy;
