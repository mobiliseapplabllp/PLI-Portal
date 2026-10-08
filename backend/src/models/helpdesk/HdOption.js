'use strict';
/**
 * HdOption — Configurable dropdown values for helpdesk ticket fields.
 * Table: hd_options
 *
 * The `type` column is the discriminator:
 *   category | status | level | mode | impact | urgency | priority | request_type | team | site
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const VALID_TYPES = Object.freeze([
  'category',
  'status',
  'level',
  'mode',
  'impact',
  'urgency',
  'priority',
  'request_type',
  'team',
  'site',
]);

const HdOption = sequelize.define('HdOption', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  type: {
    type:      DataTypes.STRING(50),
    allowNull: false,
    validate:  { isIn: { args: [VALID_TYPES], msg: `type must be one of: ${VALID_TYPES.join(', ')}` } },
  },
  name: {
    type:      DataTypes.STRING(200),
    allowNull: false,
    validate:  { notEmpty: { msg: 'name is required' }, len: [1, 200] },
  },
  description: {
    type:      DataTypes.TEXT,
    allowNull: true,
  },
  sortOrder: {
    type:         DataTypes.INTEGER,
    defaultValue: 0,
    field:        'sort_order',
  },
  // Protects the 6 foundational ticket statuses from deletion (migration 055) —
  // dashboard SLA/aging counts, the approval flow, and the closedAt auto-stamp
  // hook all key off those exact string values. Admins can still add new ones.
  isBuiltIn: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'is_built_in',
  },
  // Stable identifier for the 6 foundational statuses (migration 056), never
  // editable via the admin UI — unlike `name`, which can be freely renamed.
  // Code that needs to know "which option IS the built-in resolved/closed
  // slot right now" resolves through this, not through `name`.
  builtInKey: {
    type:      DataTypes.STRING(50),
    allowNull: true,
    field:     'built_in_key',
  },
}, {
  tableName:   'hd_options',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   false,
  indexes: [
    { unique: true, fields: ['type', 'name'], name: 'uq_hd_option_type_name' },
  ],
});

HdOption.VALID_TYPES = VALID_TYPES;

module.exports = HdOption;
