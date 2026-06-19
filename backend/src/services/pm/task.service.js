const Task = require('../../models/pm/Task');
const Milestone = require('../../models/pm/Milestone');
const Project = require('../../models/pm/Project');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const getTasks = async (projectId, milestoneId) => {
  const where = { projectId };
  if (milestoneId) where.milestoneId = milestoneId;
  return Task.findAll({
    where,
    include: [
      { model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] },
      { model: Milestone, as: 'milestone', attributes: ['id', 'name', 'status'] },
    ],
    order: [['order', 'ASC']],
  });
};

// Returns all tasks for a project across all milestones — avoids N+1 in MyTasks page
const getAllProjectTasks = async (projectId) => {
  return Task.findAll({
    where: { projectId },
    include: [
      { model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] },
      { model: Milestone, as: 'milestone', attributes: ['id', 'name', 'status'] },
    ],
    order: [['order', 'ASC']],
  });
};

const createTask = async (projectId, milestoneId, data, user) => {
  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');
  const maxOrder = await Task.max('order', { where: { milestoneId } }) || 0;
  return Task.create({ ...data, projectId, milestoneId, order: maxOrder + 1 });
};

const updateTask = async (projectId, milestoneId, taskId, data) => {
  const task = await Task.findOne({ where: { id: taskId, milestoneId, projectId } });
  if (!task) throw new NotFoundError('Task');
  Object.assign(task, data);
  await task.save();
  return task;
};

const deleteTask = async (projectId, milestoneId, taskId) => {
  const task = await Task.findOne({ where: { id: taskId, milestoneId, projectId } });
  if (!task) throw new NotFoundError('Task');
  await task.destroy();
};

const updateTaskStatus = async (projectId, milestoneId, taskId, status) => {
  return updateTask(projectId, milestoneId, taskId, { status });
};

module.exports = { getTasks, getAllProjectTasks, createTask, updateTask, deleteTask, updateTaskStatus };
