const { Op } = require('sequelize');
const sequelize = require('../../config/database');   // the INSTANCE — never `{ sequelize }`
const Project = require('../../models/pm/Project');
const ProjectMember = require('../../models/pm/ProjectMember');
const AllocationSegment = require('../../models/pm/AllocationSegment');
const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
const Milestone = require('../../models/pm/Milestone');
const Task = require('../../models/pm/Task');
const DailyStatusLog = require('../../models/pm/DailyStatusLog');
const ProjectNotificationRecipient = require('../../models/pm/ProjectNotificationRecipient');
const User = require('../../models/User');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError, AllocationConflictError } = require('../../utils/errors');
const pmSettingsService = require('./pmSettings.service');
const alloc = require('./allocation.service');   // the ONE segment loader + writers (B1)
// Helpdesk ticket exceptions share this flow (migration 047). models/helpdesk/index
// declares the approval ↔ ticket association and requires nothing from services,
// so there is no circular load.
const { HdTicket } = require('../../models/helpdesk');
const ticketException = require('./ticketException.service');
const { createDefaultMilestones } = require('./milestone.service');
const { checkConflict, summarise, toPct, toDate, normaliseCalendar, resolveAllocation, workingDaysBetween, iso } = require('../../utils/capacityEngine');

const INACTIVE_PROJECT_STATUSES = ['completed', 'cancelled', 'closed'];

// Who approved an exception (for the "Exception approved (by X)" chip); absent otherwise.
// NOTE: a fresh object per use — MySQL rejects two joins that end up with the same
// alias path, and Sequelize derives that path from the shared include object.
const exceptionApprovalInclude = () => ({
  model: PmAllocationApproval, as: 'exceptionApproval', required: false,
  attributes: ['id', 'status', 'approvedById', 'approverNote'],
  include: [{ model: User, as: 'approvedBy', attributes: ['id', 'name'], required: false }],
});

// A member's time-phased periods (pm_allocation_segments). The member-level
// allocation columns stay in the payload — they are a MIRROR of these (S3).
// The approver name is read from the MEMBER's exceptionApproval (mirrored), so the
// segment join stays flat: two nested 'exceptionApproval' joins collide in MySQL.
const SEGMENTS_INCLUDE = {
  model: AllocationSegment, as: 'segments', required: false,
};
const SEGMENTS_ORDER = [{ model: ProjectMember, as: 'members' }, { model: AllocationSegment, as: 'segments' }, 'fromDate', 'ASC'];

const PROJECT_INCLUDE = [
  { model: User, as: 'owner',          attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'accountManager', attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'projectManager', attributes: ['id', 'name', 'email', 'designation'] },
  { model: User, as: 'createdBy',      attributes: ['id', 'name'] },
  {
    model: ProjectMember, as: 'members',
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation', 'role'] },
      exceptionApprovalInclude(),
      SEGMENTS_INCLUDE,
    ],
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
      SEGMENTS_ORDER,
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
      SEGMENTS_ORDER,
    ],
  });
  if (!project) throw new NotFoundError('Project');
  if (!isProjectVisible(project, user)) throw new ForbiddenError('Access denied to this project');
  return project;
};

/** Visibility gate for read endpoints that do not need the full project (segments, grid, history). */
const assertProjectVisible = async (projectId, user) => {
  const project = await Project.findByPk(projectId, {
    attributes: ['id', 'managerId', 'ownerId', 'accountManagerId'],
    include: [{ model: ProjectMember, as: 'members', attributes: ['userId'] }],
  });
  if (!project) throw new NotFoundError('Project');
  if (!isProjectVisible(project, user)) throw new ForbiddenError('Access denied to this project');
  return project;
};

/**
 * A project name must be unique. Compared case-insensitively and ignoring extra
 * spaces, so "CRM Portal" and " crm  portal " are the same name. Applies to every
 * create path (PM page, the ticket form's "Other Project", any API client) and to
 * renames. Throws ConflictError(409) naming the existing project.
 */
const assertNameIsFree = async (name, excludeProjectId = null) => {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) throw new ValidationError('Project name is required');
  // A LIKE on the collapsed name would miss rows stored with doubled or padded
  // spaces, so compare in SQL with every run of whitespace collapsed on BOTH sides.
  // Wildcards in the typed name are escaped; MySQL LIKE is case-insensitive here.
  const likeSafe = clean.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await Project.findAll({
    where: sequelize.where(
      sequelize.fn('TRIM', sequelize.fn('REGEXP_REPLACE', sequelize.col('name'), '[[:space:]]+', ' ')),
      { [Op.like]: likeSafe }
    ),
    attributes: ['id', 'name', 'status', 'isProduct', 'isOperations'],
  });
  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const clash = rows.find(p => norm(p.name) === norm(clean) && String(p.id) !== String(excludeProjectId ?? ''));
  if (clash) {
    throw new ConflictError(
      `A project named "${clash.name}" already exists (${clash.status || 'no status'}). Pick a different name or use the existing project.`
    );
  }
  return clean;
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
    isProduct, isOperations,
  } = data;

  // Usage flags. Neither sent → Product (the historical behaviour). An
  // Operations-only project gets NO default milestones; Product (alone or with
  // Operations) does.
  // Returns the collapsed name — store THAT, so no new row is created with padding.
  const cleanName = await assertNameIsFree(name);

  const bool = (v, dflt) => (v === undefined || v === null || v === '' ? dflt : (v === true || v === 'true' || v === 1 || v === '1'));
  let product    = bool(isProduct, isOperations === undefined ? true : false);
  const operations = bool(isOperations, false);
  if (!product && !operations) product = true;   // never create a project that belongs nowhere

  const project = await Project.create({
    name: cleanName, description, purpose, clientName, clientEmail, notifyClient,
    managerId,
    ownerId:          ownerId ?? accountManagerId,   // backward compat
    accountManagerId: accountManagerId ?? ownerId,
    status:           status      || 'Yet to Start',
    billingType:      billingType || 'Non-Billable',
    projectType:      projectType || null,
    isProduct:        product,
    isOperations:     operations,
    startDate, endDate,
    createdById: user._id ?? user.id,
  });

  // Auto-create milestones from project type template — Product projects only.
  if (project.projectType && product) {
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
    'isProduct', 'isOperations',      // usage flags — milestones are only created at creation time
    'startDate', 'endDate',           // planned dates — UI should only send on creation
    'actualStartDate', 'actualEndDate', // actual dates — editable post-creation
  ];
  const updateData = {};
  ALLOWED_FIELDS.forEach((key) => { if (key in data) updateData[key] = data[key]; });
  // A rename must not collide with another project
  if ('name' in updateData) updateData.name = await assertNameIsFree(updateData.name, project.id);

  // Turning Product ON later must still give the project its plan — milestones are
  // otherwise only created at creation time, which would leave it permanently empty.
  const turningProductOn = 'isProduct' in updateData
    && (updateData.isProduct === true || updateData.isProduct === 'true' || updateData.isProduct === 1 || updateData.isProduct === '1')
    && project.isProduct !== true;

  Object.assign(project, updateData);
  await project.save();

  if (turningProductOn && project.projectType) {
    const existing = await Milestone.count({ where: { projectId: project.id } });
    if (existing === 0) {
      try {
        await createDefaultMilestones(project.id, project.projectType);
      } catch (err) {
        console.error(`[updateProject] FAILED to create default milestones for ${project.id}:`, err);
      }
    }
  }
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
  await assertProjectVisible(projectId, user);
  return ProjectMember.findAll({
    where: { projectId },
    include: [
      { model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation', 'role'] },
      SEGMENTS_INCLUDE,
    ],
    order: [[{ model: AllocationSegment, as: 'segments' }, 'fromDate', 'ASC']],
  });
};

/** One member row with its segments (what every member write returns). */
const loadMember = (memberId, options = {}) =>
  ProjectMember.findByPk(memberId, {
    include: [SEGMENTS_INCLUDE],
    order: [[{ model: AllocationSegment, as: 'segments' }, 'fromDate', 'ASC']],
    ...options,
  });

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

/**
 * Legacy shape of a ProjectMember SUMMARY row as an engine allocation. Kept for
 * older callers only — real load arithmetic goes through the segment loader
 * (getOtherActiveAllocations / alloc.loadSegmentsForUsers). segmentId is null.
 */
const toAllocation = (row, calendar) => {
  const capacity = capOf(calendar);
  const hours = effectiveHours(row, capacity);
  return {
    segmentId:        null,
    memberId:         row.id,
    projectId:        row.projectId,
    projectName:      row.project?.name,
    projectStatus:    row.project?.status,
    projectManagerId: row.project?.managerId,
    userId:           row.userId,
    hoursPerDay:      hours,
    allocationPct:    toPct(hours, capacity),
    allocationMode:   row.allocationMode || 'per_day',
    allocationTotalHours: row.allocationTotalHours == null ? null : Number(row.allocationTotalHours),
    allocationFrom:   row.allocationFrom,
    allocationTo:     row.allocationTo,
    allocationStatus: row.allocationStatus,
    exceptionStatus:  row.exceptionStatus || 'none',
    isEstimated:      row.hoursConfirmed !== true,
  };
};

const isBlank = (v) => v === undefined || v === null || v === '';

/** True when the body carries an allocation AMOUNT (hours / total / legacy pct). A bare mode is not an amount. */
const hasAllocationAmount = (data = {}) =>
  !isBlank(data.hoursPerDay) || !isBlank(data.allocationTotalHours) || !isBlank(data.allocationPct);

/** True when the body touches the allocation window or amount (anything a segment owns). */
const hasAllocationInput = (data = {}) =>
  hasAllocationAmount(data) || !isBlank(data.allocationMode) ||
  !isBlank(data.allocationFrom) || !isBlank(data.allocationTo) ||
  !isBlank(data.fromDate) || !isBlank(data.toDate);

const dateOnly = (v) => (v == null || v === '' ? null : (v instanceof Date ? iso(v) : String(v).slice(0, 10)));

/**
 * Body for the segment writers from a legacy member body. Both spellings are
 * passed (allocationFrom/To and fromDate/toDate) so CreateProject / Team-add
 * keep sending exactly what they send today.
 */
const segmentBodyFrom = (data, fromDate, toDate) => ({
  allocationMode:       isBlank(data.allocationMode) ? undefined : data.allocationMode,
  hoursPerDay:          isBlank(data.hoursPerDay) ? undefined : data.hoursPerDay,
  allocationTotalHours: isBlank(data.allocationTotalHours) ? undefined : data.allocationTotalHours,
  allocationPct:        isBlank(data.allocationPct) ? undefined : data.allocationPct,
  note:                 isBlank(data.note) ? undefined : data.note,
  fromDate, toDate,
  allocationFrom: fromDate, allocationTo: toDate,
});

/**
 * A segment needs both dates. Legacy bodies may carry hours without dates —
 * same fallback as migration 045: from = max(project.startDate, today),
 * to = project.endDate when ≥ from, else from + 90 days.
 */
const defaultWindowFor = (project) => {
  const today = toDate(new Date());
  const start = toDate(project?.startDate);
  const from  = start && start > today ? start : today;
  let to = toDate(project?.endDate);
  if (!to || to < from) to = new Date(from.getTime() + 90 * 86400000);
  return { fromDate: iso(from), toDate: iso(to) };
};

/**
 * The user's counted load: every project SEGMENT plus every open helpdesk TICKET
 * assigned to them. Both count — otherwise the availability card, the conflict
 * check and the utilisation heat map disagree for anyone carrying tickets.
 * D1: only 'none' / 'approved' exception states count. Signature-compatible with
 * the pre-segment version: `excludeMemberId` drops every segment of that member;
 * `excludeSegmentId` drops one segment (the one being edited — S2).
 */
const getOtherActiveAllocations = async (userId, calendar, excludeMemberId = null, excludeSegmentId = null, opts = {}) => {
  const rows = await alloc.loadAllocationsForUsers([userId], { countedOnly: true, excludeSegmentId, calendar, ...opts });
  return excludeMemberId ? rows.filter(a => a.source === 'helpdesk' || String(a.memberId) !== String(excludeMemberId)) : rows;
};

const assertMayManageMembers = async (projectId, user, verb = 'update') => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== String(user._id ?? user.id))
    throw new ForbiddenError(`Only project manager or admin can ${verb} members`);
  return project;
};

/**
 * Route a legacy allocation body (hours + window on the MEMBER) to the member's
 * segments: exactly one segment → update it; none → add one; several → 400.
 */
const writeAllocationViaSegments = async (project, member, data, user) => {
  const segments = await alloc.listSegments(project.id, member.id);
  if (segments.length > 1) throw new ValidationError('This member has several periods — edit the period');
  const only = segments[0] || null;

  let fromDate = dateOnly(data.allocationFrom ?? data.fromDate) || dateOnly(only?.fromDate);
  let toDate   = dateOnly(data.allocationTo   ?? data.toDate)   || dateOnly(only?.toDate);
  if (!fromDate || !toDate) {
    const fallback = defaultWindowFor(project);
    fromDate = fromDate || fallback.fromDate;
    toDate   = toDate   || fallback.toDate;
  }
  const body = segmentBodyFrom(data, fromDate, toDate);
  if (only) return alloc.updateSegment(project.id, member.id, only.id, body, user);
  if (!hasAllocationAmount(data)) throw new ValidationError('hoursPerDay or allocationTotalHours is required to add a period');
  return alloc.addSegment(project.id, member.id, body, user);
};

/**
 * Add a member (role / responsibilities) and, when the body carries hours, its
 * FIRST period via the segment service — same body CreateProject / Team-add
 * send today. A 409 from the conflict check leaves no member row behind.
 * Re-adding an existing member routes the allocation to its single segment.
 */
const addMember = async (projectId, data, user) => {
  const project = await assertMayManageMembers(projectId, user, 'add');
  if (!data.userId) throw new ValidationError('userId is required');

  const existing = await ProjectMember.findOne({ where: { projectId, userId: data.userId } });
  if (existing?.exceptionStatus === 'pending') {
    throw new ConflictError('This member has a pending allocation exception — decide it before changing the allocation');
  }

  if (existing) {
    // Re-add path: refresh role / responsibilities, route allocation fields to the single segment
    if ('role' in data && !isBlank(data.role)) existing.role = data.role;
    if ('responsibilities' in data)            existing.responsibilities = data.responsibilities;
    if (existing.changed()) await existing.save();
    if (hasAllocationAmount(data) || !isBlank(data.allocationFrom) || !isBlank(data.allocationTo)) {
      await writeAllocationViaSegments(project, existing, data, user);
    }
    return loadMember(existing.id);
  }

  const member = await ProjectMember.create({
    projectId,
    userId:           data.userId,
    role:             data.role,
    responsibilities: data.responsibilities,
  });
  if (hasAllocationAmount(data)) {
    try {
      await writeAllocationViaSegments(project, member, data, user);
    } catch (e) {
      // Keep the old atomic behaviour: a rejected first period → no member row
      await member.destroy().catch(() => {});
      throw e;
    }
  }
  return loadMember(member.id);
};

/**
 * Member edit = role / responsibilities. Allocation fields in the body are
 * routed to the member's single segment (exactly one), added when it has none,
 * or refused with 400 "This member has several periods — edit the period".
 */
const updateMember = async (projectId, memberId, data, user) => {
  const project = await assertMayManageMembers(projectId, user, 'update');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');
  if (member.exceptionStatus === 'pending') {
    throw new ConflictError('This member has a pending allocation exception — decide it before changing the allocation');
  }

  if ('role' in data)             member.role = data.role;
  if ('responsibilities' in data) member.responsibilities = data.responsibilities;
  if (member.changed()) await member.save();

  if (hasAllocationInput(data)) await writeAllocationViaSegments(project, member, data, user);
  return loadMember(member.id);
};

/** PM confirms the (migration-prefilled) hours/day figure is right — every segment. */
const confirmMemberHours = async (projectId, memberId, user) => {
  await assertMayManageMembers(projectId, user, 'update');
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId } });
  if (!member) throw new NotFoundError('Project Member');
  await alloc.confirmAllSegments(projectId, memberId, user);
  return loadMember(memberId);
};

/** Remove a member: history 'remove' (before = member + its segments), then destroy (segments cascade). */
const removeMember = async (projectId, memberId, user) => {
  await assertMayManageMembers(projectId, user, 'remove');
  const member = await loadMember(memberId);
  if (!member || String(member.projectId) !== String(projectId)) throw new NotFoundError('Project Member');
  await sequelize.transaction(async (t) => {
    const plain = member.get({ plain: true });
    await alloc.logAllocation({
      projectId, memberId, segmentId: null, userId: member.userId,
      action: 'remove',
      before: { member: snapshotOf(member), segments: (plain.segments || []).map(s => segmentSnapshot(s)) },
      after:  null,
      byId:   uidOf(user),
    }, t);
    await member.destroy({ transaction: t });
  });
};

// ── Allocation exceptions (over-capacity with approval) ──────────────────────
//
// D1 pending exceptions never count towards capacity (see getOtherActiveAllocations)
// D2 requested hours/day ≤ pm_settings.exceptionMaxHoursPerDay
// D3 approvers = pm_settings.exceptionApproverRoles, never the requester

/** Member columns captured for history rows (the mirrored summary + role). */
const SNAPSHOT_FIELDS = [
  'role', 'responsibilities', 'allocationMode', 'hoursPerDay', 'allocationTotalHours', 'allocationPct',
  'hoursConfirmed', 'allocationFrom', 'allocationTo', 'allocationStatus', 'exceptionStatus', 'exceptionApprovalId',
];
const plainOf = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : (row || {}));
const pick = (plain, fields) => {
  const out = {};
  for (const k of fields) {
    const v = plain[k];
    out[k] = v instanceof Date ? iso(v) : (v === undefined ? null : v);   // local date, never toISOString
  }
  return out;
};
const snapshotOf = (member) => pick(plainOf(member), SNAPSHOT_FIELDS);

/** Segment columns captured before an exception request so a decline can put the period back exactly. */
const SEGMENT_SNAPSHOT_FIELDS = [
  'fromDate', 'toDate', 'allocationMode', 'hoursPerDay', 'allocationTotalHours',
  'hoursConfirmed', 'exceptionStatus', 'exceptionApprovalId', 'note',
];
const segmentSnapshot = (segment) => {
  const plain = plainOf(segment);
  const snap = pick(plain, SEGMENT_SNAPSHOT_FIELDS);
  snap.id = plain.id ?? null;
  snap.hoursPerDay          = snap.hoursPerDay == null ? null : Number(snap.hoursPerDay);
  snap.allocationTotalHours = snap.allocationTotalHours == null ? null : Number(snap.allocationTotalHours);
  snap.hoursConfirmed       = Boolean(snap.hoursConfirmed);
  return snap;
};

/**
 * previousSnapshot wrapper stored on an exception approval:
 *   { memberCreated: bool, segment: {...segment fields}|null }
 * memberCreated → the request created the member row (it had no other segment)
 * segment null  → the request created the segment (reject/cancel deletes it)
 * Pre-segment approvals (null | flat member fields) are normalised here.
 */
const readPreviousSnapshot = (raw) => {
  if (raw && typeof raw === 'object' && 'segment' in raw) {
    return { memberCreated: Boolean(raw.memberCreated), segment: raw.segment || null };
  }
  if (!raw) return { memberCreated: true, segment: null };
  // legacy flat member snapshot → the member existed; restore the period from its summary fields
  return {
    memberCreated: false,
    segment: {
      fromDate: raw.allocationFrom ?? null, toDate: raw.allocationTo ?? null,
      allocationMode: raw.allocationMode ?? 'per_day',
      hoursPerDay: raw.hoursPerDay ?? null, allocationTotalHours: raw.allocationTotalHours ?? null,
      hoursConfirmed: raw.hoursConfirmed ?? true,
      exceptionStatus: raw.exceptionStatus ?? 'none', exceptionApprovalId: raw.exceptionApprovalId ?? null,
      note: null,
    },
  };
};

const fmtShort = (s) => toDate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const overlaps = (aFrom, aTo, bFrom, bTo) => !(toDate(aTo) < toDate(bFrom) || toDate(bTo) < toDate(aFrom));

const APPROVAL_INCLUDE = [
  // The requested period, so the inbox can show its dates and note.
  { model: AllocationSegment, as: 'segment', required: false,
    attributes: ['id', 'fromDate', 'toDate', 'hoursPerDay', 'allocationMode', 'allocationTotalHours', 'note'] },
  { model: Project, as: 'project',     attributes: ['id', 'name', 'status', 'managerId'] },
  // Ticket exceptions (migration 047): projectId/segmentId are NULL and this is set.
  { model: HdTicket, as: 'ticket',     required: false, attributes: ['id', 'reqNumber', 'title'] },
  { model: User,    as: 'user',        attributes: ['id', 'name', 'email'] },
  { model: User,    as: 'requestedBy', attributes: ['id', 'name', 'email'] },
  { model: User,    as: 'approvedBy',  attributes: ['id', 'name', 'email'] },
];

const uidOf = (user) => String(user._id ?? user.id);

/**
 * Ask for an over-capacity allocation on a project — on ONE SEGMENT.
 *
 * body: { userId, memberId?, segmentId?, hoursPerDay | allocationMode + allocationTotalHours,
 *         allocationFrom?, allocationTo?, role?, responsibilities?, reason }
 *
 * Target segment: body.segmentId → that segment (dates default to its own);
 * else a segment of the member with exactly the requested window; else a NEW
 * pending segment (S1: it must not overlap the member's other periods → 400).
 * The segment is written with the requested hours in a PENDING state (never
 * counted elsewhere — D1) and a pm_allocation_approvals row of requestType
 * 'exception' is raised with approval.segmentId and
 * previousSnapshot = { memberCreated, segment: {...}|null }.
 * Returns { member, segment, approval, project, user, overload }.
 */
const requestAllocationException = async (projectId, body = {}, user) => {
  const project = await Project.findByPk(projectId);
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(user) && String(project.managerId) !== uidOf(user)) {
    throw new ForbiddenError('Only project manager or admin can request an allocation exception');
  }
  if (!body.userId) throw new ValidationError('userId is required');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) throw new ValidationError('reason is required');

  // Existing member for this person on this project (by memberId when given)
  const existing = body.memberId
    ? await ProjectMember.findOne({ where: { id: body.memberId, projectId } })
    : await ProjectMember.findOne({ where: { projectId, userId: body.userId } });
  if (body.memberId && !existing) throw new NotFoundError('Project Member');
  if (existing && String(existing.userId) !== String(body.userId)) throw new ValidationError('memberId does not belong to userId');

  // Segment addressed by the request (explicit id, else exact-window match below)
  let target = null;
  if (!isBlank(body.segmentId)) {
    if (!existing) throw new NotFoundError('Allocation period');
    target = await AllocationSegment.findOne({ where: { id: body.segmentId, memberId: existing.id } });
    if (!target) throw new NotFoundError('Allocation period');
  }
  const fromDate = dateOnly(body.allocationFrom ?? body.fromDate) || dateOnly(target?.fromDate);
  const toDate_  = dateOnly(body.allocationTo   ?? body.toDate)   || dateOnly(target?.toDate);
  if (!fromDate || !toDate_) throw new ValidationError('allocationFrom and allocationTo are required');

  const targetUser = await User.findByPk(body.userId, { attributes: ['id', 'name', 'email'] });
  if (!targetUser) throw new NotFoundError('User');

  const calendar = await pmSettingsService.getCalendar();
  const capacity = calendar.hoursPerDay;
  const { maxHoursPerDay: exceptionCap } = await pmSettingsService.getExceptionPolicy();

  // Resolve the requested amount against the EXCEPTION cap, not the working-day cap
  let hoursPerDay = body.hoursPerDay;
  if (isBlank(hoursPerDay) && !isBlank(body.allocationPct)) {
    hoursPerDay = Math.round(Number(body.allocationPct) * capacity / 100 * 2) / 2;   // legacy %
  }
  let mode = body.allocationMode;
  if (isBlank(mode)) mode = (isBlank(hoursPerDay) && !isBlank(body.allocationTotalHours)) ? 'total' : 'per_day';
  if (mode !== 'per_day' && mode !== 'total') throw new ValidationError("allocationMode must be 'per_day' or 'total'");
  if (mode === 'per_day' && Number(hoursPerDay) > exceptionCap) {
    throw new ValidationError(`Exceeds the exception cap of ${exceptionCap} hrs/day`);
  }
  const r = resolveAllocation(
    { allocationMode: mode, hoursPerDay, allocationTotalHours: body.allocationTotalHours, allocationFrom: fromDate, allocationTo: toDate_ },
    { ...calendar, hoursPerDay: exceptionCap }
  );
  if (!r.ok) throw new ValidationError(r.error);
  if (r.hoursPerDay > exceptionCap) throw new ValidationError(`Exceeds the exception cap of ${exceptionCap} hrs/day`);

  // The member's periods: one pending at a time; S1 for a new period
  const siblings = existing ? await AllocationSegment.findAll({ where: { memberId: existing.id }, order: [['fromDate', 'ASC']] }) : [];
  if (siblings.some(s => s.exceptionStatus === 'pending')) throw new ConflictError('An allocation exception is already pending for this member');
  if (!target && existing) {
    target = siblings.find(s => dateOnly(s.fromDate) === fromDate && dateOnly(s.toDate) === toDate_) || null;
  }
  if (!target) {
    const clash = siblings.find(s => overlaps(s.fromDate, s.toDate, fromDate, toDate_));
    if (clash) throw new ValidationError(`Overlaps an existing period ${fmtShort(clash.fromDate)}–${fmtShort(clash.toDate)}`);
  }

  // It must actually NOT fit — otherwise a normal save is the right call (S2: exclude the segment being edited)
  const proposed = { hoursPerDay: r.hoursPerDay, allocationFrom: fromDate, allocationTo: toDate_, projectId };
  const others = await getOtherActiveAllocations(body.userId, calendar, null, target?.id ?? null);
  const check  = checkConflict(others, proposed, calendar);
  if (check.ok) throw new ValidationError('No exception needed — this allocation fits');
  const overloadHours = check.suggestions?.overloadHours ?? Math.max(0, Math.round((check.peak - capacity) * 10) / 10);
  // D2 — the cap is on the person's TOTAL daily load (existing + requested), not on this
  // request alone: "never more than N hours a day".
  if (check.peak > exceptionCap) {
    throw new ValidationError(
      `Exceeds the exception cap of ${exceptionCap} hrs/day: this would put ${check.peak} hrs/day on the person`
    );
  }

  const segmentValues = {
    fromDate, toDate: toDate_,
    allocationMode:       r.mode,
    hoursPerDay:          r.hoursPerDay,
    allocationTotalHours: r.totalHours,
    hoursConfirmed:       false,
    exceptionStatus:      'pending',
  };
  const allocationPct = Math.min(255, Math.round(toPct(r.hoursPerDay, capacity)));   // approvals.allocationPct is NOT NULL

  const { member, segment, approval } = await sequelize.transaction(async (t) => {
    let member = existing;
    const memberCreated = !existing;
    if (!member) {
      member = await ProjectMember.create({
        projectId, userId: body.userId,
        role: body.role ?? null, responsibilities: body.responsibilities ?? null,
        allocationStatus: 'pending',
      }, { transaction: t });
    } else {
      if (!isBlank(body.role))                 member.role = body.role;
      if (!isBlank(body.responsibilities))     member.responsibilities = body.responsibilities;
      member.allocationStatus = 'pending';
      await member.save({ transaction: t });
    }

    let segment;
    let previousSegment = null;
    if (target) {
      previousSegment = segmentSnapshot(target);
      Object.assign(target, segmentValues);
      await target.save({ transaction: t });
      segment = target;
    } else {
      segment = await AllocationSegment.create({
        memberId: member.id, projectId, userId: body.userId, createdById: uidOf(user), ...segmentValues,
      }, { transaction: t });
    }

    const approval = await PmAllocationApproval.create({
      requestType:          'exception',
      projectId,
      userId:               body.userId,
      requestedById:        uidOf(user),
      memberId:             member.id,
      segmentId:            segment.id,
      allocationMode:       r.mode,
      hoursPerDay:          r.hoursPerDay,
      allocationTotalHours: r.totalHours,
      allocationPct,
      fromDate,
      toDate:               toDate_,
      status:               'pending',
      reason,
      overloadHours,
      previousSnapshot:     { memberCreated, segment: previousSegment },
    }, { transaction: t });
    segment.exceptionApprovalId = approval.id;
    await segment.save({ transaction: t });

    await alloc.mirrorMemberSummary(member.id, t);
    await alloc.logAllocation({
      projectId, memberId: member.id, segmentId: segment.id, userId: body.userId,
      action: 'exception_request',
      before: previousSegment, after: segmentSnapshot(segment),
      byId: uidOf(user), note: reason.slice(0, 255),
    }, t);
    return { member, segment, approval };
  });

  return {
    member: await loadMember(member.id), segment, approval, project,
    user: targetUser,
    overload: { capacity, peak: check.peak, overloadHours, exceptionMaxHoursPerDay: exceptionCap },
  };
};

/**
 * Shared revert for reject / cancel: put the segment back exactly as it was, or
 * delete it when the request created it; drop the member row only when the
 * request created it AND it now has no segment left. Returns { member|null, segment|null }.
 */
const revertExceptionSegment = async (approval, t) => {
  const member = approval.memberId
    ? await ProjectMember.findByPk(approval.memberId, { transaction: t, lock: t.LOCK.UPDATE })
    : null;
  if (!member) return { member: null, segment: null };

  const snap = readPreviousSnapshot(approval.previousSnapshot);
  let segment = approval.segmentId
    ? await AllocationSegment.findOne({ where: { id: approval.segmentId, memberId: member.id }, transaction: t, lock: t.LOCK.UPDATE })
    : null;

  if (segment) {
    if (snap.segment) {
      for (const k of SEGMENT_SNAPSHOT_FIELDS) if (k in snap.segment) segment[k] = snap.segment[k];
      if (!segment.exceptionStatus || segment.exceptionStatus === 'pending') segment.exceptionStatus = 'none';
      if (segment.exceptionStatus === 'none') segment.exceptionApprovalId = null;
      await segment.save({ transaction: t });
    } else {
      await segment.destroy({ transaction: t });
      segment = null;
    }
  }

  // A period that carried this approval may have been SPLIT since (grid edit or a
  // capacity release): the parts inherit the approval id. Clear every one of them,
  // so an approval can always be revoked in full and no orphan "approved" period survives.
  await AllocationSegment.update(
    { exceptionStatus: 'none', exceptionApprovalId: null },
    { where: { exceptionApprovalId: approval.id, ...(segment ? { id: { [Op.ne]: segment.id } } : {}) }, transaction: t }
  );

  const remaining = await AllocationSegment.count({ where: { memberId: member.id }, transaction: t });
  if (snap.memberCreated && remaining === 0) {
    await member.destroy({ transaction: t });
    return { member: null, segment: null };
  }
  member.allocationStatus = 'active';
  await member.save({ transaction: t });
  await alloc.mirrorMemberSummary(member.id, t);
  return { member, segment };
};

/**
 * Approve or reject a pending exception. Approver role required (D3) and never
 * the requester. Approve → member active/approved/confirmed; reject → member
 * restored from previousSnapshot, or deleted when it was new.
 * Returns { approval, member|null, project, user, requester }.
 */
const decideAllocationException = async (approvalId, { action, responseNote } = {}, user) => {
  if (!['approve', 'reject'].includes(action)) throw new ValidationError('action must be approve or reject');

  const approval = await PmAllocationApproval.findByPk(approvalId, { include: APPROVAL_INCLUDE });
  if (!approval || approval.requestType !== 'exception') throw new NotFoundError('Allocation exception request');

  const { roles } = await pmSettingsService.getExceptionPolicy();
  if (!roles.includes(user.role)) throw new ForbiddenError(`Your role (${user.role}) cannot decide allocation exceptions`);

  // No self-approval — unless the requester is the ONLY active approver, which would
  // otherwise leave the request permanently undecidable. That case is recorded.
  let soleApprover = false;
  if (String(approval.requestedById) === uidOf(user)) {
    const otherApprovers = await User.count({
      where: { role: { [Op.in]: roles }, isActive: true, id: { [Op.ne]: uidOf(user) } },
    });
    if (otherApprovers > 0) throw new ForbiddenError('You cannot decide your own exception request');
    soleApprover = true;
  }
  if (approval.status !== 'pending') throw new ConflictError(`This request has already been ${approval.status}. No changes made.`);

  const { member, segment, ticket } = await sequelize.transaction(async (t) => {
    approval.status       = action === 'approve' ? 'approved' : 'rejected';
    const note            = responseNote ? String(responseNote) : null;
    approval.approverNote = soleApprover
      ? `${note ? `${note} · ` : ''}Decided by the requester (only active approver)`
      : note;
    approval.approvedById = uidOf(user);
    await approval.save({ transaction: t });

    // ── Helpdesk ticket exception ────────────────────────────────────────────
    // approve → the ticket keeps the requested allocation and counts again (the
    // row is no longer pending); reject → previousSnapshot.ticket is restored
    // (allocation AND assignment), or the allocation is cleared when the request
    // introduced it. BOTH write the audit trail — pm_allocation_history plus an
    // hd_ticket_history row per changed field — inside this same transaction, so
    // a decision on a ticket is never a silent mutation.
    if (approval.ticketId) {
      const tk = action === 'approve'
        ? await ticketException.approveTicketException(approval, t)
        : await ticketException.revertTicketException(approval, t, { action: 'exception_reject' });
      return { member: null, segment: null, ticket: tk };
    }

    if (action === 'approve') {
      const row = approval.memberId
        ? await ProjectMember.findByPk(approval.memberId, { transaction: t, lock: t.LOCK.UPDATE })
        : null;
      if (!row) throw new NotFoundError('Project Member');   // rolls the decision back
      const seg = approval.segmentId
        ? await AllocationSegment.findOne({ where: { id: approval.segmentId, memberId: row.id }, transaction: t, lock: t.LOCK.UPDATE })
        : null;
      if (!seg) throw new NotFoundError('Allocation period');   // rolls the decision back
      const before = segmentSnapshot(seg);
      seg.exceptionStatus     = 'approved';
      seg.exceptionApprovalId = approval.id;
      seg.hoursConfirmed      = true;
      await seg.save({ transaction: t });
      row.allocationStatus = 'active';
      await row.save({ transaction: t });
      await alloc.mirrorMemberSummary(row.id, t);
      await alloc.logAllocation({
        projectId: approval.projectId, memberId: row.id, segmentId: seg.id, userId: approval.userId,
        action: 'exception_approve', before, after: segmentSnapshot(seg),
        byId: uidOf(user), note: approval.approverNote,
      }, t);
      return { member: row, segment: seg };
    }

    // reject → put the period back exactly as it was, or remove it when it was new
    const before = approval.segmentId ? segmentSnapshot(await AllocationSegment.findByPk(approval.segmentId, { transaction: t })) : null;
    const out = await revertExceptionSegment(approval, t);
    await alloc.logAllocation({
      projectId: approval.projectId, memberId: approval.memberId, segmentId: out.segment?.id ?? approval.segmentId ?? null,
      userId: approval.userId,
      action: 'exception_reject', before, after: out.segment ? segmentSnapshot(out.segment) : null,
      byId: uidOf(user), note: approval.approverNote,
    }, t);
    return out;
  });

  return {
    approval, segment,
    ticket:    ticket || null,
    member:    member ? await loadMember(member.id) : null,
    project:   approval.project   || null,
    user:      approval.user      || null,
    requester: approval.requestedBy || null,
  };
};

/**
 * Withdraw a PENDING exception request. Allowed for the requester, or anyone
 * who may manage the project. The member row is put back exactly as it was
 * (or removed when the request created it) — same revert as a rejection.
 */
const cancelAllocationException = async (approvalId, user) => {
  const approval = await PmAllocationApproval.findByPk(approvalId, { include: APPROVAL_INCLUDE });
  if (!approval || approval.requestType !== 'exception') throw new NotFoundError('Allocation exception request');
  if (approval.status !== 'pending') throw new ConflictError(`This request has already been ${approval.status}. No changes made.`);

  const project = approval.projectId
    ? await Project.findByPk(approval.projectId, { attributes: ['id', 'managerId'] })
    : null;
  const isRequester = String(approval.requestedById) === uidOf(user);
  // A ticket exception has no project manager — the requester or an admin/manager withdraws it.
  const mayManage   = approval.ticketId
    ? canManageProject(user)
    : (project && (canManageProject(user) || String(project.managerId) === uidOf(user)));
  if (!isRequester && !mayManage) throw new ForbiddenError('Only the requester or the project manager can withdraw this request');

  if (approval.ticketId) {
    const ticket = await sequelize.transaction(async (t) => {
      approval.status       = 'rejected';
      approval.approverNote = 'Withdrawn by requester';
      approval.approvedById = uidOf(user);
      await approval.save({ transaction: t });
      // Same revert + same audit trail as a rejection, logged as 'exception_cancel'.
      return ticketException.revertTicketException(approval, t, { action: 'exception_cancel' });
    });
    return { approval, ticket, segment: null, member: null };
  }

  const { member, segment } = await sequelize.transaction(async (t) => {
    approval.status       = 'rejected';
    approval.approverNote = 'Withdrawn by requester';
    approval.approvedById = uidOf(user);
    await approval.save({ transaction: t });
    const before = approval.segmentId ? segmentSnapshot(await AllocationSegment.findByPk(approval.segmentId, { transaction: t })) : null;
    const out = await revertExceptionSegment(approval, t);
    await alloc.logAllocation({
      projectId: approval.projectId, memberId: approval.memberId, segmentId: out.segment?.id ?? approval.segmentId ?? null,
      userId: approval.userId,
      action: 'exception_cancel', before, after: out.segment ? segmentSnapshot(out.segment) : null,
      byId: uidOf(user), note: approval.approverNote,
    }, t);
    return out;
  });
  return { approval, segment, ticket: null, member: member ? await loadMember(member.id) : null };
};

/**
 * Load summary for one exception: the person's counted load over the request
 * window, excluding the request's own SEGMENT (pre-segment approvals: the member).
 */
const loadSummaryFor = (allocationsForUser, approval, calendar) => {
  // Only the requested line is excluded: the ticket for a ticket exception,
  // otherwise the project PERIOD (helpdesk lines always count).
  const others = approval.ticketId
    ? allocationsForUser.filter(a => a.source !== 'helpdesk' || String(a.ticketId) !== String(approval.ticketId))
    : allocationsForUser.filter(a => a.source === 'helpdesk' || (approval.segmentId
      ? String(a.segmentId) !== String(approval.segmentId)
      : String(a.memberId)  !== String(approval.memberId)));
  const s = summarise(others, calendar, approval.fromDate, approval.toDate);
  return { capacity: s.capacity, peakHours: s.peakHours, freeHours: s.freeHours, isOverAllocated: s.isOverAllocated };
};

/**
 * Exception inbox. Approver roles see every request; everyone else sees only
 * the requests they raised. status: 'pending' | 'approved' | 'rejected' | 'decided' | undefined (all).
 */
const listAllocationExceptions = async ({ status } = {}, user) => {
  const where = { requestType: 'exception' };
  if (status === 'decided') where.status = { [Op.in]: ['approved', 'rejected'] };
  else if (['pending', 'approved', 'rejected'].includes(status)) where.status = status;
  else if (status === 'all') { /* no status filter */ }
  else if (!isBlank(status)) throw new ValidationError("status must be 'pending', 'approved', 'rejected', 'decided' or 'all'");

  const { roles } = await pmSettingsService.getExceptionPolicy();
  const isApprover = roles.includes(user.role);
  if (!isApprover) where.requestedById = uidOf(user);

  // Whether THIS viewer may decide is decided here, never guessed in the browser:
  // an approver decides anything except their own request — unless they are the
  // only active approver, which decideAllocationException also allows.
  const soleApprover = isApprover
    ? (await User.count({ where: { role: { [Op.in]: roles }, isActive: true, id: { [Op.ne]: uidOf(user) } } })) === 0
    : false;

  const approvals = await PmAllocationApproval.findAll({ where, include: APPROVAL_INCLUDE, order: [['createdAt', 'DESC']] });
  if (!approvals.length) return [];

  const calendar = await pmSettingsService.getCalendar();
  const userIds  = [...new Set(approvals.map(a => String(a.userId)))];
  const byUser   = new Map(userIds.map(id => [id, []]));
  for (const s of await alloc.loadAllocationsForUsers(userIds, { countedOnly: true, calendar })) {
    byUser.get(String(s.userId))?.push(s);
  }

  return approvals.map(a => {
    const { requestedBy, approvedBy, ...plain } = a.get({ plain: true });
    return {
      ...plain,
      hoursPerDay:   plain.hoursPerDay == null ? null : Number(plain.hoursPerDay),
      overloadHours: plain.overloadHours == null ? null : Number(plain.overloadHours),
      project:   plain.project ? { id: plain.project.id, name: plain.project.name } : null,
      // Ticket exceptions (migration 047) — one of project / ticket is set, never both.
      ticket:    plain.ticket  ? { id: plain.ticket.id, reqNumber: plain.ticket.reqNumber, title: plain.ticket.title } : null,
      user:      plain.user    ? { id: plain.user.id, name: plain.user.name, email: plain.user.email } : null,
      requester: requestedBy   ? { id: requestedBy.id, name: requestedBy.name } : null,
      approver:  approvedBy    ? { id: approvedBy.id, name: approvedBy.name } : null,
      load:      loadSummaryFor(byUser.get(String(a.userId)) || [], a, calendar),
      // Server-decided capability for this viewer — the UI just obeys it.
      isOwnRequest: String(plain.requestedById) === uidOf(user),
      canDecide: plain.status === 'pending' && isApprover
        && (soleApprover || String(plain.requestedById) !== uidOf(user)),
      decideBlockedReason: plain.status !== 'pending' ? 'Already decided'
        : !isApprover ? 'Only an approver can decide this request'
        : (!soleApprover && String(plain.requestedById) === uidOf(user)) ? 'You cannot decide your own request'
        : null,
    };
  });
};

// ── Capacity release (legacy 'capacity_release' approvals) ───────────────────

const shiftDay = (d, days) => iso(new Date(toDate(d).getTime() + days * 86400000));
const totalFor = (hours, from, to, calendar) => Math.round(hours * workingDaysBetween(from, to, calendar) * 10) / 10;

/**
 * Apply an approved capacity release: set the agreed hours on the member's
 * period over approval.fromDate–toDate.
 *
 * Supported: exactly ONE segment overlaps the window → it is trimmed/split to
 * the window (before/after parts keep their original hours) and the window part
 * gets the agreed hours. RESTRICTION (stated): several overlapping segments, no
 * overlapping segment, or a pending-exception segment → 409 — adjust the periods
 * in the drawer first. Conflict-checked (S2) before any write; mirrors the
 * summary (S3) and writes history 'update'. Returns { member, segment }.
 */
const applyCapacityRelease = async (approval, hours, user, { decision } = {}) => {
  const member = await ProjectMember.findOne({ where: { projectId: approval.projectId, userId: approval.userId } });
  if (!member) throw new ConflictError('The person is no longer a member of this project — nothing to release');
  const from = dateOnly(approval.fromDate), to = dateOnly(approval.toDate);
  const segments = await AllocationSegment.findAll({ where: { memberId: member.id }, order: [['fromDate', 'ASC']] });
  const hits = segments.filter(s => overlaps(s.fromDate, s.toDate, from, to));
  if (!hits.length) throw new ConflictError(`No allocation period overlaps ${from} – ${to} on this project — add the period first`);
  if (hits.length > 1) throw new ConflictError('Several periods overlap the requested window — adjust them in the allocation drawer, then approve');
  const seg = hits[0];
  if (seg.exceptionStatus === 'pending') throw new ConflictError('This period has a pending allocation exception — decide it first');

  const segFrom = dateOnly(seg.fromDate), segTo = dateOnly(seg.toDate);
  const winFrom = segFrom > from ? segFrom : from;
  const winTo   = segTo   < to   ? segTo   : to;

  const calendar = await pmSettingsService.getCalendar();
  const others = await getOtherActiveAllocations(approval.userId, calendar, null, seg.id);
  const result = checkConflict(others, { hoursPerDay: hours, allocationFrom: winFrom, allocationTo: winTo, projectId: approval.projectId }, calendar);
  if (!result.ok) {
    const { maxHoursPerDay } = await pmSettingsService.getExceptionPolicy();
    throw new AllocationConflictError(result, capOf(calendar), { exceptionMaxHoursPerDay: maxHoursPerDay, canRequestException: true });
  }

  await sequelize.transaction(async (t) => {
    const before = segmentSnapshot(seg);
    const part = (fromDate, toDate) => ({
      memberId: member.id, projectId: approval.projectId, userId: approval.userId, createdById: uidOf(user),
      fromDate, toDate,
      allocationMode: 'per_day', hoursPerDay: Number(seg.hoursPerDay),
      allocationTotalHours: totalFor(Number(seg.hoursPerDay), fromDate, toDate, calendar),
      hoursConfirmed: seg.hoursConfirmed, exceptionStatus: seg.exceptionStatus, exceptionApprovalId: seg.exceptionApprovalId, note: seg.note,
    });
    if (segFrom < winFrom) await AllocationSegment.create(part(segFrom, shiftDay(winFrom, -1)), { transaction: t });
    if (segTo   > winTo)   await AllocationSegment.create(part(shiftDay(winTo, 1), segTo),     { transaction: t });
    Object.assign(seg, {
      fromDate: winFrom, toDate: winTo,
      allocationMode: 'per_day', hoursPerDay: hours, allocationTotalHours: totalFor(hours, winFrom, winTo, calendar),
      hoursConfirmed: true,
      // a re-written allocation that passed the normal check no longer needs its old exception
      exceptionStatus: 'none', exceptionApprovalId: null,
    });
    await seg.save({ transaction: t });
    await alloc.mirrorMemberSummary(member.id, t);
    await alloc.logAllocation({
      projectId: approval.projectId, memberId: member.id, segmentId: seg.id, userId: approval.userId,
      action: 'update', before, after: segmentSnapshot(seg),
      byId: uidOf(user), note: `Capacity release approved (${from} – ${to})`,
    }, t);
    // Decide the approval in the SAME transaction — otherwise a failure between the
    // two writes leaves the period already cut against a still-pending request, and
    // approving again would cut it twice.
    if (decision) await approval.update(decision, { transaction: t });
  });
  return { member: await loadMember(member.id), segment: seg };
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
  assertNameIsFree,
  getMembers, addMember, updateMember, confirmMemberHours, removeMember,
  getRecipients, addRecipient, removeRecipient,
  // allocation exceptions
  requestAllocationException, decideAllocationException, listAllocationExceptions, cancelAllocationException,
  // capacity release (legacy approvals) — segment-aware
  applyCapacityRelease,
  // allocation helpers shared with the controller
  effectiveHours, toAllocation, getOtherActiveAllocations, INACTIVE_PROJECT_STATUSES,
  assertProjectVisible, loadMember, segmentSnapshot,
};
