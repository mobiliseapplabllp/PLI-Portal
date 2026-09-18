/**
 * Allocation Service — time-phased allocation SEGMENTS of project members.
 *
 * A member (pm_project_members) owns N non-overlapping segments
 * (pm_allocation_segments); each is one period with one hours/day amount.
 *
 *   S1  segments of one member never overlap (400 "Overlaps an existing period …")
 *   S2  capacity / conflict / exception logic runs PER SEGMENT; "others" = every
 *       counted segment of the same user on a non-inactive project, excluding
 *       the segment being edited
 *   S3  the legacy member columns are a MIRRORED SUMMARY of the segments
 *       (mirrorMemberSummary) written after every segment write — nothing else
 *       writes them
 *
 * This is the ONE loader (loadSegmentsForUsers) and the ONE set of writers.
 * project.service / utilisation.service / the controller call in here.
 * Every write path runs in a transaction and appends a pm_allocation_history row.
 *
 * Contract (keep stable — other callers depend on it):
 *   loadSegmentsForUsers(userIds, { countedOnly=true, excludeSegmentId=null, calendar, transaction })
 *   listSegments(projectId, memberId)
 *   addSegment(projectId, memberId, body, user)          body { fromDate, toDate, allocationMode?, hoursPerDay?, allocationTotalHours?, note?, hoursConfirmed? }
 *   updateSegment(projectId, memberId, segmentId, body, user)
 *   removeSegment(projectId, memberId, segmentId, user)
 *   confirmSegment(projectId, memberId, segmentId, user)
 *   confirmAllSegments(projectId, memberId, user)
 *   releaseMember(projectId, memberId, { fromDate }, user) → { ended, removed }
 *   quickEnd(segmentId, date, user)
 *   gridFor(projectId, { from, to }) / applyGrid(projectId, { changes }, user)
 *   mirrorMemberSummary(memberId, transaction?)
 *   logAllocation({ projectId, memberId, segmentId, ticketId, userId, action, before, after, byId, note }, transaction?)
 *   listHistory(projectId, { memberId, limit=200 })
 *   helpers: assertNoOverlap, assertNoConflict, otherAllocationsFor, serializeSegment, snapshotOfSegment
 *
 * Dates are LOCAL 'YYYY-MM-DD' strings everywhere — never toISOString().
 */

const { Op } = require('sequelize');
const sequelize = require('../../config/database');   // the INSTANCE — never `{ sequelize }`
const AllocationSegment    = require('../../models/pm/AllocationSegment');
const PmAllocationHistory  = require('../../models/pm/PmAllocationHistory');
const ProjectMember        = require('../../models/pm/ProjectMember');
const Project              = require('../../models/pm/Project');
const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
const User                 = require('../../models/User');
const pmSettingsService    = require('./pmSettings.service');
const { NotFoundError, ForbiddenError, ValidationError, ConflictError, AllocationConflictError } = require('../../utils/errors');
const {
  checkConflict, resolveAllocation, toPct, normaliseCalendar, monthBreakdown, getMonthlyCapacity,
  workingDaysBetween, toDate, iso,
} = require('../../utils/capacityEngine');

const INACTIVE_PROJECT_STATUSES = ['completed', 'cancelled', 'closed'];
/** D1: only these exception states count towards a person's load. */
const COUNTED_EXCEPTION_STATUSES = ['none', 'approved'];
const DAY_MS = 86400000;
const MAX_GRID_MONTHS = 24;
const DEFAULT_GRID_MONTHS = 6;   // today → +5 months

// ── Small helpers ─────────────────────────────────────────────────────────────

const uidOf = (user) => String(user?._id ?? user?.id);
const isBlank = (v) => v === undefined || v === null || v === '';
const capOf = (calendar) => normaliseCalendar(calendar).hoursPerDay;
const num = (v) => (v == null ? null : Number(v));
const dateOnly = (v) => (v ? (v instanceof Date ? iso(v) : String(v).slice(0, 10)) : null);
const todayIso = () => iso(new Date());
const addDays = (isoStr, n) => iso(new Date(toDate(isoStr).getTime() + n * DAY_MS));
const fmtShort = (s) => toDate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const overlaps = (aFrom, aTo, bFrom, bTo) => aFrom <= bTo && aTo >= bFrom;

const canManageProject = (project, user) =>
  ['admin', 'manager', 'senior_manager'].includes(user?.role) || String(project.managerId) === uidOf(user);

const PROJECT_ATTRS = ['id', 'name', 'status', 'managerId', 'startDate', 'endDate'];

/** Load the project (404) and check the write permission (403). */
async function loadProjectForWrite(projectId, user, what = 'manage allocations') {
  const project = await Project.findByPk(projectId, { attributes: PROJECT_ATTRS });
  if (!project) throw new NotFoundError('Project');
  if (!canManageProject(project, user)) throw new ForbiddenError(`Only project manager or admin can ${what}`);
  return project;
}

async function loadMember(projectId, memberId, transaction) {
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId }, transaction });
  if (!member) throw new NotFoundError('Project Member');
  return member;
}

async function loadSegment(memberId, segmentId, transaction, lock = false) {
  const seg = await AllocationSegment.findOne({
    where: { id: segmentId, memberId }, transaction, ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!seg) throw new NotFoundError('Allocation period');
  return seg;
}

const memberSegments = (memberId, transaction, lock = false) =>
  AllocationSegment.findAll({
    where: { memberId }, order: [['fromDate', 'ASC']], transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });

/** Validate a 'YYYY-MM-DD' pair (both required, from ≤ to). Returns normalised strings. */
function validateDates(fromDate, toDate_) {
  const f = dateOnly(fromDate), t = dateOnly(toDate_);
  if (!f || !t) throw new ValidationError('fromDate and toDate are required');
  const fd = toDate(f), td = toDate(t);
  if (!fd || !td || iso(fd) !== f || iso(td) !== t) throw new ValidationError('Dates must be YYYY-MM-DD');
  if (td < fd) throw new ValidationError('End date is before start date');
  return { fromDate: f, toDate: t };
}

// ── Shapes ────────────────────────────────────────────────────────────────────

/** API shape of a segment row (numbers, local dates). */
function serializeSegment(seg) {
  const p = typeof seg.get === 'function' ? seg.get({ plain: true }) : seg;
  const out = {
    id:                   p.id,
    memberId:             p.memberId,
    projectId:            p.projectId,
    userId:               p.userId,
    fromDate:             dateOnly(p.fromDate),
    toDate:               dateOnly(p.toDate),
    allocationMode:       p.allocationMode || 'per_day',
    hoursPerDay:          num(p.hoursPerDay),
    allocationTotalHours: num(p.allocationTotalHours),
    hoursConfirmed:       p.hoursConfirmed === true || p.hoursConfirmed === 1,
    exceptionStatus:      p.exceptionStatus || 'none',
    exceptionApprovalId:  p.exceptionApprovalId || null,
    note:                 p.note ?? null,
    createdById:          p.createdById ?? null,
    createdAt:            p.createdAt ?? null,
    updatedAt:            p.updatedAt ?? null,
  };
  if (p.exceptionApproval) {
    const a = p.exceptionApproval;
    out.exceptionApproval = {
      id: a.id, status: a.status, approvedById: a.approvedById ?? null, approverNote: a.approverNote ?? null,
      approvedBy: a.approvedBy ? { id: a.approvedBy.id, name: a.approvedBy.name } : null,
    };
  }
  return out;
}

/** The fields captured in history before/after and in exception snapshots. */
const SNAPSHOT_FIELDS = [
  'fromDate', 'toDate', 'allocationMode', 'hoursPerDay', 'allocationTotalHours',
  'hoursConfirmed', 'exceptionStatus', 'exceptionApprovalId', 'note',
];
function snapshotOfSegment(seg) {
  const s = serializeSegment(seg);
  const out = {};
  for (const k of SNAPSHOT_FIELDS) out[k] = s[k] === undefined ? null : s[k];
  return out;
}

/** Engine allocation shape (what capacityEngine + every reader consumes). */
function toEngineAllocation(seg, calendar) {
  const capacity = capOf(calendar);
  const hours = num(seg.hoursPerDay);
  return {
    source:               'project',   // 'helpdesk' rows come from loadTicketAllocationsForUsers
    segmentId:            seg.id,
    memberId:             seg.memberId,
    projectId:            seg.projectId,
    projectName:          seg.project?.name,
    projectStatus:        seg.project?.status,
    projectManagerId:     seg.project?.managerId,
    userId:               seg.userId,
    hoursPerDay:          hours,
    allocationPct:        toPct(hours, capacity),
    allocationMode:       seg.allocationMode || 'per_day',
    allocationTotalHours: num(seg.allocationTotalHours),
    allocationFrom:       dateOnly(seg.fromDate),
    allocationTo:         dateOnly(seg.toDate),
    hoursConfirmed:       seg.hoursConfirmed === true || seg.hoursConfirmed === 1,
    isEstimated:          !(seg.hoursConfirmed === true || seg.hoursConfirmed === 1),
    exceptionStatus:      seg.exceptionStatus || 'none',
  };
}

// ── The ONE loader ────────────────────────────────────────────────────────────

/**
 * Every segment of the given users on NON-inactive projects, as engine allocations.
 *   countedOnly (default true) → only exceptionStatus 'none' / 'approved' (D1)
 *   excludeSegmentId          → leave out the segment being edited (S2)
 *   calendar                  → pass when you already have it (else loaded once)
 *   transaction               → see rows written inside an open transaction
 */
async function loadSegmentsForUsers(userIds, { countedOnly = true, excludeSegmentId = null, calendar, transaction } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  const cal = calendar || await pmSettingsService.getCalendar();
  const where = { userId: { [Op.in]: ids } };
  if (countedOnly) where.exceptionStatus = { [Op.in]: COUNTED_EXCEPTION_STATUSES };
  if (excludeSegmentId) where.id = { [Op.ne]: excludeSegmentId };
  const rows = await AllocationSegment.findAll({
    where,
    include: [{
      model: Project, as: 'project', attributes: ['id', 'name', 'status', 'managerId'], required: true,
      where: { status: { [Op.notIn]: INACTIVE_PROJECT_STATUSES } },
    }],
    order: [['fromDate', 'ASC']],
    transaction,
  });
  return rows.map(r => toEngineAllocation(r, cal));
}

/** Ticket statuses that no longer consume capacity. */
const INACTIVE_TICKET_STATUSES = ['closed', 'resolved'];

/**
 * Helpdesk ticket allocations of the given users, as engine allocations.
 * A person's real load is projects PLUS the tickets assigned to them, so every
 * capacity surface must count both — the utilisation heat map always did, and
 * availability / preview / conflict checks would otherwise disagree with it.
 *   excludeTicketId → leave out the ticket being edited (same idea as excludeSegmentId)
 *
 * D1 for tickets: a ticket whose allocation exception is still UNDECIDED does not
 * count, exactly as a pending segment does not. There is no exceptionStatus column
 * on hd_tickets — the state is DERIVED from the open approval row (migration 047),
 * so there is one source of truth and nothing can drift out of sync.
 */
const PENDING_TICKET_EXCEPTION_SQL =
  `(SELECT ticketId FROM pm_allocation_approvals
     WHERE requestType = 'exception' AND status = 'pending' AND ticketId IS NOT NULL)`;

async function loadTicketAllocationsForUsers(userIds, { excludeTicketId = null, countedOnly = true, transaction } = {}) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) return [];
  const HdTicket = require('../../models/helpdesk/HdTicket');
  const where = {
    assigneeId: { [Op.in]: ids },
    allocationHoursPerDay: { [Op.ne]: null },
    status: { [Op.notIn]: INACTIVE_TICKET_STATUSES },
  };
  const idWhere = {};
  if (excludeTicketId) idWhere[Op.ne] = excludeTicketId;
  if (countedOnly) idWhere[Op.notIn] = sequelize.literal(PENDING_TICKET_EXCEPTION_SQL);
  if (Object.getOwnPropertySymbols(idWhere).length) where.id = idWhere;
  const rows = await HdTicket.findAll({
    where,
    attributes: ['id', 'reqNumber', 'title', 'status', 'assigneeId', 'allocationHoursPerDay',
                 'allocationFrom', 'allocationTo', 'dueDate', 'allocationMode', 'allocationTotalHours'],
    transaction,
  });
  return rows.map(t => ({
    source: 'helpdesk',
    ticketId: t.id,
    segmentId: null,
    memberId: null,
    projectId: null,
    projectName: `${t.reqNumber || 'Ticket'} · ${t.title || ''}`.trim(),
    projectStatus: t.status,
    userId: String(t.assigneeId),
    hoursPerDay: Number(t.allocationHoursPerDay),
    allocationMode: t.allocationMode || 'total',
    allocationTotalHours: t.allocationTotalHours == null ? null : Number(t.allocationTotalHours),
    allocationFrom: dateOnly(t.allocationFrom),
    // No explicit end → the ticket's due date; still none → the engine treats it as open-ended
    allocationTo: dateOnly(t.allocationTo) || dateOnly(t.dueDate),
    hoursConfirmed: true,
    isEstimated: false,
    exceptionStatus: 'none',
  }));
}

/**
 * THE capacity picture for a set of users: project periods + helpdesk tickets.
 * Every availability / preview / conflict caller uses this; pass
 * `{ includeTickets: false }` only when you deliberately want projects alone.
 */
async function loadAllocationsForUsers(userIds, opts = {}) {
  const { includeTickets = true, excludeTicketId = null, ...segOpts } = opts;
  const segments = await loadSegmentsForUsers(userIds, segOpts);
  if (!includeTickets) return segments;
  const tickets = await loadTicketAllocationsForUsers(userIds, {
    excludeTicketId,
    countedOnly: segOpts.countedOnly !== false,
    transaction: segOpts.transaction,
  });
  return [...segments, ...tickets];
}

/** One user's counted allocations (projects + tickets), excluding one segment (and/or one ticket). */
const otherAllocationsFor = (userId, excludeSegmentId = null, opts = {}) =>
  loadAllocationsForUsers([userId], { ...opts, countedOnly: true, excludeSegmentId });

// ── Rules ─────────────────────────────────────────────────────────────────────

/**
 * S1 — throws 400 when [fromDate, toDate] touches any other segment of the member.
 * `segments` = the member's segments (rows or plain); `excludeSegmentId` = the one being edited.
 */
function assertNoOverlap(segments, fromDate, toDate_, excludeSegmentId = null) {
  const f = dateOnly(fromDate), t = dateOnly(toDate_);
  for (const s of segments || []) {
    if (excludeSegmentId && String(s.id) === String(excludeSegmentId)) continue;
    const sf = dateOnly(s.fromDate), st = dateOnly(s.toDate);
    if (overlaps(sf, st, f, t)) {
      throw new ValidationError(`Overlaps an existing period ${fmtShort(sf)}–${fmtShort(st)}`);
    }
  }
}

/**
 * S2 — throws AllocationConflictError (409) when the proposed segment pushes the
 * person over capacity on any working day. The 409 carries the engine
 * suggestions plus the exception cap so the client can offer "Request exception…".
 *
 * `excludeTicketId` does for a helpdesk ticket what excludeSegmentId does for a
 * segment: the ticket being edited must not double-count against its own new hours.
 */
async function assertNoConflict(userId, proposed, calendar, excludeSegmentId = null, { transaction, excludeTicketId = null } = {}) {
  if (proposed.hoursPerDay == null) return;
  const others = await otherAllocationsFor(userId, excludeSegmentId, { calendar, transaction, excludeTicketId });
  const result = checkConflict(others, proposed, calendar);
  if (!result.ok) {
    const { maxHoursPerDay } = await pmSettingsService.getExceptionPolicy();
    throw new AllocationConflictError(result, capOf(calendar), { exceptionMaxHoursPerDay: maxHoursPerDay, canRequestException: true });
  }
}

/** True when the body carries any allocation amount input (mode / hours / total / legacy pct). */
const hasAmountInput = (b) =>
  !isBlank(b.allocationMode) || !isBlank(b.hoursPerDay) || !isBlank(b.allocationTotalHours) || !isBlank(b.allocationPct);

/**
 * Resolve the amount to store from a body + (optional) existing segment over the window.
 * Returns { mode, hoursPerDay, totalHours, explicit }.
 *   body carries an amount → resolveAllocation (explicit = true)
 *   else existing 'total'  → hours/day re-derived from the stored total over the new window
 *   else existing 'per_day'→ total re-derived from the stored hours/day (no re-validation)
 *   else                   → 400 (a new segment needs an amount)
 */
function resolveSegmentAmount(body, existing, fromDate, toDate_, calendar) {
  const capacity = capOf(calendar);
  if (hasAmountInput(body)) {
    let hoursPerDay = body.hoursPerDay;
    if (isBlank(hoursPerDay) && !isBlank(body.allocationPct)) {
      hoursPerDay = Math.round(Number(body.allocationPct) * capacity / 100 * 2) / 2;   // legacy %
    }
    let totalHours = body.allocationTotalHours;
    let mode = body.allocationMode;
    if (isBlank(mode)) mode = (isBlank(hoursPerDay) && !isBlank(totalHours)) ? 'total' : 'per_day';
    if (mode !== 'per_day' && mode !== 'total') throw new ValidationError("allocationMode must be 'per_day' or 'total'");
    if (existing) {
      if (mode === 'total'   && isBlank(totalHours))  totalHours  = existing.allocationTotalHours;
      if (mode === 'per_day' && isBlank(hoursPerDay)) hoursPerDay = existing.hoursPerDay;
    }
    const r = resolveAllocation({ allocationMode: mode, hoursPerDay, allocationTotalHours: totalHours, allocationFrom: fromDate, allocationTo: toDate_ }, calendar);
    if (!r.ok) throw new ValidationError(r.error);
    return { mode: r.mode, hoursPerDay: r.hoursPerDay, totalHours: r.totalHours, explicit: true };
  }
  if (!existing) throw new ValidationError('hoursPerDay or allocationTotalHours is required');
  if (existing.allocationMode === 'total' && existing.allocationTotalHours != null) {
    const r = resolveAllocation({ allocationMode: 'total', allocationTotalHours: existing.allocationTotalHours, allocationFrom: fromDate, allocationTo: toDate_ }, calendar);
    if (!r.ok) throw new ValidationError(r.error);
    return { mode: 'total', hoursPerDay: r.hoursPerDay, totalHours: r.totalHours, explicit: false };
  }
  const hpd = num(existing.hoursPerDay);
  const wd  = workingDaysBetween(fromDate, toDate_, calendar);
  return { mode: 'per_day', hoursPerDay: hpd, totalHours: Math.round(hpd * wd * 10) / 10, explicit: false };
}

const assertNotPending = (seg) => {
  if (seg.exceptionStatus === 'pending') {
    throw new ConflictError('This period has a pending allocation exception — decide it before changing it');
  }
};

// ── History + summary mirror ──────────────────────────────────────────────────

/**
 * Append one pm_allocation_history row.
 * A PROJECT write carries projectId + memberId; a helpdesk TICKET exception
 * carries ticketId with both of those NULL (migration 048).
 */
async function logAllocation({ projectId = null, memberId = null, segmentId = null, ticketId = null, userId, action, before = null, after = null, byId = null, note = null }, transaction) {
  if (!PmAllocationHistory.HISTORY_ACTIONS.includes(action)) throw new ValidationError(`Unknown allocation history action "${action}"`);
  await PmAllocationHistory.create({
    projectId, memberId, segmentId, ticketId, userId, action,
    before: before ?? null, after: after ?? null,
    byId: byId ?? null,
    note: note == null ? null : String(note).slice(0, 255),
  }, { transaction });
}

/**
 * S3 — rewrite the legacy member columns from the member's segments:
 *   allocationFrom = min(fromDate), allocationTo = max(toDate)
 *   hoursPerDay / allocationMode / allocationTotalHours = the segment active today,
 *     else the next upcoming, else the last
 *   exceptionStatus = 'pending' if any pending, else 'approved' if any approved, else 'none'
 *     (exceptionApprovalId follows that segment)
 *   hoursConfirmed = every segment confirmed (false when there are none)
 *   allocationStatus = 'pending' while an exception is pending, else 'active'
 * No segments → allocation columns cleared (member keeps role/responsibilities).
 */
async function mirrorMemberSummary(memberId, transaction, calendarIn) {
  const member = await ProjectMember.findByPk(memberId, { transaction });
  if (!member) return;
  const segs = await memberSegments(memberId, transaction);
  // The caller usually already loaded the calendar (2 queries each time) — reuse it.
  const calendar = calendarIn || await pmSettingsService.getCalendar();
  const capacity = capOf(calendar);

  if (!segs.length) {
    Object.assign(member, {
      allocationFrom: null, allocationTo: null, hoursPerDay: null, allocationPct: null,
      allocationMode: 'per_day', allocationTotalHours: null, hoursConfirmed: false,
      exceptionStatus: 'none', exceptionApprovalId: null, allocationStatus: 'active',
    });
    await member.save({ transaction });
    return;
  }

  const t = todayIso();
  const byFrom = segs.map(s => ({ s, from: dateOnly(s.fromDate), to: dateOnly(s.toDate) }));
  const active   = byFrom.find(x => x.from <= t && x.to >= t);
  const upcoming = byFrom.filter(x => x.from > t).sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  const last     = [...byFrom].sort((a, b) => (a.to > b.to ? -1 : 1))[0];
  const primary  = (active || upcoming || last).s;

  const pending  = segs.find(s => s.exceptionStatus === 'pending');
  const approved = segs.find(s => s.exceptionStatus === 'approved');
  const excSeg   = pending || approved || null;
  const hpd = num(primary.hoursPerDay);

  Object.assign(member, {
    allocationFrom:       byFrom.reduce((m, x) => (x.from < m ? x.from : m), byFrom[0].from),
    allocationTo:         byFrom.reduce((m, x) => (x.to > m ? x.to : m), byFrom[0].to),
    hoursPerDay:          hpd,
    allocationPct:        hpd == null ? null : Math.min(255, Math.round(toPct(hpd, capacity))),
    allocationMode:       primary.allocationMode || 'per_day',
    allocationTotalHours: num(primary.allocationTotalHours),
    hoursConfirmed:       segs.every(s => s.hoursConfirmed === true || s.hoursConfirmed === 1),
    exceptionStatus:      pending ? 'pending' : approved ? 'approved' : 'none',
    exceptionApprovalId:  excSeg ? (excSeg.exceptionApprovalId || null) : null,
    allocationStatus:     pending ? 'pending' : 'active',
  });
  await member.save({ transaction });
}

// ── Readers ───────────────────────────────────────────────────────────────────

const SEGMENT_INCLUDE = [{
  model: PmAllocationApproval, as: 'exceptionApproval', required: false,
  attributes: ['id', 'status', 'approvedById', 'approverNote'],
  include: [{ model: User, as: 'approvedBy', attributes: ['id', 'name'], required: false }],
}];

async function listSegments(projectId, memberId) {
  const member = await ProjectMember.findOne({ where: { id: memberId, projectId }, attributes: ['id'] });
  if (!member) throw new NotFoundError('Project Member');
  const rows = await AllocationSegment.findAll({ where: { memberId }, include: SEGMENT_INCLUDE, order: [['fromDate', 'ASC']] });
  return rows.map(serializeSegment);
}

async function listHistory(projectId, { memberId, limit = 200 } = {}) {
  const where = { projectId };
  if (memberId) where.memberId = memberId;
  const lim = Math.max(1, Math.min(1000, Number(limit) || 200));
  const rows = await PmAllocationHistory.findAll({
    where, include: [{ model: User, as: 'by', attributes: ['id', 'name'], required: false }],
    order: [['createdAt', 'DESC']], limit: lim,
  });
  return rows.map(r => {
    const { by, ...p } = r.get({ plain: true });
    return { ...p, by: by ? { id: by.id, name: by.name } : null };
  });
}

// ── Writers ───────────────────────────────────────────────────────────────────

/** Create a segment. body { fromDate, toDate, allocationMode?, hoursPerDay?, allocationTotalHours?, note?, hoursConfirmed? } */
async function addSegment(projectId, memberId, body = {}, user) {
  const project = await loadProjectForWrite(projectId, user, 'add allocation periods');
  const member  = await loadMember(projectId, memberId);
  const { fromDate, toDate: toDate_ } = validateDates(body.fromDate, body.toDate);
  const calendar = await pmSettingsService.getCalendar();

  const r = resolveSegmentAmount(body, null, fromDate, toDate_, calendar);

  const seg = await sequelize.transaction(async (t) => {
    // Overlap + capacity are re-checked INSIDE the transaction with the member's rows
    // locked, so two concurrent saves cannot both pass and leave overlapping periods.
    assertNoOverlap(await memberSegments(memberId, t, true), fromDate, toDate_);
    await assertNoConflict(member.userId, { hoursPerDay: r.hoursPerDay, allocationFrom: fromDate, allocationTo: toDate_, projectId }, calendar, null, { transaction: t });
    const created = await AllocationSegment.create({
      memberId, projectId: project.id, userId: member.userId,
      fromDate, toDate: toDate_,
      allocationMode: r.mode, hoursPerDay: r.hoursPerDay, allocationTotalHours: r.totalHours,
      hoursConfirmed: body.hoursConfirmed === undefined ? true : Boolean(body.hoursConfirmed),
      exceptionStatus: 'none', exceptionApprovalId: null,
      note: isBlank(body.note) ? null : String(body.note).slice(0, 255),
      createdById: uidOf(user),
    }, { transaction: t });
    await mirrorMemberSummary(memberId, t, calendar);
    await logAllocation({ projectId, memberId, segmentId: created.id, userId: member.userId, action: 'add',
      after: snapshotOfSegment(created), byId: uidOf(user), note: created.note }, t);
    return created;
  });
  return serializeSegment(seg);
}

/** Update dates / amount / note / hoursConfirmed of one segment. */
async function updateSegment(projectId, memberId, segmentId, body = {}, user) {
  await loadProjectForWrite(projectId, user, 'update allocation periods');
  const member = await loadMember(projectId, memberId);
  const seg    = await loadSegment(memberId, segmentId);
  assertNotPending(seg);
  const calendar = await pmSettingsService.getCalendar();

  const { fromDate, toDate: toDate_ } = validateDates(
    'fromDate' in body ? body.fromDate : seg.fromDate,
    'toDate'   in body ? body.toDate   : seg.toDate
  );
  const r = resolveSegmentAmount(body, seg, fromDate, toDate_, calendar);

  const datesChanged  = fromDate !== dateOnly(seg.fromDate) || toDate_ !== dateOnly(seg.toDate);
  // the derived total is NOT an amount change on its own (it is re-derived silently below)
  const amountChanged = r.hoursPerDay !== num(seg.hoursPerDay) || r.mode !== seg.allocationMode;
  const touched = datesChanged || amountChanged || r.explicit;

  // An APPROVED exception segment may stay over capacity as long as its allocation is untouched
  const dropException = seg.exceptionStatus === 'approved' && touched;

  const before = snapshotOfSegment(seg);
  if (datesChanged)  { seg.fromDate = fromDate; seg.toDate = toDate_; }
  if (amountChanged || datesChanged || r.totalHours !== num(seg.allocationTotalHours)) {
    seg.allocationMode = r.mode; seg.hoursPerDay = r.hoursPerDay; seg.allocationTotalHours = r.totalHours;
  }
  if (r.explicit && seg.hoursConfirmed !== true) seg.hoursConfirmed = true;
  if ('hoursConfirmed' in body && body.hoursConfirmed !== undefined && Boolean(body.hoursConfirmed) !== seg.hoursConfirmed) seg.hoursConfirmed = Boolean(body.hoursConfirmed);
  if ('note' in body) { const n = isBlank(body.note) ? null : String(body.note).slice(0, 255); if (n !== (seg.note ?? null)) seg.note = n; }
  if (dropException) { seg.exceptionStatus = 'none'; seg.exceptionApprovalId = null; }

  if (!seg.changed()) return serializeSegment(seg);
  await sequelize.transaction(async (t) => {
    // Locked re-check inside the transaction (same reason as addSegment).
    assertNoOverlap(await memberSegments(memberId, t, true), fromDate, toDate_, seg.id);
    if (seg.exceptionStatus !== 'approved' || touched) {
      await assertNoConflict(member.userId, { hoursPerDay: r.hoursPerDay, allocationFrom: fromDate, allocationTo: toDate_, projectId }, calendar, seg.id, { transaction: t });
    }
    await seg.save({ transaction: t });
    await mirrorMemberSummary(memberId, t, calendar);
    await logAllocation({ projectId, memberId, segmentId: seg.id, userId: member.userId, action: 'update',
      before, after: snapshotOfSegment(seg), byId: uidOf(user), note: 'note' in body ? seg.note : null }, t);
  });
  return serializeSegment(seg);
}

async function removeSegment(projectId, memberId, segmentId, user) {
  await loadProjectForWrite(projectId, user, 'remove allocation periods');
  const member = await loadMember(projectId, memberId);
  const seg    = await loadSegment(memberId, segmentId);
  assertNotPending(seg);
  await sequelize.transaction(async (t) => {
    const before = snapshotOfSegment(seg);
    await seg.destroy({ transaction: t });
    await mirrorMemberSummary(memberId, t);
    await logAllocation({ projectId, memberId, segmentId: seg.id, userId: member.userId, action: 'remove', before, byId: uidOf(user) }, t);
  });
}

async function confirmSegment(projectId, memberId, segmentId, user) {
  await loadProjectForWrite(projectId, user, 'confirm allocation periods');
  const member = await loadMember(projectId, memberId);
  const seg    = await loadSegment(memberId, segmentId);
  if (seg.hoursConfirmed === true) return serializeSegment(seg);
  await sequelize.transaction(async (t) => {
    const before = snapshotOfSegment(seg);
    seg.hoursConfirmed = true;
    await seg.save({ transaction: t });
    await mirrorMemberSummary(memberId, t);
    await logAllocation({ projectId, memberId, segmentId: seg.id, userId: member.userId, action: 'confirm', before, after: snapshotOfSegment(seg), byId: uidOf(user) }, t);
  });
  return serializeSegment(seg);
}

async function confirmAllSegments(projectId, memberId, user) {
  await loadProjectForWrite(projectId, user, 'confirm allocation periods');
  const member = await loadMember(projectId, memberId);
  const segs = await memberSegments(memberId);
  const todo = segs.filter(s => s.hoursConfirmed !== true);
  if (todo.length) {
    await sequelize.transaction(async (t) => {
      for (const seg of todo) {
        const before = snapshotOfSegment(seg);
        seg.hoursConfirmed = true;
        await seg.save({ transaction: t });
        await logAllocation({ projectId, memberId, segmentId: seg.id, userId: member.userId, action: 'confirm', before, after: snapshotOfSegment(seg), byId: uidOf(user) }, t);
      }
      await mirrorMemberSummary(memberId, t);
    });
  }
  return segs.map(serializeSegment);
}

/**
 * "Release all hours" from a date: every segment ending before it is untouched,
 * every segment starting on/after it is removed, every segment spanning it is
 * ended at fromDate − 1. Pending exception segments block the release (409).
 */
async function releaseMember(projectId, memberId, { fromDate } = {}, user) {
  await loadProjectForWrite(projectId, user, 'release allocations');
  const member = await loadMember(projectId, memberId);
  const from = dateOnly(fromDate) || todayIso();
  if (!toDate(from) || iso(toDate(from)) !== from) throw new ValidationError('fromDate must be YYYY-MM-DD');
  const calendar = await pmSettingsService.getCalendar();

  const segs = await memberSegments(memberId);
  const affected = segs.filter(s => dateOnly(s.toDate) >= from);
  if (affected.some(s => s.exceptionStatus === 'pending')) {
    throw new ConflictError('This member has a pending allocation exception — decide it before releasing hours');
  }

  let ended = 0, removed = 0;
  await sequelize.transaction(async (t) => {
    for (const seg of affected) {
      const before = snapshotOfSegment(seg);
      if (dateOnly(seg.fromDate) >= from) {
        await seg.destroy({ transaction: t });
        removed++;
        await logAllocation({ projectId, memberId, segmentId: seg.id, userId: member.userId, action: 'release', before, byId: uidOf(user), note: `Released from ${from}` }, t);
      } else {
        seg.toDate = addDays(from, -1);
        // A shortened period keeps its hours/day; the total is re-derived. A 'total'
        // period becomes per_day, because the agreed total no longer applies to the
        // shorter window (leaving mode 'total' would re-derive a smaller hours/day).
        seg.allocationMode = 'per_day';
        seg.allocationTotalHours = Math.round(num(seg.hoursPerDay) * workingDaysBetween(dateOnly(seg.fromDate), seg.toDate, calendar) * 10) / 10;
        await seg.save({ transaction: t });
        ended++;
        await logAllocation({ projectId, memberId, segmentId: seg.id, userId: member.userId, action: 'release', before, after: snapshotOfSegment(seg), byId: uidOf(user), note: `Released from ${from}` }, t);
      }
    }
    if (affected.length) await mirrorMemberSummary(memberId, t, calendar);
  });
  return { ended, removed };
}

/** End one segment on `date` (drawer quick action). Delegates to updateSegment. */
async function quickEnd(segmentId, date, user) {
  const seg = await AllocationSegment.findByPk(segmentId, { attributes: ['id', 'memberId', 'projectId'] });
  if (!seg) throw new NotFoundError('Allocation period');
  return updateSegment(seg.projectId, seg.memberId, seg.id, { toDate: dateOnly(date) || todayIso() }, user);
}

// ── Grid (person × month) ─────────────────────────────────────────────────────

const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const monthLabel = (y, m) => new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const monthBounds = (y, m) => ({ from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) });

function parseMonthKey(s, what) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new ValidationError(`${what} must be YYYY-MM`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Accepts 'YYYY-MM' or 'YYYY-MM-DD'; returns { year, month }. */
function monthOf(v, what) {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const d = toDate(s); if (!d) throw new ValidationError(`${what} is not a valid date`); return { year: d.getFullYear(), month: d.getMonth() + 1 }; }
  return parseMonthKey(s, what);
}

function monthsBetween(a, b, max) {
  let [y, m] = [a.year, a.month];
  const out = [];
  while (y < b.year || (y === b.year && m <= b.month)) {
    out.push({ year: y, month: m, key: monthKey(y, m) });
    if (out.length > max) throw new ValidationError(`Range too large — maximum ${max} months`);
    m++; if (m > 12) { m = 1; y++; }
  }
  if (!out.length) throw new ValidationError('"to" is before "from"');
  return out;
}

/** Default range: project dates (clamped to MAX_GRID_MONTHS) else today → +5 months. */
function defaultGridRange(project) {
  const now = new Date();
  const ps = toDate(project.startDate), pe = toDate(project.endDate);
  if (ps && pe && pe >= ps) {
    const a = { year: ps.getFullYear(), month: ps.getMonth() + 1 };
    let b = { year: pe.getFullYear(), month: pe.getMonth() + 1 };
    const span = (b.year - a.year) * 12 + (b.month - a.month) + 1;
    if (span > MAX_GRID_MONTHS) { const e = new Date(a.year, a.month - 1 + MAX_GRID_MONTHS - 1, 1); b = { year: e.getFullYear(), month: e.getMonth() + 1 }; }
    return { a, b };
  }
  const e = new Date(now.getFullYear(), now.getMonth() + DEFAULT_GRID_MONTHS - 1, 1);
  return { a: { year: now.getFullYear(), month: now.getMonth() + 1 }, b: { year: e.getFullYear(), month: e.getMonth() + 1 } };
}

/**
 * Person × month grid of one project.
 * { from, to, capacity, months:[{ key, label, workingDays, capacityHours }],
 *   rows:[{ memberId, userId, name, email, role, cells:[{ month, hoursPerDay|null, segmentId|null, mixed, exceptionStatus, conflict, peakHours, segmentIds }] }] }
 * conflict / peakHours come from the person's WHOLE counted load (all projects) in that month.
 */
async function gridFor(projectId, { from, to } = {}) {
  const project = await Project.findByPk(projectId, { attributes: PROJECT_ATTRS });
  if (!project) throw new NotFoundError('Project');
  const calendar = await pmSettingsService.getCalendar();

  let a, b;
  if (from || to) {
    const d = defaultGridRange(project);
    a = from ? monthOf(from, 'from') : d.a;
    b = to   ? monthOf(to, 'to')     : d.b;
  } else ({ a, b } = defaultGridRange(project));
  const months = monthsBetween(a, b, MAX_GRID_MONTHS);

  const members = await ProjectMember.findAll({
    where: { projectId },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'designation'] }],
  });
  const memberIds = members.map(m => m.id);
  const segs = memberIds.length
    ? await AllocationSegment.findAll({ where: { memberId: { [Op.in]: memberIds } }, order: [['fromDate', 'ASC']] })
    : [];
  const segsByMember = new Map(memberIds.map(id => [String(id), []]));
  for (const s of segs) segsByMember.get(String(s.memberId))?.push(s);

  const userIds = [...new Set(members.map(m => String(m.userId)))];
  const counted = await loadSegmentsForUsers(userIds, { countedOnly: true, calendar });
  const countedByUser = new Map(userIds.map(id => [id, []]));
  for (const c of counted) countedByUser.get(String(c.userId))?.push(c);

  const monthMeta = months.map(({ year, month, key }) => {
    const cap = getMonthlyCapacity(year, month, calendar);
    return { key, label: monthLabel(year, month), year, monthNum: month, workingDays: cap.workingDays, capacityHours: cap.totalHours };
  });

  const rows = members
    .sort((x, y) => String(x.user?.name || '').localeCompare(String(y.user?.name || '')))
    .map(m => {
      const mine = segsByMember.get(String(m.id)) || [];
      const load = countedByUser.get(String(m.userId)) || [];
      const cells = months.map(({ year, month, key }) => {
        const { from: mf, to: mt } = monthBounds(year, month);
        const inMonth = mine.filter(s => overlaps(dateOnly(s.fromDate), dateOnly(s.toDate), mf, mt));
        const bd = monthBreakdown(load, year, month, calendar);
        const one = inMonth.length === 1 ? inMonth[0] : null;
        return {
          month: key,
          hoursPerDay: one ? num(one.hoursPerDay) : null,
          segmentId:   one ? one.id : null,
          segmentIds:  inMonth.map(s => s.id),
          mixed:       inMonth.length > 1,
          exact:       Boolean(one && dateOnly(one.fromDate) === mf && dateOnly(one.toDate) === mt),
          exceptionStatus: inMonth.some(s => s.exceptionStatus === 'pending') ? 'pending'
                         : inMonth.some(s => s.exceptionStatus === 'approved') ? 'approved' : 'none',
          hoursConfirmed:  inMonth.length > 0 && inMonth.every(s => s.hoursConfirmed === true),
          conflict:    bd.isOverAllocated,
          peakHours:   bd.peakHoursPerDay,
          band:        bd.band,
        };
      });
      return {
        memberId: m.id, userId: m.userId,
        name: m.user?.name || null, email: m.user?.email || null, designation: m.user?.designation || null,
        role: m.role || null,
        cells,
      };
    });

  return {
    projectId: project.id,
    from: months[0].key, to: months[months.length - 1].key,
    capacity: capOf(calendar),
    months: monthMeta,
    rows,
  };
}

/**
 * Apply one grid cell edit inside its own transaction.
 *   single segment exactly covering the month → update its hours (null → remove)
 *   otherwise → trim / split every overlapping segment out of the month (S1),
 *   then create a month segment with the new hours (null → nothing created)
 */
async function applyGridChange(project, member, monthStr, hoursPerDay, user, calendar) {
  const { year, month } = parseMonthKey(monthStr, 'month');
  const { from: mf, to: mt } = monthBounds(year, month);
  const clear = hoursPerDay === null || hoursPerDay === undefined || hoursPerDay === '' || Number(hoursPerDay) === 0;
  let resolved = null;
  if (!clear) {
    const r = resolveAllocation({ allocationMode: 'per_day', hoursPerDay, allocationFrom: mf, allocationTo: mt }, calendar);
    if (!r.ok) throw new ValidationError(r.error);
    resolved = r;
  }
  const base = { projectId: project.id, memberId: member.id, userId: member.userId, byId: uidOf(user) };

  return sequelize.transaction(async (t) => {
    const segs = await memberSegments(member.id, t, true);
    const inMonth = segs.filter(s => overlaps(dateOnly(s.fromDate), dateOnly(s.toDate), mf, mt));
    if (inMonth.some(s => s.exceptionStatus === 'pending')) {
      throw new ConflictError('A pending allocation exception covers this month — decide it first');
    }

    // Case 1: exactly one segment that IS the month
    if (inMonth.length === 1 && dateOnly(inMonth[0].fromDate) === mf && dateOnly(inMonth[0].toDate) === mt) {
      const seg = inMonth[0];
      const before = snapshotOfSegment(seg);
      if (clear) {
        await seg.destroy({ transaction: t });
        await logAllocation({ ...base, segmentId: seg.id, action: 'remove', before, note: `Grid ${monthStr}` }, t);
        await mirrorMemberSummary(member.id, t, calendar);
        return { segmentId: null, removed: true };
      }
      if (resolved.hoursPerDay === num(seg.hoursPerDay) && seg.allocationMode === 'per_day') return { segmentId: seg.id, unchanged: true };
      await assertNoConflict(member.userId, { hoursPerDay: resolved.hoursPerDay, allocationFrom: mf, allocationTo: mt, projectId: project.id }, calendar, seg.id, { transaction: t });
      seg.allocationMode = 'per_day'; seg.hoursPerDay = resolved.hoursPerDay; seg.allocationTotalHours = resolved.totalHours;
      seg.hoursConfirmed = true;
      if (seg.exceptionStatus === 'approved') { seg.exceptionStatus = 'none'; seg.exceptionApprovalId = null; }
      await seg.save({ transaction: t });
      await logAllocation({ ...base, segmentId: seg.id, action: 'update', before, after: snapshotOfSegment(seg), note: `Grid ${monthStr}` }, t);
      await mirrorMemberSummary(member.id, t, calendar);
      return { segmentId: seg.id };
    }

    // Case 2: carve the month out of every overlapping segment (keep before/after parts with original hours)
    for (const seg of inMonth) {
      const sf = dateOnly(seg.fromDate), st = dateOnly(seg.toDate);
      const before = snapshotOfSegment(seg);
      const hasBefore = sf < mf, hasAfter = st > mt;
      const hpd = num(seg.hoursPerDay);
      if (hasBefore) {
        seg.toDate = addDays(mf, -1);
        // Trimmed part keeps its hours/day; a 'total' period becomes per_day so the
        // hours/day everyone agreed is not silently re-derived from the old total.
        seg.allocationMode = 'per_day';
        seg.allocationTotalHours = Math.round(hpd * workingDaysBetween(sf, seg.toDate, calendar) * 10) / 10;
        await seg.save({ transaction: t });
        await logAllocation({ ...base, segmentId: seg.id, action: 'update', before, after: snapshotOfSegment(seg), note: `Grid ${monthStr}: trimmed` }, t);
        if (hasAfter) {
          const afterFrom = addDays(mt, 1);
          const part = await AllocationSegment.create({
            memberId: member.id, projectId: project.id, userId: member.userId,
            fromDate: afterFrom, toDate: st,
            allocationMode: 'per_day', hoursPerDay: hpd,   // see the trim above
            allocationTotalHours: Math.round(hpd * workingDaysBetween(afterFrom, st, calendar) * 10) / 10,
            // The approval keeps pointing at the original row; the split-off part inherits the
            // same exception link so a later reject/withdraw clears BOTH parts (see
            // project.service.revertExceptionSegment) and nothing is left silently approved.
            hoursConfirmed: seg.hoursConfirmed, exceptionStatus: seg.exceptionStatus, exceptionApprovalId: seg.exceptionApprovalId,
            note: seg.note, createdById: uidOf(user),
          }, { transaction: t });
          await logAllocation({ ...base, segmentId: part.id, action: 'add', after: snapshotOfSegment(part), note: `Grid ${monthStr}: split` }, t);
        }
      } else if (hasAfter) {
        seg.fromDate = addDays(mt, 1);
        seg.allocationMode = 'per_day';   // see the trim above
        seg.allocationTotalHours = Math.round(hpd * workingDaysBetween(seg.fromDate, st, calendar) * 10) / 10;
        await seg.save({ transaction: t });
        await logAllocation({ ...base, segmentId: seg.id, action: 'update', before, after: snapshotOfSegment(seg), note: `Grid ${monthStr}: trimmed` }, t);
      } else {
        await seg.destroy({ transaction: t });
        await logAllocation({ ...base, segmentId: seg.id, action: 'remove', before, note: `Grid ${monthStr}: replaced` }, t);
      }
    }

    let created = null;
    if (!clear) {
      // others = the person's counted load as it stands NOW inside this transaction (trimmed)
      await assertNoConflict(member.userId, { hoursPerDay: resolved.hoursPerDay, allocationFrom: mf, allocationTo: mt, projectId: project.id }, calendar, null, { transaction: t });
      created = await AllocationSegment.create({
        memberId: member.id, projectId: project.id, userId: member.userId,
        fromDate: mf, toDate: mt,
        allocationMode: 'per_day', hoursPerDay: resolved.hoursPerDay, allocationTotalHours: resolved.totalHours,
        hoursConfirmed: true, exceptionStatus: 'none', exceptionApprovalId: null, note: null, createdById: uidOf(user),
      }, { transaction: t });
      await logAllocation({ ...base, segmentId: created.id, action: 'add', after: snapshotOfSegment(created), note: `Grid ${monthStr}` }, t);
    }
    await mirrorMemberSummary(member.id, t, calendar);
    return { segmentId: created ? created.id : null, removed: clear };
  });
}

/**
 * applyGrid(projectId, { changes:[{ memberId, month:'YYYY-MM', hoursPerDay|null }] }, user)
 * → { applied:[{ memberId, month, hoursPerDay, segmentId }], errors:[{ memberId, month, message, conflict? }] }
 * Partial success: each change runs in its own transaction.
 */
async function applyGrid(projectId, { changes } = {}, user) {
  const project = await loadProjectForWrite(projectId, user, 'edit the allocation grid');
  if (!Array.isArray(changes) || !changes.length) throw new ValidationError('changes must be a non-empty array');
  const calendar = await pmSettingsService.getCalendar();
  const applied = [], errors = [];
  const memberCache = new Map();

  for (const c of changes) {
    const memberId = c?.memberId, month = c?.month;
    try {
      if (!memberId || !month) throw new ValidationError('memberId and month are required');
      let member = memberCache.get(String(memberId));
      if (!member) { member = await loadMember(projectId, memberId); memberCache.set(String(memberId), member); }
      const hpd = c.hoursPerDay === null || c.hoursPerDay === undefined || c.hoursPerDay === '' ? null : Number(c.hoursPerDay);
      const r = await applyGridChange(project, member, month, hpd, user, calendar);
      applied.push({ memberId, month, hoursPerDay: hpd === 0 ? null : hpd, segmentId: r.segmentId, ...(r.unchanged ? { unchanged: true } : {}) });
    } catch (e) {
      if (!e || !e.isOperational) throw e;   // programming errors surface as 500
      errors.push({ memberId, month, message: e.message, status: e.statusCode, ...(e.conflict ? { conflict: e.conflict } : {}) });
    }
  }
  return { applied, errors };
}

module.exports = {
  // loaders — loadAllocationsForUsers is the one every capacity surface should use
  loadSegmentsForUsers, loadTicketAllocationsForUsers, loadAllocationsForUsers, otherAllocationsFor,
  // rules
  assertNoOverlap, assertNoConflict, resolveSegmentAmount, canManageProject,
  // readers
  listSegments, listHistory, gridFor,
  // writers
  addSegment, updateSegment, removeSegment, confirmSegment, confirmAllSegments, releaseMember, quickEnd, applyGrid,
  // primitives shared with project.service (exception flows)
  mirrorMemberSummary, logAllocation, serializeSegment, snapshotOfSegment, toEngineAllocation,
  INACTIVE_PROJECT_STATUSES, COUNTED_EXCEPTION_STATUSES, SEGMENT_SNAPSHOT_FIELDS: SNAPSHOT_FIELDS,
};
