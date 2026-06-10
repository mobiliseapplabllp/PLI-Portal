const milestoneService = require('../../services/pm/milestone.service');
const { sendSuccess } = require('../../utils/response');

const getMilestones = async (req, res, next) => {
  try { sendSuccess(res, await milestoneService.getMilestones(req.params.id)); }
  catch (e) { next(e); }
};
const createMilestone = async (req, res, next) => {
  try { sendSuccess(res, await milestoneService.createMilestone(req.params.id, req.body, req.user), 'Milestone created', 201); }
  catch (e) { next(e); }
};
const updateMilestone = async (req, res, next) => {
  try { sendSuccess(res, await milestoneService.updateMilestone(req.params.id, req.params.milestoneId, req.body, req.user), 'Milestone updated'); }
  catch (e) { next(e); }
};
const deleteMilestone = async (req, res, next) => {
  try { await milestoneService.deleteMilestone(req.params.id, req.params.milestoneId, req.user); sendSuccess(res, null, 'Milestone deleted'); }
  catch (e) { next(e); }
};
const updateStatus = async (req, res, next) => {
  try { sendSuccess(res, await milestoneService.updateMilestoneStatus(req.params.id, req.params.milestoneId, req.body.status, req.user), 'Status updated'); }
  catch (e) { next(e); }
};
const updateProgress = async (req, res, next) => {
  try { sendSuccess(res, await milestoneService.updateMilestoneProgress(req.params.id, req.params.milestoneId, req.body.completionPercentage, req.user), 'Progress updated'); }
  catch (e) { next(e); }
};

module.exports = { getMilestones, createMilestone, updateMilestone, deleteMilestone, updateStatus, updateProgress };
