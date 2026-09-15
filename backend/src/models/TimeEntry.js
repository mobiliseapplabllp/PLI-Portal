/**
 * TimeEntry — actual hours logged against ONE entity: a helpdesk ticket, a PM
 * milestone or a PM project. Module-neutral by design (entity_type + entity_id).
 * Table: time_entries (migration 045). Columns are snake_case.
 *
 * entityId is a string: hd_tickets uses an INT PK (stored as its decimal
 * string), pm_milestones / pm_projects use CHAR(36) UUIDs.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ENTITY_TYPES = Object.freeze(['ticket', 'milestone', 'project']);

const TimeEntry = sequelize.define(
  'TimeEntry',
  {
    id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    entityType:  { type: DataTypes.ENUM(...ENTITY_TYPES), allowNull: false, field: 'entity_type' },
    entityId:    { type: DataTypes.STRING(36), allowNull: false, field: 'entity_id' },
    userId:      { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    date:        { type: DataTypes.DATEONLY, allowNull: false, field: 'date' },
    hours:       { type: DataTypes.DECIMAL(5, 2), allowNull: false, field: 'hours' },
    note:        { type: DataTypes.STRING(500), allowNull: true, field: 'note' },
    createdById: { type: DataTypes.UUID, allowNull: true, field: 'created_by_id' },
  },
  {
    tableName: 'time_entries',
    underscored: true,
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    indexes: [
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['user_id', 'date'] },
    ],
  }
);

TimeEntry.ENTITY_TYPES = ENTITY_TYPES;

module.exports = TimeEntry;
