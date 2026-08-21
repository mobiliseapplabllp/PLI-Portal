/**
 * HdTask — Sub-task attached to a ticket.
 * Table: hd_tasks
 *
 * Sub-tasks are lightweight action items within a ticket.
 * Each has its own assignee and status, independent of the parent ticket status.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

/** @enum {string} */
const TASK_STATUS = Object.freeze({
  OPEN:        'open',
  IN_PROGRESS: 'in-progress',
  DONE:        'done',
});

const HdTask = sequelize.define('HdTask', {
  id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  ticketId: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    field:     'ticket_id',
    references: { model: 'hd_tickets', key: 'id' },
  },
  title: {
    type:      DataTypes.STRING(300),
    allowNull: false,
    validate:  { notEmpty: { msg: 'Task title is required' }, len: [2, 300] },
  },
  // PLI Portal user UUID
  assignedTo: {
    type:      DataTypes.STRING(36),
    allowNull: true,
    field:     'assigned_to',
  },
  status: {
    type:         DataTypes.ENUM(...Object.values(TASK_STATUS)),
    allowNull:    false,
    defaultValue: TASK_STATUS.OPEN,
  },
  dueDate: {
    type:      DataTypes.DATE,
    allowNull: true,
    field:     'due_date',
  },
}, {
  tableName:  'hd_tasks',
  underscored: true,
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   'updated_at',
});

HdTask.TASK_STATUS = TASK_STATUS;

module.exports = HdTask;
