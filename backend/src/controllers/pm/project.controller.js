const { Op } = require('sequelize');
const projectService = require('../../services/pm/project.service');
const pmSettingsService = require('../../services/pm/pmSettings.service');
const { sendSuccess, sendError } = require('../../utils/response');
const { AllocationConflictError, ValidationError } = require('../../utils/errors');
const { checkConflict, summarise, toPct, toDate: toLocalDate, resolveAllocation } = require('../../utils/capacityEngine');

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
  try {
    const { id } = req.params;
    const user = req.user;

    // Managers who are not the assigned project manager/owner can only update endDate
    if (user.role === 'manager') {
      const project = await projectService.getProject(id);
      if (project) {
        const isProjectOwner =
          String(project.ownerId) === String(user._id) ||
          String(project.managerId) === String(user._id);
        if (!isProjectOwner) {
          const { endDate } = req.body;
          if (!endDate) {
            return sendError(res, 'Only endDate can be updated by managers. Please provide a valid endDate.', 400);
          }
          return sendSuccess(
            res,
            await projectService.updateProject(id, { endDate }, user),
            'Project end date updated'
          );
        }
      }
    }

    sendSuccess(res, await projectService.updateProject(id, req.body, user), 'Project updated');
  } catch (e) {
    next(e);
  }
};

const deleteProject = async (req, res, next) => {
  try { await projectService.deleteProject(req.params.id, req.user); sendSuccess(res, null, 'Project deleted'); }
  catch (e) { next(e); }
};

const getProjectSummary = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getProjectSummary(req.params.id, req.user)); }
  catch (e) { next(e); }
};

// ── Helpdesk profile (ONE PROJECT MASTER) ────────────────────────────────────
// 4xx from the service (404 / 403 / 409 / 400) are answered with the flat
// unified { success:false, message, error:{ message } } body; anything else goes to the error handler.
const mapHelpdeskError = (e, res, next) => {
  if (e && e.isOperational && e.statusCode >= 400 && e.statusCode < 500) {
    return sendError(res, e.message, e.statusCode);
  }
  return next(e);
};

// GET /pm/projects/:id/helpdesk → { enabled, profile }
const getHelpdeskProfile = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getHelpdeskProfile(req.params.id)); }
  catch (e) { mapHelpdeskError(e, res, next); }
};
// POST /pm/projects/:id/helpdesk { groupId }
const enableHelpdesk = async (req, res, next) => {
  try { sendSuccess(res, await projectService.enableHelpdesk(req.params.id, req.body.groupId, req.user), 'Helpdesk enabled', 201); }
  catch (e) { mapHelpdeskError(e, res, next); }
};
// PUT /pm/projects/:id/helpdesk { groupId }
const updateHelpdeskProfile = async (req, res, next) => {
  try { sendSuccess(res, await projectService.updateHelpdeskProfile(req.params.id, req.body, req.user), 'Helpdesk profile updated'); }
  catch (e) { mapHelpdeskError(e, res, next); }
};
// DELETE /pm/projects/:id/helpdesk
const disableHelpdesk = async (req, res, next) => {
  try { await projectService.disableHelpdesk(req.params.id, req.user); sendSuccess(res, { enabled: false, profile: null }, 'Helpdesk disabled'); }
  catch (e) { mapHelpdeskError(e, res, next); }
};

// ── Allocation error mapping ─────────────────────────────────────────────────
// The capacity engine raises AllocationConflictError (409) from the service so
// the check cannot be bypassed; the controller only maps it to the API body.
// hoursPerDay validation (400) uses the unified error shape; the 409 keeps the
// top-level `conflict` key ProjectDetail.jsx reads (data.conflict).
const mapAllocationError = (e, res, next) => {
  if (e instanceof AllocationConflictError) {
    return sendError(res, e.message, 409, null, { conflict: e.conflict });
  }
  if (e instanceof ValidationError) {
    return sendError(res, e.message, 400);
  }
  return next(e);
};

// Members
const getMembers = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getMembers(req.params.id, req.user)); }
  catch (e) { next(e); }
};
const addMember = async (req, res, next) => {
  try { sendSuccess(res, await projectService.addMember(req.params.id, req.body, req.user), 'Member added', 201); }
  catch (e) { mapAllocationError(e, res, next); }
};
const updateMember = async (req, res, next) => {
  try { sendSuccess(res, await projectService.updateMember(req.params.id, req.params.memberId, req.body, req.user), 'Member updated'); }
  catch (e) { mapAllocationError(e, res, next); }
};
// PATCH /pm/projects/:id/members/:memberId/confirm-hours
const confirmMemberHours = async (req, res, next) => {
  try { sendSuccess(res, await projectService.confirmMemberHours(req.params.id, req.params.memberId, req.user), 'Hours confirmed'); }
  catch (e) { next(e); }
};
const removeMember = async (req, res, next) => {
  try { await projectService.removeMember(req.params.id, req.params.memberId, req.user); sendSuccess(res, null, 'Member removed'); }
  catch (e) { next(e); }
};

// Recipients
const getRecipients = async (req, res, next) => {
  try { sendSuccess(res, await projectService.getRecipients(req.params.id, req.user)); }
  catch (e) { next(e); }
};
const addRecipient = async (req, res, next) => {
  try { sendSuccess(res, await projectService.addRecipient(req.params.id, req.body, req.user), 'Recipient added', 201); }
  catch (e) { next(e); }
};
const removeRecipient = async (req, res, next) => {
  try { await projectService.removeRecipient(req.params.id, req.params.recipientId, req.user); sendSuccess(res, null, 'Recipient removed'); }
  catch (e) { next(e); }
};

// ── Allocation (Phase 0: hours/day) ──────────────────────────────────────────

const { effectiveHours, toAllocation, INACTIVE_PROJECT_STATUSES } = projectService;

/** True when the allocation is active on a local calendar date. */
const activeOn = (alloc, date) => {
  const from = toLocalDate(alloc.allocationFrom);
  const to   = toLocalDate(alloc.allocationTo);
  return (from === null || date >= from) && (to === null || date <= to);
};

/** True when the allocation overlaps the [from, to] window (open ends always overlap). */
const overlapsWindow = (alloc, from, to) => {
  const aFrom = toLocalDate(alloc.allocationFrom);
  const aTo   = toLocalDate(alloc.allocationTo);
  return (aTo === null || aTo >= from) && (aFrom === null || aFrom <= to);
};

/** Later of two local dates (null = unbounded). */
const laterOf = (a, b) => (a && b ? (a > b ? a : b) : (a || b));
const earlierOf = (a, b) => (a && b ? (a < b ? a : b) : (a || b));

/** Round to the nearest 0.5. */
const half = (v) => Math.round(v * 2) / 2;

/** Build the standard availability payload for one user from their active allocations. */
const buildAvailability = (allocations, calendar, from, to) => {
  const s = summarise(allocations, calendar, from, to, 30);
  return {
    capacity:        s.capacity,
    peakHours:       s.peakHours,
    avgHours:        s.avgHours,
    freeHours:       s.freeHours,
    isOverAllocated: s.isOverAllocated,
    nextFreeDate:    s.nextFreeDate,
    projectCount:    s.projectCount,
    totalCommitted:  s.peakHours,   // legacy alias
    freeCapacity:    s.freeHours,   // legacy alias
  };
};

// GET /pm/projects/:id/allocation-preview?fromDate&toDate
// Returns each member's allocations across all their projects plus the days
// on which they are over capacity within the requested window.
const getAllocationPreview = async (req, res, next) => {
  try {
    const { fromDate, toDate } = req.query;
    const projectId = req.params.id;

    const ProjectMember = require('../../models/pm/ProjectMember');
    const Project = require('../../models/pm/Project');
    const User = require('../../models/User');

    // Calendar loaded ONCE per request (Saturday policy + holidays), shared by every member below
    const calendar = await pmSettingsService.getCalendar();
    const capacity = calendar.hoursPerDay;

    const members = await ProjectMember.findAll({
      where: { projectId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation'] }],
    });
    if (!members.length) return sendSuccess(res, []);

    // All active memberships for these users in one query
    const userIds = [...new Set(members.map(m => m.userId))];
    const rows = await ProjectMember.findAll({
      where: { userId: userIds },
      include: [{
        model: Project, as: 'project',
        attributes: ['id', 'name', 'status', 'managerId'],
        where: { status: { [Op.notIn]: INACTIVE_PROJECT_STATUSES } },
        required: true,
      }],
    });
    const byUser = {};
    for (const r of rows) (byUser[String(r.userId)] ||= []).push(toAllocation(r, capacity));

    const winFrom = toLocalDate(fromDate);
    const winTo   = toLocalDate(toDate);

    const preview = members.map((member) => {
      const all = byUser[String(member.userId)] || [];
      const others = all.filter(a => String(a.projectId) !== String(projectId));
      const hoursPerDay = effectiveHours(member, capacity);

      // Window = this member's allocation dates clipped to the requested range
      const from = laterOf(toLocalDate(member.allocationFrom), winFrom);
      const to   = earlierOf(toLocalDate(member.allocationTo), winTo);
      const emptyWindow = from && to && from > to;

      let result = { ok: true, ranges: [], peak: 0 };
      if (hoursPerDay != null && !emptyWindow) {
        result = checkConflict(
          others,
          { hoursPerDay, allocationFrom: from, allocationTo: to, projectId },
          calendar
        );
      }

      const conflicts = result.ranges.map(r => {
        const day = toLocalDate(r.from);
        return {
          from: r.from, to: r.to, days: r.days, peak: r.peak,
          projects: all
            .filter(a => a.hoursPerDay != null && activeOn(a, day))
            .map(a => ({ projectId: a.projectId, projectName: a.projectName, hoursPerDay: a.hoursPerDay })),
        };
      });

      return {
        userId: member.userId,
        user:   member.user,
        name:   member.user?.name,
        email:  member.user?.email,
        role:   member.role,
        hoursPerDay,
        allocationPct:  toPct(hoursPerDay, capacity),
        isEstimated:    member.hoursConfirmed !== true,
        isUnset:        hoursPerDay == null,
        allocationFrom: member.allocationFrom,
        allocationTo:   member.allocationTo,
        capacity,
        allAllocations: all.map(a => ({
          projectId:      a.projectId,
          projectName:    a.projectName,
          hoursPerDay:    a.hoursPerDay,
          pct:            a.allocationPct,
          allocationMode:       a.allocationMode,
          allocationTotalHours: a.allocationTotalHours,
          allocationFrom: a.allocationFrom,
          allocationTo:   a.allocationTo,
        })),
        peakHours:       Math.round(result.peak * 10) / 10,
        isOverAllocated: !result.ok,
        conflicts,
        hasConflict: conflicts.length > 0,
      };
    });

    sendSuccess(res, preview);
  } catch (e) { next(e); }
};

// POST /pm/projects/:id/allocation-approval
const requestAllocationApproval = async (req, res, next) => {
  try {
    const { userId, fromDate, toDate, reason } = req.body;
    const calendar = await pmSettingsService.getCalendar();
    const capacity = calendar.hoursPerDay;

    // Validate dates
    if (!fromDate || isNaN(new Date(fromDate).getTime())) {
      return sendError(res, 'Invalid fromDate', 400);
    }
    if (!toDate || isNaN(new Date(toDate).getTime())) {
      return sendError(res, 'Invalid toDate', 400);
    }
    if (new Date(fromDate) > new Date(toDate)) {
      return sendError(res, 'fromDate must be before toDate', 400);
    }

    // Allocation: per_day (hoursPerDay, or legacy allocationPct → converted) or total (allocationTotalHours)
    const blank = (v) => v === undefined || v === null || v === '';
    let hoursPerDay = req.body.hoursPerDay;
    if (blank(hoursPerDay) && !blank(req.body.allocationPct)) {
      hoursPerDay = half(Number(req.body.allocationPct) * capacity / 100);
    }
    let mode = req.body.allocationMode;
    if (blank(mode)) mode = (blank(hoursPerDay) && !blank(req.body.allocationTotalHours)) ? 'total' : 'per_day';
    if (mode !== 'per_day' && mode !== 'total') {
      return sendError(res, "allocationMode must be 'per_day' or 'total'", 400);
    }
    const resolved = resolveAllocation({
      allocationMode: mode,
      hoursPerDay,
      allocationTotalHours: req.body.allocationTotalHours,
      allocationFrom: fromDate,
      allocationTo:   toDate,
    }, calendar);
    if (!resolved.ok) return sendError(res, resolved.error, 400);
    const hours = resolved.hoursPerDay;
    // Validate userId exists
    if (!userId) {
      return sendError(res, 'userId is required', 400);
    }
    const User = require('../../models/User');
    const targetUser = await User.findByPk(userId, { attributes: ['id'] });
    if (!targetUser) {
      return sendError(res, 'User not found', 404);
    }
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const approval = await PmAllocationApproval.create({
      id: require('crypto').randomUUID(),
      projectId: req.params.id,
      userId,
      requestedById: req.user._id || req.user.id,
      allocationMode:       resolved.mode,
      hoursPerDay:          hours,
      allocationTotalHours: resolved.totalHours,
      allocationPct: Math.round(toPct(hours, capacity)),   // DB column is NOT NULL
      fromDate,
      toDate,
      reason,
      status: 'pending',
    });
    sendSuccess(res, approval, 'Approval request submitted', 201);
  } catch (e) { next(e); }
};

// GET /pm/projects/:id/allocation-approvals
// Returns pending requests where other PMs are asking this project to release a member's capacity
const getProjectAllocationApprovals = async (req, res, next) => {
  try {
    const { id } = req.params;
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const User = require('../../models/User');

    const approvals = await PmAllocationApproval.findAll({
      where: { projectId: id, status: 'pending' },
      order: [['createdAt', 'DESC']],
    });

    // Enrich with user data (the member being requested, and who submitted the request)
    const userIds = [...new Set([
      ...approvals.map(a => a.userId),
      ...approvals.map(a => a.requestedById),
    ])].filter(Boolean);

    const users = await User.findAll({ where: { id: userIds }, attributes: ['id', 'name', 'email'] });
    const userMap = Object.fromEntries(users.map(u => [String(u.id), u.toJSON()]));

    const enriched = approvals.map(a => ({
      ...a.toJSON(),
      requestedUser: userMap[String(a.userId)] || null,
      requester: userMap[String(a.requestedById)] || null,
    }));

    return sendSuccess(res, enriched, 'Approval requests fetched');
  } catch (err) { next(err); }
};

// PATCH /pm/projects/:id/allocation-approvals/:approvalId
// Manager of the source project approves or rejects the capacity release request
const respondToAllocationApproval = async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const { action, responseNote } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return sendError(res, 'action must be approve or reject', 400);
    }
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const ProjectMember = require('../../models/pm/ProjectMember');

    const approval = await PmAllocationApproval.findByPk(approvalId);
    if (!approval) return sendError(res, 'Approval request not found', 404);

    // Guard: prevent re-deciding an already approved or rejected request
    if (approval.status !== 'pending') {
      return sendError(res, `This request has already been ${approval.status}. No changes made.`, 409);
    }

    await approval.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      approverNote: responseNote || null,
      approvedById: req.user._id || req.user.id,
    });

    // If approved, set the member's allocation on this project to the agreed hours.
    // Approvals created before migration 039 carry only allocationPct → convert.
    const capacity = (await pmSettingsService.getCalendar()).hoursPerDay;
    const hours = approval.hoursPerDay != null
      ? Number(approval.hoursPerDay)
      : (approval.allocationPct != null ? half(Number(approval.allocationPct) * capacity / 100) : null);
    if (action === 'approve' && hours != null) {
      await ProjectMember.update(
        {
          allocationMode:       approval.allocationMode || 'per_day',
          hoursPerDay:          hours,
          allocationTotalHours: approval.allocationTotalHours == null ? null : Number(approval.allocationTotalHours),
          allocationPct:        Math.round(toPct(hours, capacity)),
          hoursConfirmed:       true,
        },
        { where: { projectId: approval.projectId, userId: approval.userId } }
      );
    }

    return sendSuccess(res, approval, `Request ${action}d`);
  } catch (err) { next(err); }
};

/** Suggestions offered when a user is over capacity for a requested window. */
const buildSuggestions = (allocations, relevant, summary, capacity, reqUser) => {
  const suggestions = [];

  // 1. Reduce hours/day on the new assignment
  const remaining = Math.max(0.5, half(capacity - summary.peakHours));
  suggestions.push({
    type: 'reduce_hours',
    label: 'Reduce hours per day',
    description: `Reduce the new assignment to ${remaining} hrs/day to stay within ${capacity}h capacity`,
    suggestedHoursPerDay: remaining,
  });

  // 2. Shift start date to the day after the latest allocationTo
  const latestEnd = allocations
    .map(a => toLocalDate(a.allocationTo))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  if (latestEnd) {
    const s = new Date(latestEnd);
    s.setDate(s.getDate() + 1);
    const isoDate = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    suggestions.push({
      type: 'shift_dates',
      label: 'Shift start date',
      description: `Start this assignment from ${isoDate} when capacity becomes available`,
      suggestedFromDate: isoDate,
    });
  }

  // 3. Free up from an existing project (requires that project's manager approval)
  const me = String(reqUser?._id || reqUser?.id);
  const freeable = relevant.filter(a => a.projectManagerId && String(a.projectManagerId) !== me);
  if (freeable.length > 0) {
    suggestions.push({
      type: 'request_approval',
      label: 'Request capacity release',
      description: `Request the manager of ${freeable[0].projectName} to temporarily reduce this person's allocation on that project`,
      targetProjectId: freeable[0].projectId,
      targetProjectName: freeable[0].projectName,
      targetManagerId: freeable[0].projectManagerId,
    });
  }
  return suggestions;
};

// GET /pm/users/:userId/availability?fromDate&toDate
const getUserAvailability = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { fromDate, toDate } = req.query;

    const calendar = await pmSettingsService.getCalendar();
    const capacity = calendar.hoursPerDay;
    const allocations = await projectService.getOtherActiveAllocations(userId, calendar);

    const from = toLocalDate(fromDate);
    const to   = toLocalDate(toDate);
    const hasWindow = Boolean(from && to);

    // Allocations overlapping the requested range (open-ended rows always overlap)
    const relevant = hasWindow ? allocations.filter(a => overlapsWindow(a, from, to)) : allocations;

    const summary = buildAvailability(allocations, calendar, hasWindow ? from : null, hasWindow ? to : null);

    const suggestions = (summary.isOverAllocated && hasWindow)
      ? buildSuggestions(allocations, relevant, summary, capacity, req.user)
      : [];

    return sendSuccess(res, {
      userId,
      allocations: relevant,
      ...summary,
      hasNoData: allocations.length === 0,
      suggestions,
    }, 'User availability fetched');
  } catch (err) {
    next(err);
  }
};

// GET /pm/projects/:id/members/availability
// Batch: returns cross-project availability for ALL members of a project in one query
const getMembersAvailability = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ProjectMember = require('../../models/pm/ProjectMember');
    const Project = require('../../models/pm/Project');
    const User = require('../../models/User');

    // Calendar loaded ONCE per request, shared by every member below
    const calendar = await pmSettingsService.getCalendar();
    const capacity = calendar.hoursPerDay;

    // Step 1: Get all userIds on this project
    const thisProjectMembers = await ProjectMember.findAll({
      where: { projectId: id },
      attributes: ['userId'],
    });
    const userIds = [...new Set(thisProjectMembers.map(m => m.userId).filter(Boolean))];

    if (userIds.length === 0) return sendSuccess(res, [], 'No members');

    // Step 2: Get ALL active project memberships for all those users in ONE query
    const allMemberships = await ProjectMember.findAll({
      where: { userId: userIds },
      include: [
        {
          model: Project, as: 'project',
          attributes: ['id', 'name', 'status', 'managerId'],
          where: { status: { [Op.notIn]: INACTIVE_PROJECT_STATUSES } },
          required: true,
        },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation'], required: false },
      ],
    });

    // Step 3: Group by userId
    const byUser = {};
    for (const uid of userIds) byUser[String(uid)] = [];
    for (const m of allMemberships) {
      const uid = String(m.userId);
      if (byUser[uid]) byUser[uid].push(m);
    }

    // Step 4: Compute stats per user (today + 30 days)
    const result = userIds.map(userId => {
      const memberships = byUser[String(userId)] || [];

      if (memberships.length === 0) {
        return {
          userId, hasNoData: true, capacity,
          peakHours: 0, avgHours: 0, freeHours: capacity,
          totalCommitted: 0, freeCapacity: capacity,
          allocations: [], nextFreeDate: null, isOverAllocated: false, projectCount: 0,
          user: null,
        };
      }

      const allocations = memberships.map(m => toAllocation(m, calendar));
      const summary = buildAvailability(allocations, calendar, null, null);
      const userIdentity = memberships[0]?.user?.toJSON ? memberships[0].user.toJSON() : memberships[0]?.user || null;

      return {
        userId,
        user: userIdentity,
        hasNoData: false,
        ...summary,
        allocations,
      };
    });

    return sendSuccess(res, result, 'Member availability fetched');
  } catch (err) { next(err); }
};

module.exports = {
  getProjects, getProjectById, createProject, updateProject, deleteProject, getProjectSummary,
  getHelpdeskProfile, enableHelpdesk, updateHelpdeskProfile, disableHelpdesk,
  getMembers, addMember, updateMember, confirmMemberHours, removeMember,
  getRecipients, addRecipient, removeRecipient,
  getAllocationPreview, requestAllocationApproval,
  getProjectAllocationApprovals, respondToAllocationApproval,
  getUserAvailability,
  getMembersAvailability,
};
