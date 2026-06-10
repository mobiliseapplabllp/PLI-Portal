const projectService = require('../../services/pm/project.service');
const { sendSuccess } = require('../../utils/response');

const getProjects = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjects(req.query, req.user)); }
  catch (e) { next(e); }
};

const getProjectById = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjectById(req.params.id, req.user)); }
  catch (e) { next(e); }
};

const createProject = async (req, res, next) => {
  try { sendSuccess(res, await projectService.createProject(req.body, req.user), 'Project created', 201); }
  catch (e) { next(e); }
};

const updateProject = async (req, res, next) => {
  try { sendSuccess(res, await projectService.updateProject(req.params.id, req.body, req.user), 'Project updated'); }
  catch (e) { next(e); }
};

const deleteProject = async (req, res, next) => {
  try { await projectService.deleteProject(req.params.id, req.user); sendSuccess(res, null, 'Project deleted'); }
  catch (e) { next(e); }
};

const getProjectSummary = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjectSummary(req.params.id, req.user)); }
  catch (e) { next(e); }
};

// Members
const getMembers = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getMembers(req.params.id)); }
  catch (e) { next(e); }
};
const addMember = async (req, res, next) => {
  try { sendSuccess(res, await projectService.addMember(req.params.id, req.body, req.user), 'Member added', 201); }
  catch (e) { next(e); }
};
const updateMember = async (req, res, next) => {
  try { sendSuccess(res, await projectService.updateMember(req.params.id, req.params.memberId, req.body), 'Member updated'); }
  catch (e) { next(e); }
};
const removeMember = async (req, res, next) => {
  try { await projectService.removeMember(req.params.id, req.params.memberId); sendSuccess(res, null, 'Member removed'); }
  catch (e) { next(e); }
};

// Recipients
const getRecipients = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getRecipients(req.params.id)); }
  catch (e) { next(e); }
};
const addRecipient = async (req, res, next) => {
  try { sendSuccess(res, await projectService.addRecipient(req.params.id, req.body), 'Recipient added', 201); }
  catch (e) { next(e); }
};
const removeRecipient = async (req, res, next) => {
  try { await projectService.removeRecipient(req.params.id, req.params.recipientId); sendSuccess(res, null, 'Recipient removed'); }
  catch (e) { next(e); }
};

module.exports = {
  getProjects, getProjectById, createProject, updateProject, deleteProject, getProjectSummary,
  getMembers, addMember, updateMember, removeMember,
  getRecipients, addRecipient, removeRecipient,
};
