const Milestone           = require('../../models/pm/Milestone');
const PmMilestoneTemplate = require('../../models/pm/PmMilestoneTemplate');
const Task                = require('../../models/pm/Task');
const Project             = require('../../models/pm/Project');
const ProjectMember       = require('../../models/pm/ProjectMember');
const User                = require('../../models/User');
const { randomUUID }      = require('crypto');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const MANAGERS = ['admin', 'manager', 'senior_manager'];

function canManage(user, project) {
  if (MANAGERS.includes(user.role)) return true;
  if (String(project.managerId) === String(user._id ?? user.id)) return true;
  return false;
}

async function assertProjectVisible(projectId, user) {
  if (['admin', 'md', 'director', 'hr_admin', 'final_approver'].includes(user.role)) return;
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId', 'accountManagerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  const uid = String(user._id ?? user.id);
  const visible =
    String(project.managerId)        === uid ||
    String(project.ownerId)          === uid ||
    String(project.accountManagerId) === uid ||
    (project.members || []).some(m => String(m.userId) === uid);
  if (!visible) throw new ForbiddenError('Access denied to this project');
}

// ── GET milestones — returns nested tree ─────────────────────────────────────
// Returns: [defaultMilestone, ...] each with subMilestones array
const getMilestones = async (projectId, user) => {
  await assertProjectVisible(projectId, user);

  // Fetch all milestones for this project
  const all = await Milestone.findAll({
    where: { projectId },
    include: [
      { model: User, as: 'accountableUser', attributes: ['id', 'name', 'email'] },
      {
        model: Task, as: 'tasks',
        include: [{ model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] }],
      },
    ],
    order: [['order', 'ASC'], ['createdAt', 'ASC']],
  });

  // Build nested tree: top-level first (parentMilestoneId IS NULL), then children
  const topLevel = all.filter(m => !m.parentMilestoneId);
  const children = all.filter(m => !!m.parentMilestoneId);

  const tree = topLevel.map(m => {
    const plain = m.toJSON();
    plain.subMilestones = children
      .filter(c => String(c.parentMilestoneId) === String(m.id))
      .map(c => c.toJSON())
      .sort((a, b) => a.order - b.order || new Date(a.createdAt) - new Date(b.createdAt));
    return plain;
  });

  return tree;
};

// ── CREATE default milestone (from template, auto-created on project creation) ─
const createDefaultMilestones = async (projectId, projectType) => {
  const templates = await PmMilestoneTemplate.findAll({
    where: { projectType, isActive: true },
    order: [['sortOrder', 'ASC']],
  });

  if (templates.length === 0) {
    // Fallback: single "Development" default milestone
    await Milestone.create({
      id: randomUUID(), projectId,
      name: 'Development', isDefault: true,
      weightPercentage: 100, minPct: 100, maxPct: 100,
      status: 'not_started', order: 1,
    });
    return;
  }

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    await Milestone.create({
      id: randomUUID(), projectId,
      name: t.name, isDefault: true,
      minPct: t.minPct, maxPct: t.maxPct,
      weightPercentage: null, // PM fills this later
      status: 'not_started', order: t.sortOrder || i + 1,
    });
  }
};

// ── CREATE top-level milestone (manager adds new default milestone) ────────────
const createMilestone = async (projectId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Only project manager or admin can create milestones');

  const maxOrder = await Milestone.max('order', { where: { projectId, parentMilestoneId: null } }) || 0;
  return Milestone.create({
    ...data,
    projectId,
    parentMilestoneId: null,
    isDefault: data.isDefault ?? true,
    order: data.order ?? maxOrder + 1,
  });
};

// ── CREATE sub-milestone (PM adds under a default milestone) ──────────────────
const createSubMilestone = async (projectId, parentMilestoneId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Only project manager or admin can add sub-milestones');

  const parent = await Milestone.findOne({ where: { id: parentMilestoneId, projectId } });
  if (!parent) throw new NotFoundError('Parent milestone');

  const maxOrder = await Milestone.max('order', { where: { projectId, parentMilestoneId } }) || 0;
  return Milestone.create({
    ...data,
    projectId,
    parentMilestoneId,
    isDefault: false,
    order: data.order ?? maxOrder + 1,
  });
};

// ── UPDATE milestone ──────────────────────────────────────────────────────────
const updateMilestone = async (projectId, milestoneId, data, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');

  const isAccountable = String(milestone.accountableUserId) === String(user._id ?? user.id);
  const isStatusOrProgressOnly = Object.keys(data).every(k =>
    ['status', 'completionPercentage'].includes(k)
  );

  if (!canManage(user, project)) {
    if (!isAccountable || !isStatusOrProgressOnly) {
      throw new ForbiddenError('Not authorized to update this milestone');
    }
  }

  // Validate weightPercentage against range (for default milestones)
  if (data.weightPercentage !== undefined && milestone.isDefault &&
      milestone.minPct !== null && milestone.maxPct !== null) {
    const w = Number(data.weightPercentage);
    if (w < Number(milestone.minPct) || w > Number(milestone.maxPct)) {
      throw new ForbiddenError(
        `Weight must be between ${milestone.minPct}% and ${milestone.maxPct}%`
      );
    }
  }

  Object.assign(milestone, data);
  await milestone.save();
  return milestone;
};

// ── DELETE milestone ──────────────────────────────────────────────────────────
const deleteMilestone = async (projectId, milestoneId, user) => {
  await assertProjectVisible(projectId, user);
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManage(user, project)) throw new ForbiddenError('Not authorized');

  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');
  await milestone.destroy();
};

const updateMilestoneStatus   = (pid, mid, status, user)   => updateMilestone(pid, mid, { status }, user);
const updateMilestoneProgress = (pid, mid, pct, user)      => updateMilestone(pid, mid, { completionPercentage: pct }, user);

module.exports = {
  getMilestones, createDefaultMilestones,
  createMilestone, createSubMilestone,
  updateMilestone, deleteMilestone,
  updateMilestoneStatus, updateMilestoneProgress,
};
