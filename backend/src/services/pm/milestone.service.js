const Milestone = require('../../models/pm/Milestone');
const Task = require('../../models/pm/Task');
const Project = require('../../models/pm/Project');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

function canManage(user, project) {
  if (['admin', 'manager', 'senior_manager'].includes(user.role)) return true;
  if (String(project.managerId) === String(user._id)) return true;
  return false;
}

const getMilestones = async (projectId) => {
  return Milestone.findAll({
    where: { projectId },
    include: [
      { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'] },
      {
        model: Task, as: 'tasks',
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] }],
        order: [['order', 'ASC']],
      },
    ],
    order: [['order', 'ASC']],
  });
};

const createMilestone = async (projectId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Only project manager or admin can create milestones');

  const maxOrder = await Milestone.max('order', { where: { projectId } }) || 0;
  return Milestone.create({ ...data, projectId, order: maxOrder + 1 });
};

const updateMilestone = async (projectId, milestoneId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');
  Object.assign(milestone, data);
  await milestone.save();
  return milestone;
};

const deleteMilestone = async (projectId, milestoneId, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');
  await milestone.destroy();
};

const updateMilestoneStatus = async (projectId, milestoneId, status, user) => {
  return updateMilestone(projectId, milestoneId, { status }, user);
};

const updateMilestoneProgress = async (projectId, milestoneId, completionPercentage, user) => {
  return updateMilestone(projectId, milestoneId, { completionPercentage }, user);
};

module.exports = {
  getMilestones, createMilestone, updateMilestone, deleteMilestone,
  updateMilestoneStatus, updateMilestoneProgress,
};
