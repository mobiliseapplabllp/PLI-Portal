const taskService = require('../../services/pm/task.service');
const { sendSuccess } = require('../../utils/response');

const getTasks = async (req, res, next) => {
  try { sendSuccess(res, await taskService.getTasks(req.params.id, req.params.milestoneId)); }
  catch (e) { next(e); }
};
const createTask = async (req, res, next) => {
  try { sendSuccess(res, await taskService.createTask(req.params.id, req.params.milestoneId, req.body, req.user), 'Task created', 201); }
  catch (e) { next(e); }
};
const updateTask = async (req, res, next) => {
  try { sendSuccess(res, await taskService.updateTask(req.params.id, req.params.milestoneId, req.params.taskId, req.body), 'Task updated'); }
  catch (e) { next(e); }
};
const deleteTask = async (req, res, next) => {
  try { await taskService.deleteTask(req.params.id, req.params.milestoneId, req.params.taskId); sendSuccess(res, null, 'Task deleted'); }
  catch (e) { next(e); }
};
const updateTaskStatus = async (req, res, next) => {
  try { sendSuccess(res, await taskService.updateTaskStatus(req.params.id, req.params.milestoneId, req.params.taskId, req.body.status), 'Status updated'); }
  catch (e) { next(e); }
};

module.exports = { getTasks, createTask, updateTask, deleteTask, updateTaskStatus };
