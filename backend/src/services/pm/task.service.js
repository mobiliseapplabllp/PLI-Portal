const Task = require('../../models/pm/Task');
const Milestone = require('../../models/pm/Milestone');
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');
const { sendEmail } = require('../../utils/emailService');

async function sendTaskAssignmentEmail(task, project) {
  try {
    if (!task.assignedToId) return;
    const assignee = await User.findByPk(task.assignedToId, { attributes: ['name', 'email'] });
    if (!assignee?.email) return;
    const dueText = task.dueDate ? `<p><strong>Due Date:</strong> ${new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>` : '';
    await sendEmail(
      assignee.email,
      `New Task Assigned: ${task.title}`,
      `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#059669">Task Assigned to You</h2>
        <p>Hi ${assignee.name},</p>
        <p>A new task has been assigned to you in <strong>${project?.name || 'a project'}</strong>.</p>
        <table style="border-collapse:collapse;width:100%;margin:16px 0">
          <tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Task</td><td style="padding:8px;border:1px solid #e5e7eb">${task.title}</td></tr>
          ${task.notes ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Notes</td><td style="padding:8px;border:1px solid #e5e7eb">${task.notes}</td></tr>` : ''}
          ${dueText ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb">Due Date</td><td style="padding:8px;border:1px solid #e5e7eb">${task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</td></tr>` : ''}
        </table>
        <p style="color:#6b7280;font-size:12px">Please log in to the PLI Portal to view your task.</p>
      </div>`
    );
  } catch (err) {
    console.error('[PM Task] Assignment email failed:', err.message);
  }
}

async function assertManagerAccess(projectId, user) {
  if (['admin', 'manager', 'senior_manager'].includes(user.role)) return;
  const project = await Project.findByPk(projectId, { attributes: ['id', 'managerId'] });
  if (!project) throw new NotFoundError('Project');
  if (String(project.managerId) !== String(user._id))
    throw new ForbiddenError('Only project managers can perform this action');
}

const getTasks = async (projectId, milestoneId, user) => {
  await assertProjectVisible(projectId, user);
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

// Returns all tasks assigned to the calling user across ALL projects — single query for MyTasks page
const getMyTasks = async (user) => {
  return Task.findAll({
    where: { assignedToId: user._id },
    include: [
      { model: User, as: 'assignedTo', attributes: ['id', 'name', 'email'] },
      { model: Milestone, as: 'milestone', attributes: ['id', 'name', 'status'] },
      { model: Project, as: 'project', attributes: ['id', 'name', 'status'] },
    ],
    order: [['dueDate', 'ASC']],
  });
};

// Returns all tasks for a project across all milestones — avoids N+1 in MyTasks page
const getAllProjectTasks = async (projectId, user) => {
  await assertProjectVisible(projectId, user);
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
  await assertManagerAccess(projectId, user);
  const milestone = await Milestone.findOne({ where: { id: milestoneId, projectId } });
  if (!milestone) throw new NotFoundError('Milestone');
  const maxOrder = await Task.max('order', { where: { milestoneId } }) || 0;
  const task = await Task.create({ ...data, projectId, milestoneId, order: maxOrder + 1 });
  if (task.assignedToId) {
    const project = await Project.findByPk(projectId, { attributes: ['name'] });
    sendTaskAssignmentEmail(task, project);
  }
  return task;
};

const updateTask = async (projectId, milestoneId, taskId, data, user) => {
  // Full edit (title, assignee, dueDate, notes, milestone) — managers only
  await assertManagerAccess(projectId, user);
  const task = await Task.findOne({ where: { id: taskId, milestoneId, projectId } });
  if (!task) throw new NotFoundError('Task');
  const prevAssignee = String(task.assignedToId || '');
  Object.assign(task, data);
  await task.save();
  if (data.assignedToId && String(data.assignedToId) !== prevAssignee) {
    const project = await Project.findByPk(projectId, { attributes: ['name'] });
    sendTaskAssignmentEmail(task, project);
  }
  return task;
};

const deleteTask = async (projectId, milestoneId, taskId, user) => {
  // Delete — managers only
  await assertManagerAccess(projectId, user);
  const task = await Task.findOne({ where: { id: taskId, milestoneId, projectId } });
  if (!task) throw new NotFoundError('Task');
  await task.destroy();
};

const updateTaskStatus = async (projectId, milestoneId, taskId, status, user) => {
  // Status update — assignee can update their OWN task; managers can update any task
  const isManager = ['admin', 'manager', 'senior_manager'].includes(user.role);
  const task = await Task.findOne({ where: { id: taskId, milestoneId, projectId } });
  if (!task) throw new NotFoundError('Task');

  if (!isManager) {
    // Check project membership first
    await assertProjectVisible(projectId, user);
    if (String(task.assignedToId) !== String(user._id)) {
      throw new ForbiddenError('You can only update the status of tasks assigned to you');
    }
  }

  task.status = status;
  await task.save();
  return task;
};

module.exports = { getTasks, getAllProjectTasks, getMyTasks, createTask, updateTask, deleteTask, updateTaskStatus };
