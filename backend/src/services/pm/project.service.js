const { Op } = require('sequelize');
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const Milestone = require('../../models/pm/Milestone');
const Task = require('../../models/pm/Task');
const DailyStatusLog = require('../../models/pm/DailyStatusLog');
const ProjectNotificationRecipient = require('../../models/pm/ProjectNotificationRecipient');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const pmSettingsService = require('./pmSettings.service');

const PROJECT_INCLUDE = [
  { model: User, as: 'owner', attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'projectManager', attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'createdBy', attributes: ['id', 'name'] },
  {
    model: ProjectMember, as: 'members',
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation', 'role'] }],
  },
  // Milestones are included in list to support progress calculation on dashboard/project list
  {
    model: Milestone, as: 'milestones',
    attributes: ['id', 'name', 'status', 'endDate', 'completionPercentage', 'order'],
    include: [{ model: User, as: 'accountableUser', attributes: ['id', 'name'] }],
  },
];

function canManageProject(user) {
  return ['admin', 'manager', 'senior_manager'].includes(user.role);
}

function isProjectVisible(project, user) {
  if (['admin', 'md', 'director', 'hr_admin', 'final_approver'].includes(user.role)) return true;
  if (String(project.managerId) === String(user._id)) return true;
  if (String(project.ownerId) === String(user._id)) return true;
  return project.members && project.members.some(m => String(m.userId) === String(user._id));
}

const getProjects = async (query, user) => {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.search) where.name = { [Op.like]: `%${query.search}%` };

  const projects = await Project.findAll({
    where,
    include: PROJECT_INCLUDE,
    order: [
      ['createdAt', 'DESC'],
      [{ model: Milestone, as: 'milestones' }, 'order', 'ASC'],
    ],
  });

  // Filter by visibility for non-admin roles
  if (!['admin', 'md', 'director', 'hr_admin', 'final_approver'].includes(user.role)) {
    return projects.filter(p => isProjectVisible(p, user));
  }
  return projects;
};

const getProjectById = async (id, user) => {
  // Exclude the basic milestones include from PROJECT_INCLUDE (used for list views)
  // and replace it with the full detail include (with tasks) for the project detail view
  const baseIncludes = PROJECT_INCLUDE.filter(inc => inc.as !== 'milestones');
  const project = await Project.findByPk(id, {
    include: [
      ...baseIncludes,
      {
        model: Milestone, as: 'milestones',
        include: [
          { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'] },
          {
            model: Task, as: 'tasks',
            include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] }],
          },
        ],
      },
      {
        model: ProjectNotificationRecipient, as: 'notificationRecipients',
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      },
    ],
    order: [
      [{ model: Milestone, as: 'milestones' }, 'order', 'ASC'],
      [{ model: Milestone, as: 'milestones' }, { model: Task, as: 'tasks' }, 'order', 'ASC'],
    ],
  });
  if (!project) throw new NotFoundError('Project');
  if (!isProjectVisible(project, user)) throw new ForbiddenError('Access denied to this project');
  return project;
};

const createProject = async (data, user) => {
  const settings = await pmSettingsService.getSettings();
  const allowed = settings.allowedCreatorRoles || ['admin', 'manager', 'senior_manager'];
  if (!allowed.includes(user.role))
    throw new ForbiddenError(`Your role (${user.role}) is not permitted to create projects`);
  return Project.create({ ...data, createdById: user._id });
};

const updateProject = async (id, data, user) => {
  const project = await Project.findByPk(id);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id)) {
    throw new ForbiddenError('Only project manager or admin can update this project');
  }
  Object.assign(project, data);
  await project.save();
  return project;
};

const deleteProject = async (id, user) => {
  if (user.role !== 'admin') throw new ForbiddenError('Only admin can delete projects');
  const project = await Project.findByPk(id);
  if (!project) throw new NotFoundError('Project');
  await project.destroy();
};

const getProjectSummary = async (id, user) => {
  const project = await getProjectById(id, user);
  const today = new Date().toISOString().slice(0, 10);

  const milestones = project.milestones || [];
  const total = milestones.length;
  const completed = milestones.filter(m => m.status === 'completed').length;
  const inProgress = milestones.filter(m => m.status === 'in_progress').length;
  const delayed = milestones.filter(m => m.status === 'delayed' || (m.endDate && m.endDate < today && m.status !== 'completed')).length;
  const upcoming = milestones.filter(m => {
    if (!m.endDate) return false;
    const diff = Math.round((new Date(m.endDate) - new Date(today)) / 86400000);
    return diff >= 0 && diff <= 7 && m.status !== 'completed';
  });

  const todayLog = await DailyStatusLog.findOne({ where: { projectId: id, reportDate: today } });

  return { project, stats: { total, completed, inProgress, delayed }, upcoming, todayLog };
};

// ── Members ───────────────────────────────────────────────────────────────────
const getMembers = async (projectId, user) => {
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  if (!isProjectVisible(project, user)) throw new ForbiddenError('Access denied to this project');
  return ProjectMember.findAll({
    where: { projectId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation', 'role'] }],
  });
};

const addMember = async (projectId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id)) {
    throw new ForbiddenError('Only project manager or admin can add members');
  }
  const [member] = await ProjectMember.findOrCreate({
    where: { projectId, userId: data.userId },
    defaults: { role: data.role, responsibilities: data.responsibilities },
  });
  return member;
};

const updateMember = async (projectId, memberId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id))
    throw new ForbiddenError('Only project manager or admin can update members');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');
  Object.assign(member, data);
  await member.save();
  return member;
};

const removeMember = async (projectId, memberId, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id))
    throw new ForbiddenError('Only project manager or admin can remove members');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');
  await member.destroy();
};

// ── Notification Recipients ───────────────────────────────────────────────────
const getRecipients = async (projectId, user) => {
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  if (!isProjectVisible(project, user)) throw new ForbiddenError('Access denied to this project');
  return ProjectNotificationRecipient.findAll({
    where: { projectId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
  });
};

const addRecipient = async (projectId, data, user) => {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'managerId'] });
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id))
    throw new ForbiddenError('Only project manager can manage recipients');
  return ProjectNotificationRecipient.create({ projectId, ...data });
};

const removeRecipient = async (projectId, recipientId, user) => {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'managerId'] });
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id))
    throw new ForbiddenError('Only project manager can manage recipients');
  const r = await ProjectNotificationRecipient.findOne({ where: { id: recipientId, projectId } });
  if (!r) throw new NotFoundError('Recipient');
  await r.destroy();
};

module.exports = {
  getProjects, getProjectById, createProject, updateProject, deleteProject, getProjectSummary,
  getMembers, addMember, updateMember, removeMember,
  getRecipients, addRecipient, removeRecipient,
};
