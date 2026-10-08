const { Op } = require('sequelize');
const projectService = require('../../services/pm/project.service');
const pmSettingsService = require('../../services/pm/pmSettings.service');
const { sendSuccess } = require('../../utils/response');
const { AppError, AllocationConflictError, ValidationError } = require('../../utils/errors');
const emailService = require('../../utils/emailService');
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
  catch (e) { mapExceptionError(e, res, next); }   // duplicate name → 409 in both body shapes
};

// GET /pm/projects/name-available?name=…&excludeId=… — live check for the create forms
const checkProjectName = async (req, res, next) => {
  try {
    await projectService.assertNameIsFree(req.query.name, req.query.excludeId || null, req.query.clientName || null);
    sendSuccess(res, { available: true }, 'Name is available');
  } catch (e) {
    if (e instanceof AppError && e.statusCode === 409) {
      return sendSuccess(res, { available: false, message: e.message }, 'Name is taken');
    }
    if (e instanceof ValidationError) return sendSuccess(res, { available: false, message: e.message }, 'Invalid name');
    next(e);
  }
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
            return res.status(400).json({ success: false, message: 'Only endDate can be updated by managers. Please provide a valid endDate.' });
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

// ── Allocation error mapping ─────────────────────────────────────────────────
// The capacity engine raises AllocationConflictError (409) from the service so
// the check cannot be bypassed; the controller only maps it to the API body.
// hoursPerDay validation (400) uses the flat { success, message } shape the
// member endpoints have always used.
const mapAllocationError = (e, res, next) => {
  if (e instanceof AllocationConflictError) {
    // Additive passthrough (B3): the engine/service may attach structured
    // suggestions + exception hints; existing conflict keys are untouched.
    const conflict = { ...(e.conflict || {}) };
    const extra = {
      suggestions:            e.conflict?.suggestions            ?? e.suggestions,
      canRequestException:    e.conflict?.canRequestException    ?? e.canRequestException,
      exceptionMaxHoursPerDay: e.conflict?.exceptionMaxHoursPerDay ?? e.exceptionMaxHoursPerDay,
    };
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) conflict[k] = v;
    return res.status(409).json({ success: false, message: e.message, conflict, error: { message: e.message } });
  }
  if (e instanceof ValidationError) {
    return res.status(400).json({ success: false, message: e.message, error: { message: e.message } });
  }
  return next(e);
};

/**
 * Map any operational (4xx) AppError thrown by the exception-approval service to
 * the dual-shape body { message, error: { message } }; 5xx/unknown → next(e).
 */
const mapExceptionError = (e, res, next) => {
  if (e instanceof AllocationConflictError || e instanceof ValidationError) return mapAllocationError(e, res, next);
  if (e instanceof AppError && e.statusCode >= 400 && e.statusCode < 500) {
    return res.status(e.statusCode).json({ success: false, message: e.message, error: { message: e.message } });
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

// ── Allocation (segments: one period = one engine allocation) ────────────────

const { effectiveHours } = projectService;
const alloc = require('../../services/pm/allocation.service');

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
// One line per member: `segments` (one conflict result per period) PLUS the
// member-level fields computed from the mirrored summary as before, so the
// existing modal keeps rendering. Conflicts are per SEGMENT (S2): "others" =
// every counted segment of the person except the one being assessed.
const getAllocationPreview = async (req, res, next) => {
  try {
    const { fromDate, toDate } = req.query;
    const projectId = req.params.id;

    const ProjectMember = require('../../models/pm/ProjectMember');
    const AllocationSegment = require('../../models/pm/AllocationSegment');
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

    // Every counted allocation of these users — project periods AND open helpdesk tickets
    const userIds = [...new Set(members.map(m => String(m.userId)))];
    const byUser = {};
    for (const a of await alloc.loadAllocationsForUsers(userIds, { countedOnly: true, calendar })) {
      (byUser[String(a.userId)] ||= []).push(a);
    }
    // This project's own periods straight from the table (pending ones included — the PM must see them)
    const ownSegments = await AllocationSegment.findAll({ where: { projectId }, order: [['fromDate', 'ASC']] });
    const byMember = {};
    for (const s of ownSegments) (byMember[String(s.memberId)] ||= []).push(s);

    // Requested window is optional. A reversed request window is IGNORED (never
    // silently produces "no load"). Each member is then assessed over their own
    // allocation dates → the project's planned dates → the next 30 days.
    let winFrom = toLocalDate(fromDate);
    let winTo   = toLocalDate(toDate);
    if (winFrom && winTo && winFrom > winTo) { winFrom = null; winTo = null; }
    const projectRow = await Project.findByPk(projectId, { attributes: ['id', 'name', 'startDate', 'endDate'] });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const plus30 = new Date(today); plus30.setDate(plus30.getDate() + 30);
    // Undated allocations are active from TODAY (engine rule), so the fallback window
    // never starts in the past — a past window would silently miss them.
    const fallbackFrom = laterOf(winFrom || toLocalDate(projectRow?.startDate) || today, today);
    let   fallbackTo   = winTo || toLocalDate(projectRow?.endDate) || plus30;
    if (fallbackTo < fallbackFrom) fallbackTo = new Date(fallbackFrom.getTime() + 30 * 86400000);

    const conflictsOf = (result, all) => result.ranges.map(r => {
      const day = toLocalDate(r.from);
      return {
        from: r.from, to: r.to, days: r.days, peak: r.peak,
        projects: all
          .filter(a => a.hoursPerDay != null && activeOn(a, day))
          .map(a => ({ projectId: a.projectId, projectName: a.projectName, segmentId: a.segmentId ?? null, hoursPerDay: a.hoursPerDay })),
      };
    });

    const preview = members.map((member) => {
      const all = byUser[String(member.userId)] || [];
      const mine = byMember[String(member.id)] || [];

      // ── per-segment results ────────────────────────────────────────────────
      const segments = mine.map((s) => {
        const hours = s.hoursPerDay == null ? null : Number(s.hoursPerDay);
        const sFrom = toLocalDate(s.fromDate), sTo = toLocalDate(s.toDate);
        // the segment's own dates clipped to the request window; its own dates when they do not meet
        let from = laterOf(sFrom, winFrom), to = earlierOf(sTo, winTo);
        if (!from || !to || from > to) { from = sFrom; to = sTo; }
        const others = all.filter(a => String(a.segmentId) !== String(s.id));
        const overOnItsOwn = hours != null && hours > capacity;
        const result = hours == null
          ? { ok: true, ranges: [], peak: 0, suggestions: null }
          : checkConflict(others, { hoursPerDay: hours, allocationFrom: from, allocationTo: to, projectId }, calendar);
        const conflicts = conflictsOf(result, [...others, { ...s.get({ plain: true }), segmentId: s.id, projectId, projectName: projectRow?.name, hoursPerDay: hours, allocationFrom: s.fromDate, allocationTo: s.toDate }]);
        return {
          segmentId: s.id,
          fromDate: s.fromDate, toDate: s.toDate,
          hoursPerDay: hours,
          allocationPct: toPct(hours, capacity),
          allocationMode: s.allocationMode || 'per_day',
          allocationTotalHours: s.allocationTotalHours == null ? null : Number(s.allocationTotalHours),
          hoursConfirmed: s.hoursConfirmed === true,
          isEstimated: s.hoursConfirmed !== true,
          exceptionStatus: s.exceptionStatus || 'none',
          peakHours: Math.round(Math.max(result.peak, hours || 0) * 10) / 10,
          isOverAllocated: !result.ok || overOnItsOwn,
          overOnItsOwn,
          invalidDates: false,
          windowFrom: from, windowTo: to,
          suggestions: result.suggestions || null,
          conflicts,
          hasConflict: conflicts.length > 0 || overOnItsOwn,
        };
      });

      // ── member-level fields (mirrored summary), as today ───────────────────
      const hoursPerDay = effectiveHours(member, capacity);
      const mFrom = toLocalDate(member.allocationFrom);
      const mTo   = toLocalDate(member.allocationTo);
      const invalidDates = Boolean(mFrom && mTo && mFrom > mTo);
      let from = invalidDates ? null : laterOf(mFrom, winFrom);
      let to   = invalidDates ? null : earlierOf(mTo, winTo);
      if (!from || !to || from > to) { from = fallbackFrom; to = fallbackTo; }
      const overOnItsOwn = hoursPerDay != null && hoursPerDay > capacity;

      let peakHours, isOverAllocated, suggestions, conflicts;
      if (segments.length) {
        // roll the per-period results up — a member is over when any period is
        peakHours       = segments.reduce((m, s) => Math.max(m, s.peakHours), 0);
        isOverAllocated = segments.some(s => s.isOverAllocated);
        suggestions     = (segments.find(s => s.isOverAllocated) || {}).suggestions || null;
        conflicts       = segments.flatMap(s => s.conflicts.map(c => ({ ...c, segmentId: s.segmentId })));
      } else {
        // no period yet (legacy / unset row) → legacy summary-based assessment
        const others = all.filter(a => String(a.memberId) !== String(member.id));
        const result = hoursPerDay == null
          ? { ok: true, ranges: [], peak: hoursPerDay || 0, suggestions: null }
          : checkConflict(others, { hoursPerDay, allocationFrom: from, allocationTo: to, projectId }, calendar);
        peakHours       = Math.round(Math.max(result.peak, hoursPerDay || 0) * 10) / 10;
        isOverAllocated = !result.ok || overOnItsOwn;
        suggestions     = result.suggestions || null;
        conflicts       = conflictsOf(result, all);
      }

      return {
        memberId: member.id,
        userId: member.userId,
        user:   member.user,
        name:   member.user?.name,
        email:  member.user?.email,
        role:   member.role,
        hoursPerDay,
        allocationPct:  toPct(hoursPerDay, capacity),
        isEstimated:    member.hoursConfirmed !== true,
        isUnset:        hoursPerDay == null && segments.length === 0,
        allocationFrom: member.allocationFrom,
        allocationTo:   member.allocationTo,
        exceptionStatus: member.exceptionStatus || 'none',
        capacity,
        segments,
        allAllocations: all.map(a => ({
          segmentId:      a.segmentId ?? null,
          memberId:       a.memberId ?? null,
          projectId:      a.projectId,
          projectName:    a.projectName,
          hoursPerDay:    a.hoursPerDay,
          pct:            a.allocationPct,
          allocationMode:       a.allocationMode,
          allocationTotalHours: a.allocationTotalHours,
          allocationFrom: a.allocationFrom,
          allocationTo:   a.allocationTo,
          exceptionStatus: a.exceptionStatus || 'none',
        })),
        peakHours,
        isOverAllocated,
        overOnItsOwn,
        invalidDates,
        windowFrom: from, windowTo: to,
        suggestions,
        conflicts,
        hasConflict: conflicts.length > 0 || isOverAllocated,
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
      return res.status(400).json({ success: false, message: 'Invalid fromDate' });
    }
    if (!toDate || isNaN(new Date(toDate).getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid toDate' });
    }
    if (new Date(fromDate) > new Date(toDate)) {
      return res.status(400).json({ success: false, message: 'fromDate must be before toDate' });
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
      return res.status(400).json({ success: false, message: "allocationMode must be 'per_day' or 'total'" });
    }
    const resolved = resolveAllocation({
      allocationMode: mode,
      hoursPerDay,
      allocationTotalHours: req.body.allocationTotalHours,
      allocationFrom: fromDate,
      allocationTo:   toDate,
    }, calendar);
    if (!resolved.ok) return res.status(400).json({ success: false, message: resolved.error });
    const hours = resolved.hoursPerDay;
    // Validate userId exists
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    const User = require('../../models/User');
    const targetUser = await User.findByPk(userId, { attributes: ['id'] });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
    const approval = await PmAllocationApproval.create({
      id: require('crypto').randomUUID(),
      projectId: req.params.id,
      userId,
      requestedById: req.user._id || req.user.id,
      requestType: 'capacity_release',   // B10: distinct from 'exception' requests
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

    // Capacity-release requests only. Over-allocation EXCEPTIONS are decided in the
    // Allocation exceptions inbox (admin) — they must not appear in this panel, which
    // would otherwise hand them to the wrong handler.
    const approvals = await PmAllocationApproval.findAll({
      where: {
        projectId: id, status: 'pending',
        [Op.or]: [{ requestType: 'capacity_release' }, { requestType: null }],
      },
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
// Manager of the source project approves or rejects the capacity release request.
// Approve → the member's SEGMENT overlapping approval.fromDate–toDate is trimmed/
// split to that window and set to the agreed hours (projectService.applyCapacityRelease).
// RESTRICTION: several overlapping periods (or none, or a pending-exception one)
// → 409 with a message; the approval stays pending so the PM can fix the periods first.
const respondToAllocationApproval = async (req, res, next) => {
  try {
    const { approvalId } = req.params;
    const { action, responseNote } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be approve or reject' });
    }
    const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');

    const approval = await PmAllocationApproval.findByPk(approvalId);
    if (!approval) {
      const message = 'Approval request not found';
      return res.status(404).json({ success: false, message, error: { message } });
    }
    if (approval.requestType === 'exception') {
      const message = 'This is an over-allocation exception — decide it in Allocation exceptions';
      return res.status(400).json({ success: false, message, error: { message } });
    }

    // Guard: prevent re-deciding an already approved or rejected request
    if (approval.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: `This request has already been ${approval.status}. No changes made.`,
      });
    }

    // Approvals created before migration 039 carry only allocationPct → convert.
    const capacity = (await pmSettingsService.getCalendar()).hoursPerDay;
    const hours = approval.hoursPerDay != null
      ? Number(approval.hoursPerDay)
      : (approval.allocationPct != null ? half(Number(approval.allocationPct) * capacity / 100) : null);

    const decision = {
      status: action === 'approve' ? 'approved' : 'rejected',
      approverNote: responseNote || null,
      approvedById: req.user._id || req.user.id,
    };

    // Segment write and the decision commit together — a 409/400 leaves the approval
    // pending AND the periods untouched.
    let release = null;
    if (action === 'approve' && hours != null) {
      try {
        release = await projectService.applyCapacityRelease(approval, hours, req.user, { decision });
      } catch (e) { return mapExceptionError(e, res, next); }
    } else {
      await approval.update(decision);
    }

    const body = approval.toJSON();
    if (release) { body.member = release.member; body.segment = release.segment; }
    return sendSuccess(res, body, `Request ${action}d`);
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

    // The exception cap is the ONE setting a non-admin needs here: the bulk-assign
    // exception modal guards against asking for more than an approver could ever
    // grant, and GET /pm/settings is admin-only. Nothing else from settings goes out.
    const { maxHoursPerDay: exceptionMaxHoursPerDay } = await pmSettingsService.getExceptionPolicy();

    return sendSuccess(res, {
      userId,
      allocations: relevant,
      ...summary,
      exceptionMaxHoursPerDay,
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
    const User = require('../../models/User');

    // Calendar loaded ONCE per request, shared by every member below
    const calendar = await pmSettingsService.getCalendar();
    const capacity = calendar.hoursPerDay;
    // Same cap as GET /pm/users/:userId/availability — this list feeds the same
    // allocation/exception UI, so both shapes carry it.
    const { maxHoursPerDay: exceptionMaxHoursPerDay } = await pmSettingsService.getExceptionPolicy();

    // Step 1: Get all userIds on this project
    const thisProjectMembers = await ProjectMember.findAll({
      where: { projectId: id },
      attributes: ['userId'],
    });
    const userIds = [...new Set(thisProjectMembers.map(m => m.userId).filter(Boolean))];

    if (userIds.length === 0) return sendSuccess(res, [], 'No members');

    // Step 2: every counted allocation of those users — project periods AND open tickets
    const byUser = {};
    for (const uid of userIds) byUser[String(uid)] = [];
    for (const a of await alloc.loadAllocationsForUsers(userIds, { countedOnly: true, calendar })) {
      const uid = String(a.userId);
      if (byUser[uid]) byUser[uid].push(a);
    }
    const users = await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'name', 'email', 'designation'], raw: true });
    const userById = Object.fromEntries(users.map(u => [String(u.id), u]));

    // Step 3: Compute stats per user (today + 30 days)
    const result = userIds.map(userId => {
      const allocations = byUser[String(userId)] || [];

      if (allocations.length === 0) {
        return {
          userId, hasNoData: true, capacity,
          peakHours: 0, avgHours: 0, freeHours: capacity,
          totalCommitted: 0, freeCapacity: capacity,
          allocations: [], nextFreeDate: null, isOverAllocated: false, projectCount: 0,
          exceptionMaxHoursPerDay,
          user: userById[String(userId)] || null,
        };
      }

      const summary = buildAvailability(allocations, calendar, null, null);
      return {
        userId,
        user: userById[String(userId)] || null,
        hasNoData: false,
        ...summary,
        exceptionMaxHoursPerDay,
        allocations,   // one per segment (segmentId, memberId, projectId, …)
      };
    });

    return sendSuccess(res, result, 'Member availability fetched');
  } catch (err) { next(err); }
};

// ── Allocation exceptions (B6/B7) ────────────────────────────────────────────
// Service enforces permission, cap, "fits → no exception needed", approver
// roles and self-approval; the controller maps errors and sends notifications.

const EXCEPTIONS_LINK = () => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pm/allocation-exceptions`;

/** Resolve display names for the email bodies (never throws — best effort). */
const loadExceptionContext = async (approval) => {
  const User = require('../../models/User');
  const Project = require('../../models/pm/Project');
  const HdTicket = require('../../models/helpdesk/HdTicket');
  const [project, ticket, user, requester] = await Promise.all([
    approval.projectId ? Project.findByPk(approval.projectId, { attributes: ['id', 'name'] }) : null,
    approval.ticketId ? HdTicket.findByPk(approval.ticketId, { attributes: ['id', 'reqNumber', 'title'] }) : null,
    approval.userId ? User.findByPk(approval.userId, { attributes: ['id', 'name', 'email'] }) : null,
    approval.requestedById ? User.findByPk(approval.requestedById, { attributes: ['id', 'name', 'email'] }) : null,
  ]);
  // A ticket exception belongs to NO project — the email must name the TICKET
  // (REQ number + title) or it says nothing useful.
  const ticketLabel = ticket
    ? `ticket ${ticket.reqNumber || `#${ticket.id}`}${ticket.title ? ` — ${ticket.title}` : ''}`
    : (approval.ticketId ? `ticket #${approval.ticketId}` : null);
  return {
    isTicket:      Boolean(approval.ticketId),
    ticketRef:     ticket
      ? { id: ticket.id, reqNumber: ticket.reqNumber, title: ticket.title }
      : (approval.ticketId ? { id: approval.ticketId, reqNumber: null, title: null } : null),
    projectName:   ticketLabel || project?.name || approval.projectId || 'Project',
    userName:      user?.name || approval.userId || 'Member',
    requesterName: requester?.name || (approval.ticketId ? 'A helpdesk agent' : 'A project manager'),
    requesterEmail: requester?.email || null,
    hoursPerDay:   approval.hoursPerDay,
    overloadHours: approval.overloadHours,
    fromDate:      approval.fromDate,
    toDate:        approval.toDate,
    reason:        approval.reason,
    link:          EXCEPTIONS_LINK(),
  };
};

/** On request: mail every active user whose role ∈ exceptionApproverRoles, excluding the requester. */
const notifyExceptionRequested = async (approval, reqUser) => {
  const User = require('../../models/User');
  const settings = await pmSettingsService.getSettings();
  const roles = Array.isArray(settings?.exceptionApproverRoles) && settings.exceptionApproverRoles.length
    ? settings.exceptionApproverRoles
    : ['admin'];
  const requesterId = reqUser?._id || reqUser?.id;
  const approvers = await User.findAll({
    where: {
      isActive: true,
      role: { [Op.in]: roles },
      email: { [Op.ne]: null },
      ...(requesterId ? { id: { [Op.ne]: requesterId } } : {}),
    },
    attributes: ['id', 'email'],
  });
  const toList = [...new Set(approvers.map(u => u.email).filter(Boolean))];
  if (!toList.length) return null;
  const ctx = await loadExceptionContext(approval);
  return emailService.sendAllocationExceptionRequestedEmail(toList, {
    ...ctx,
    requesterName: reqUser?.name || ctx.requesterName,
  });
};

/** On decision: mail the requester. */
const notifyExceptionDecided = async (approval, action, reqUser, responseNote) => {
  const ctx = await loadExceptionContext(approval);
  if (!ctx.requesterEmail) return null;
  return emailService.sendAllocationExceptionDecidedEmail(ctx.requesterEmail, {
    ...ctx,
    action,
    approverName: reqUser?.name || 'An approver',
    responseNote: responseNote || null,
  });
};

// POST /pm/projects/:id/allocation-exception
const requestAllocationException = async (req, res, next) => {
  try {
    const result = await projectService.requestAllocationException(req.params.id, req.body, req.user);
    // Fire-and-forget: mail failures never fail the API
    if (result?.approval) notifyExceptionRequested(result.approval, req.user).catch(() => {});
    sendSuccess(res, result, 'Allocation exception requested', 201);
  } catch (e) { mapExceptionError(e, res, next); }
};

// GET /pm/allocation-exceptions?status=
const listAllocationExceptions = async (req, res, next) => {
  try {
    sendSuccess(res, await projectService.listAllocationExceptions({ status: req.query.status }, req.user));
  } catch (e) { mapExceptionError(e, res, next); }
};

// PATCH /pm/allocation-exceptions/:approvalId
const decideAllocationException = async (req, res, next) => {
  try {
    const { action, responseNote } = req.body || {};
    if (!['approve', 'reject'].includes(action)) {
      const message = 'action must be approve or reject';
      return res.status(400).json({ success: false, message, error: { message } });
    }
    const result = await projectService.decideAllocationException(req.params.approvalId, { action, responseNote }, req.user);
    if (result?.approval) notifyExceptionDecided(result.approval, action, req.user, responseNote).catch(() => {});
    sendSuccess(res, result, `Exception ${action === 'approve' ? 'approved' : 'rejected'}`);
  } catch (e) { mapExceptionError(e, res, next); }
};

// DELETE /pm/allocation-exceptions/:approvalId — withdraw a pending request (requester or project manager)
const cancelAllocationException = async (req, res, next) => {
  try {
    const result = await projectService.cancelAllocationException(req.params.approvalId, req.user);
    sendSuccess(res, result, 'Exception request withdrawn');
  } catch (e) { mapExceptionError(e, res, next); }
};

// ── Allocation segments (B5) ─────────────────────────────────────────────────
// Thin handlers over allocation.service: permission / S1 / conflict / mirror /
// history all live in the service. Every 4xx uses the dual shape, 409 via
// mapAllocationError (through mapExceptionError).

// GET /pm/projects/:id/members/:memberId/segments
const listSegments = async (req, res, next) => {
  try {
    await projectService.assertProjectVisible(req.params.id, req.user);
    sendSuccess(res, await alloc.listSegments(req.params.id, req.params.memberId));
  } catch (e) { mapExceptionError(e, res, next); }
};

// POST /pm/projects/:id/members/:memberId/segments
const addSegment = async (req, res, next) => {
  try {
    sendSuccess(res, await alloc.addSegment(req.params.id, req.params.memberId, req.body || {}, req.user), 'Period added', 201);
  } catch (e) { mapExceptionError(e, res, next); }
};

// PUT /pm/projects/:id/members/:memberId/segments/:segmentId
const updateSegment = async (req, res, next) => {
  try {
    sendSuccess(res, await alloc.updateSegment(req.params.id, req.params.memberId, req.params.segmentId, req.body || {}, req.user), 'Period updated');
  } catch (e) { mapExceptionError(e, res, next); }
};

// DELETE /pm/projects/:id/members/:memberId/segments/:segmentId
const removeSegment = async (req, res, next) => {
  try {
    await alloc.removeSegment(req.params.id, req.params.memberId, req.params.segmentId, req.user);
    sendSuccess(res, null, 'Period removed');
  } catch (e) { mapExceptionError(e, res, next); }
};

// PATCH /pm/projects/:id/members/:memberId/segments/:segmentId/confirm
const confirmSegment = async (req, res, next) => {
  try {
    sendSuccess(res, await alloc.confirmSegment(req.params.id, req.params.memberId, req.params.segmentId, req.user), 'Hours confirmed');
  } catch (e) { mapExceptionError(e, res, next); }
};

// POST /pm/projects/:id/members/:memberId/release  { fromDate }
const releaseMember = async (req, res, next) => {
  try {
    const { fromDate } = req.body || {};
    sendSuccess(res, await alloc.releaseMember(req.params.id, req.params.memberId, { fromDate }, req.user), 'Hours released');
  } catch (e) { mapExceptionError(e, res, next); }
};

// GET /pm/projects/:id/allocation-grid?from=YYYY-MM&to=YYYY-MM
const getAllocationGrid = async (req, res, next) => {
  try {
    await projectService.assertProjectVisible(req.params.id, req.user);
    const { from, to } = req.query;
    sendSuccess(res, await alloc.gridFor(req.params.id, { from, to }));
  } catch (e) { mapExceptionError(e, res, next); }
};

// POST /pm/projects/:id/allocation-grid  { changes:[{ memberId, month, hoursPerDay|null }] }
// Partial success: { applied, errors:[{ memberId, month, message, conflict? }] } — always 200.
const applyAllocationGrid = async (req, res, next) => {
  try {
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : null;
    if (!changes) {
      const message = 'changes must be an array of { memberId, month, hoursPerDay }';
      return res.status(400).json({ success: false, message, error: { message } });
    }
    sendSuccess(res, await alloc.applyGrid(req.params.id, { changes }, req.user), 'Grid applied');
  } catch (e) { mapExceptionError(e, res, next); }
};

// GET /pm/projects/:id/allocation-history?memberId=&limit=
const getAllocationHistory = async (req, res, next) => {
  try {
    await projectService.assertProjectVisible(req.params.id, req.user);
    const { memberId } = req.query;
    const limit = req.query.limit != null && req.query.limit !== '' ? Number(req.query.limit) : undefined;
    sendSuccess(res, await alloc.listHistory(req.params.id, { memberId: memberId || null, limit }));
  } catch (e) { mapExceptionError(e, res, next); }
};

module.exports = {
  cancelAllocationException,
  getProjects, getProjectById, createProject, checkProjectName, updateProject, deleteProject, getProjectSummary,
  getMembers, addMember, updateMember, confirmMemberHours, removeMember,
  getRecipients, addRecipient, removeRecipient,
  getAllocationPreview, requestAllocationApproval,
  getProjectAllocationApprovals, respondToAllocationApproval,
  getUserAvailability,
  getMembersAvailability,
  requestAllocationException, listAllocationExceptions, decideAllocationException,
  // Exception notifications — reused by the helpdesk ticket exception endpoint so
  // both halves of the ONE exception flow mail the same approvers the same way.
  notifyExceptionRequested, notifyExceptionDecided, loadExceptionContext,
  // segments / grid / history (B5)
  listSegments, addSegment, updateSegment, removeSegment, confirmSegment, releaseMember,
  getAllocationGrid, applyAllocationGrid, getAllocationHistory,
};
