const taskService = require('../../services/pm/task.service');
const { sendSuccess } = require('../../utils/response');

const getTasks = async (req, res, next) => {
  try { sendSuccess(res, await taskService.getTasks(req.params.id, req.params.milestoneId, req.user)); }
  catch (e) { next(e); }
};
const createTask = async (req, res, next) => {
  try { sendSuccess(res, await taskService.createTask(req.params.id, req.params.milestoneId, req.body, req.user), 'Task created', 201); }
  catch (e) { next(e); }
};
const updateTask = async (req, res, next) => {
  try { sendSuccess(res, await taskService.updateTask(req.params.id, req.params.milestoneId, req.params.taskId, req.body, req.user), 'Task updated'); }
  catch (e) { next(e); }
};
const deleteTask = async (req, res, next) => {
  try { await taskService.deleteTask(req.params.id, req.params.milestoneId, req.params.taskId, req.user); sendSuccess(res, null, 'Task deleted'); }
  catch (e) { next(e); }
};
const updateTaskStatus = async (req, res, next) => {
  try { sendSuccess(res, await taskService.updateTaskStatus(req.params.id, req.params.milestoneId, req.params.taskId, req.body.status, req.user), 'Status updated'); }
  catch (e) { next(e); }
};

const getAllProjectTasks = async (req, res, next) => {
  try { sendSuccess(res, await taskService.getAllProjectTasks(req.params.id, req.user)); }
  catch (e) { next(e); }
};

const getMyTasks = async (req, res, next) => {
  try { sendSuccess(res, await taskService.getMyTasks(req.user)); }
  catch (e) { next(e); }
};

module.exports = { getTasks, getAllProjectTasks, getMyTasks, createTask, updateTask, deleteTask, updateTaskStatus };
