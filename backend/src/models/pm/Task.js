const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const { PM_TASK_STATUS } = require('../../config/constants');

const Task = sequelize.define(
  'Task',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    milestoneId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    assignedToId: { type: DataTypes.UUID, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(PM_TASK_STATUS)),
      defaultValue: PM_TASK_STATUS.TODO,
    },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'pm_tasks' }
);

module.exports = Task;
