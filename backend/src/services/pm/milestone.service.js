const Milestone = require('../../models/pm/Milestone');
const Task = require('../../models/pm/Task');
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

function canManage(user, project) {
  if (['admin', 'manager', 'senior_manager'].includes(user.role)) return true;
  if (String(project.managerId) === String(user._id)) return true;
  return false;
}

async function assertProjectVisible(projectId, user) {
  if (['admin', 'md', 'director', 'hr_admin', 'final_approver'].includes(user.role)) return;
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  const visible =
    String(project.managerId) === String(user._id) ||
    String(project.ownerId) === String(user._id) ||
    (project.members || []).some(m => String(m.userId) === String(user._id));
  if (!visible) throw new ForbiddenError('Access denied to this project');
}

const getMilestones = async (projectId, user) => {
  await assertProjectVisible(projectId, user);
  return Milestone.findAll({
    where: { projectId },
    include: [
      { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'] },
      {
        model: Task, as: 'tasks',
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] }],
      },
    ],
    order: [['order', 'ASC']],
  });
};

const createMilestone = async (projectId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Only project manager or admin can create milestones');

  const maxOrder = await Milestone.max('order', { where: { projectId } }) || 0;
  return Milestone.create({ ...data, projectId, order: maxOrder + 1 });
};

const updateMilestone = async (projectId, milestoneId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');

  const isAccountable = String(milestone.accountableUserId) === String(user._id);
  const isStatusOrProgressOnly = Object.keys(data).every(k => ['status', 'completionPercentage'].includes(k));

  if (!canManage(user, project)) {
    // Accountable user can only update status/progress of their own milestone
    if (!isAccountable || !isStatusOrProgressOnly) {
      throw new ForbiddenError('Not authorized to update this milestone');
    }
  }

  Object.assign(milestone, data);
  await milestone.save();
  return milestone;
};

const deleteMilestone = async (projectId, milestoneId, user) => {
  await assertProjectVisible(projectId, user);
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
