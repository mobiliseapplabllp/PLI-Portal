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
