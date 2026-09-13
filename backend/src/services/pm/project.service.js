const { Op } = require('sequelize');
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const Milestone = require('../../models/pm/Milestone');
const Task = require('../../models/pm/Task');
const DailyStatusLog = require('../../models/pm/DailyStatusLog');
const ProjectNotificationRecipient = require('../../models/pm/ProjectNotificationRecipient');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError, ValidationError, AllocationConflictError } = require('../../utils/errors');
const pmSettingsService = require('./pmSettings.service');
const { createDefaultMilestones } = require('./milestone.service');
const { checkConflict, toPct, normaliseCalendar, resolveAllocation, workingDaysBetween } = require('../../utils/capacityEngine');

const INACTIVE_PROJECT_STATUSES = ['completed', 'cancelled', 'closed'];

const PROJECT_INCLUDE = [
  { model: User, as: 'owner',          attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'accountManager', attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'projectManager', attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'createdBy',      attributes: ['id', 'name'] },
  {
    model: ProjectMember, as: 'members',
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation', 'role'] }],
  },
  // Top-level milestones for list-view progress calculation
  {
    model: Milestone, as: 'milestones',
    attributes: ['id', 'name', 'status', 'plannedEndDate', 'completionPercentage', 'weightPercentage', 'isDefault', 'parentMilestoneId', 'order'],
    include: [{ model: User, as: 'accountableUser', attributes: ['id', 'name'] }],
  },
];

function canManageProject(user) {
  return ['admin', 'manager', 'senior_manager'].includes(user.role);
}

function isProjectVisible(project, user) {
  const uid = String(user._id ?? user.id);
  if (['admin', 'md', 'director', 'hr_admin', 'final_approver'].includes(user.role)) return true;
  if (String(project.managerId)        === uid) return true;
  if (String(project.ownerId)          === uid) return true;
  if (String(project.accountManagerId) === uid) return true;
  return project.members && project.members.some(m => String(m.userId) === uid);
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

  // TODO: add prefix column to pm_project_types to enable auto-prefix
  // (PmProjectType model currently has no `prefix` field)

  const {
    name, description, purpose, clientName, clientEmail, notifyClient,
    managerId, ownerId, accountManagerId,
    status, billingType, projectType,
    startDate, endDate,
  } = data;

  const project = await Project.create({
    name, description, purpose, clientName, clientEmail, notifyClient,
    managerId,
    ownerId:          ownerId ?? accountManagerId,   // backward compat
    accountManagerId: accountManagerId ?? ownerId,
    status:           status      || 'Yet to Start',
    billingType:      billingType || 'Non-Billable',
    projectType:      projectType || null,
    startDate, endDate,
    createdById: user._id ?? user.id,
  });

  // Auto-create milestones from project type template
  if (project.projectType) {
    try {
      await createDefaultMilestones(project.id, project.projectType);
    } catch (err) {
      // Log the full stack — a silent warning here previously hid a crash that
      // left every new project with zero milestones.
      console.error(
        `[createProject] FAILED to create default milestones for project ${project.id} ` +
        `(type "${project.projectType}"):`, err
      );
    }
  }

  // Email alert: notify on project creation if enabled
  try {
    const PmSettings = require('../../models/pm/PmSettings');
    const alertSettings = await PmSettings.findByPk(1);
    if (alertSettings?.emailAlertOnProjectCreate) {
      const { sendEmail } = require('../../utils/emailService');
      const ccList = alertSettings.reportCcEmails || [];
      if (ccList.length > 0) {
        await sendEmail(
          ccList,
          `[PM] New Project Created: ${project.name}`,
          `<p>A new project <strong>${project.name}</strong> has been created.</p>
           <p>Type: ${project.projectType || 'N/A'} | Manager ID: ${project.managerId || 'TBD'}</p>`,
        );
      }
    }
  } catch (alertErr) {
    console.error('[PM Alert] Failed to send project creation alert:', alertErr.message);
  }

  return project;
};

// Lightweight lookup used by the controller for permission checks (no includes, no visibility filter)
const getProject = async (id) =>
  Project.findByPk(id, { attributes: ['id', 'managerId', 'ownerId'] });

const updateProject = async (id, data, user) => {
  const project = await Project.findByPk(id);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id)) {
    throw new ForbiddenError('Only project manager or admin can update this project');
  }
  // Explicit allowlist keeps updates to known model fields
  const ALLOWED_FIELDS = [
    'name', 'description', 'purpose', 'clientName', 'clientEmail', 'notifyClient',
    'managerId', 'ownerId', 'accountManagerId',
    'status', 'billingType', 'projectType',
    'startDate', 'endDate',           // planned dates — UI should only send on creation
    'actualStartDate', 'actualEndDate', // actual dates — editable post-creation
  ];
  const updateData = {};
  ALLOWED_FIELDS.forEach((key) => { if (key in data) updateData[key] = data[key]; });
  Object.assign(project, updateData);
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
  const delayed = milestones.filter(m => m.status === 'delayed' || (m.plannedEndDate && m.plannedEndDate < today && m.status !== 'completed')).length;
  const upcoming = milestones.filter(m => {
    if (!m.plannedEndDate) return false;
    const diff = Math.round((new Date(m.plannedEndDate) - new Date(today)) / 86400000);
    return diff >= 0 && diff <= 7 && m.status !== 'completed';
  });

  const todayLog = await DailyStatusLog.findOne({ where: { projectId: id, reportDate: today } });

  return { project, stats: { total, completed, inProgress, delayed }, upcoming, todayLog };
};

// ── Members ───────────────────────────────────────────────────────────────────
const getMembers = async (projectId, user) => {
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId', 'accountManagerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  if (!isProjectVisible(project, user)) throw new ForbiddenError('Access denied to this project');
  return ProjectMember.findAll({
    where: { projectId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation', 'role'] }],
  });
};

// ── Allocation helpers (Phase 0: hours/day; Phase 1: calendar-aware) ─────────
// `calendar` is { hoursPerDay, workingSaturdays, holidays } from
// pmSettingsService.getCalendar(). A bare number is still accepted.

/** Plain hours/day number from a calendar (or a bare number). */
const capOf = (calendar) => normaliseCalendar(calendar).hoursPerDay;

/**
 * Effective hours/day for a membership row. Rows never converted by migration
 * 039 (hoursPerDay NULL) fall back to allocationPct × capacity / 100.
 */
const effectiveHours = (row, calendar) => {
  const capacity = capOf(calendar);
  if (row.hoursPerDay != null) return Number(row.hoursPerDay);
  if (row.allocationPct != null) return Math.round(Number(row.allocationPct) * capacity / 100 * 2) / 2;
  return null;
};

/** Shape a ProjectMember row (with optional `project` include) as an engine allocation. */
const toAllocation = (row, calendar) => {
  const capacity = capOf(calendar);
  const hours = effectiveHours(row, capacity);
  return {
    projectId:        row.projectId,
    projectName:      row.project?.name,
    projectStatus:    row.project?.status,
    projectManagerId: row.project?.managerId,
    hoursPerDay:      hours,
    allocationPct:    toPct(hours, capacity),
    allocationMode:   row.allocationMode || 'per_day',
    allocationTotalHours: row.allocationTotalHours == null ? null : Number(row.allocationTotalHours),
    allocationFrom:   row.allocationFrom,
    allocationTo:     row.allocationTo,
    allocationStatus: row.allocationStatus,
    isEstimated:      row.hoursConfirmed !== true,
  };
};

const isBlank = (v) => v === undefined || v === null || v === '';

/** True when the body carries any allocation amount input (mode / hours / total / legacy pct). */
const hasAllocationInput = (data) =>
  !isBlank(data.allocationMode) || !isBlank(data.hoursPerDay) ||
  !isBlank(data.allocationTotalHours) || !isBlank(data.allocationPct);

/**
 * Resolve the allocation to store from a request body + (optional) existing row.
 *
 * Returns null when nothing about the allocation amount changes, otherwise
 * { mode, hoursPerDay, totalHours, explicit }:
 *   • body carries mode / hoursPerDay / allocationTotalHours / allocationPct
 *     → resolveAllocation over the (new or stored) window; explicit = true
 *   • body changes only dates and the stored mode is 'total'
 *     → hoursPerDay re-derived from the stored total over the new window
 *   • body changes only dates and the stored mode is 'per_day'
 *     → allocationTotalHours re-derived from the stored hoursPerDay (no re-validation)
 * Throws ValidationError when the engine rejects the input.
 */
const resolveMemberAllocation = (data, existing, allocationFrom, allocationTo, calendar) => {
  const capacity = capOf(calendar);

  if (hasAllocationInput(data)) {
    let hoursPerDay = data.hoursPerDay;
    if (isBlank(hoursPerDay) && !isBlank(data.allocationPct)) {
      hoursPerDay = Math.round(Number(data.allocationPct) * capacity / 100 * 2) / 2;   // legacy %
    }
    let totalHours = data.allocationTotalHours;
    // Mode: explicit, else 'total' only when a total (and no hours/day) was sent — default per_day.
    let mode = data.allocationMode;
    if (isBlank(mode)) mode = (isBlank(hoursPerDay) && !isBlank(totalHours)) ? 'total' : 'per_day';
    if (mode !== 'per_day' && mode !== 'total') throw new ValidationError("allocationMode must be 'per_day' or 'total'");
    // Only the mode was sent → keep the stored amount for that mode
    if (existing) {
      if (mode === 'total'   && isBlank(totalHours))  totalHours  = existing.allocationTotalHours;
      if (mode === 'per_day' && isBlank(hoursPerDay)) hoursPerDay = existing.hoursPerDay;
    }
    const r = resolveAllocation({ allocationMode: mode, hoursPerDay, allocationTotalHours: totalHours, allocationFrom, allocationTo }, calendar);
    if (!r.ok) throw new ValidationError(r.error);
    return { mode: r.mode, hoursPerDay: r.hoursPerDay, totalHours: r.totalHours, explicit: true };
  }

  const datesChanged = existing && ('allocationFrom' in data || 'allocationTo' in data);
  if (!datesChanged) return null;

  if (existing.allocationMode === 'total' && existing.allocationTotalHours != null) {
    const r = resolveAllocation(
      { allocationMode: 'total', allocationTotalHours: existing.allocationTotalHours, allocationFrom, allocationTo },
      calendar
    );
    if (!r.ok) throw new ValidationError(r.error);
    return { mode: 'total', hoursPerDay: r.hoursPerDay, totalHours: r.totalHours, explicit: false };
  }
  const hpd = effectiveHours(existing, calendar);
  if (hpd == null) return null;
  const wd = allocationFrom && allocationTo ? workingDaysBetween(allocationFrom, allocationTo, calendar) : null;
  return { mode: 'per_day', hoursPerDay: hpd, totalHours: wd != null ? Math.round(hpd * wd * 10) / 10 : null, explicit: false };
};

/** The user's other active memberships (all projects), optionally excluding one row. */
const getOtherActiveAllocations = async (userId, calendar, excludeMemberId = null) => {
  const where = { userId };
  if (excludeMemberId) where.id = { [Op.ne]: excludeMemberId };
  const rows = await ProjectMember.findAll({
    where,
    include: [{
      model: Project, as: 'project',
      attributes: ['id', 'name', 'status', 'managerId'],
      where: { status: { [Op.notIn]: INACTIVE_PROJECT_STATUSES } },
      required: true,
    }],
  });
  return rows.map(r => toAllocation(r, calendar));
};

/** Throws AllocationConflictError when the proposed allocation exceeds capacity on any working day. */
const assertNoConflict = async (userId, proposed, calendar, excludeMemberId = null) => {
  if (proposed.hoursPerDay == null) return;
  const others = await getOtherActiveAllocations(userId, calendar, excludeMemberId);
  const result = checkConflict(others, proposed, calendar);
  if (!result.ok) throw new AllocationConflictError(result, capOf(calendar));
};

const addMember = async (projectId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id)) {
    throw new ForbiddenError('Only project manager or admin can add members');
  }
  if (!data.userId) throw new ValidationError('userId is required');

  const calendar = await pmSettingsService.getCalendar();
  const capacity = calendar.hoursPerDay;

  const existing = await ProjectMember.findOne({ where: { projectId, userId: data.userId } });

  const allocationFrom = data.allocationFrom ?? existing?.allocationFrom ?? null;
  const allocationTo   = data.allocationTo   ?? existing?.allocationTo   ?? null;
  const resolved = resolveMemberAllocation(data, existing, allocationFrom, allocationTo, calendar);
  const effective = resolved ? resolved.hoursPerDay : (existing ? effectiveHours(existing, capacity) : null);

  // Conflict check against every OTHER membership (excluding this project's row if re-adding)
  await assertNoConflict(
    data.userId,
    { hoursPerDay: effective, allocationFrom, allocationTo, projectId },
    calendar,
    existing?.id ?? null
  );

  if (!existing) {
    return ProjectMember.create({
      projectId,
      userId:           data.userId,
      role:             data.role,
      responsibilities: data.responsibilities,
      allocationMode:   resolved ? resolved.mode : 'per_day',
      hoursPerDay:      resolved ? resolved.hoursPerDay : null,
      allocationTotalHours: resolved ? resolved.totalHours : null,
      allocationPct:    resolved ? Math.round(toPct(resolved.hoursPerDay, capacity)) : null,
      hoursConfirmed:   Boolean(resolved),
      allocationFrom,
      allocationTo,
    });
  }

  // Member already existed → update allocation fields if provided
  if (resolved) {
    existing.allocationMode       = resolved.mode;
    existing.hoursPerDay          = resolved.hoursPerDay;
    existing.allocationTotalHours = resolved.totalHours;
    existing.allocationPct        = Math.round(toPct(resolved.hoursPerDay, capacity));
    if (resolved.explicit) existing.hoursConfirmed = true;
  }
  if (data.allocationFrom) existing.allocationFrom = data.allocationFrom;
  if (data.allocationTo)   existing.allocationTo   = data.allocationTo;
  if (resolved || data.allocationFrom || data.allocationTo) await existing.save();
  return existing;
};

const MEMBER_UPDATE_FIELDS = [
  'role', 'responsibilities', 'allocationFrom', 'allocationTo', 'allocationStatus',
  // allocation amount fields — always overwritten by the resolved values below
  'allocationMode', 'allocationTotalHours',
];

const updateMember = async (projectId, memberId, data, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id))
    throw new ForbiddenError('Only project manager or admin can update members');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');

  const calendar = await pmSettingsService.getCalendar();
  const capacity = calendar.hoursPerDay;

  const updateData = {};
  MEMBER_UPDATE_FIELDS.forEach((key) => { if (key in data) updateData[key] = data[key]; });

  // Resolve the allocation over the resulting window (new dates win over stored ones)
  const allocationFrom = 'allocationFrom' in data ? (data.allocationFrom || null) : member.allocationFrom;
  const allocationTo   = 'allocationTo'   in data ? (data.allocationTo   || null) : member.allocationTo;
  const resolved = resolveMemberAllocation(data, member, allocationFrom, allocationTo, calendar);
  if (resolved) {
    updateData.allocationMode       = resolved.mode;
    updateData.hoursPerDay          = resolved.hoursPerDay;
    updateData.allocationTotalHours = resolved.totalHours;
    updateData.allocationPct        = Math.round(toPct(resolved.hoursPerDay, capacity));
    if (resolved.explicit) updateData.hoursConfirmed = true;
  } else {
    // No amount change → never let raw body values drift the stored mode/total
    delete updateData.allocationMode;
    delete updateData.allocationTotalHours;
  }

  // Conflict check on the resulting state, excluding this row itself
  const next = { ...member.get({ plain: true }), ...updateData };
  await assertNoConflict(
    member.userId,
    {
      hoursPerDay:    effectiveHours(next, capacity),
      allocationFrom: next.allocationFrom,
      allocationTo:   next.allocationTo,
      projectId,
    },
    calendar,
    member.id
  );

  Object.assign(member, updateData);
  await member.save();
  return member;
};

/** PM confirms the (migration-prefilled) hours/day figure is right. */
const confirmMemberHours = async (projectId, memberId, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id))
    throw new ForbiddenError('Only project manager or admin can update members');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');
  member.hoursConfirmed = true;
  await member.save();
  return member;
};

const removeMember = async (projectId, memberId, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id))
    throw new ForbiddenError('Only project manager or admin can remove members');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');
  await member.destroy();
};

// ── Notification Recipients ───────────────────────────────────────────────────
const getRecipients = async (projectId, user) => {
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId', 'accountManagerId'],
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
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id))
    throw new ForbiddenError('Only project manager can manage recipients');
  return ProjectNotificationRecipient.create({ projectId, ...data });
};

const removeRecipient = async (projectId, recipientId, user) => {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'managerId'] });
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id))
    throw new ForbiddenError('Only project manager can manage recipients');
  const r = await ProjectNotificationRecipient.findOne({ where: { id: recipientId, projectId } });
  if (!r) throw new NotFoundError('Recipient');
  await r.destroy();
};

module.exports = {
  getProjects, getProjectById, getProject, createProject, updateProject, deleteProject, getProjectSummary,
  getMembers, addMember, updateMember, confirmMemberHours, removeMember,
  getRecipients, addRecipient, removeRecipient,
  // allocation helpers shared with the controller
  effectiveHours, toAllocation, getOtherActiveAllocations, INACTIVE_PROJECT_STATUSES,
};
