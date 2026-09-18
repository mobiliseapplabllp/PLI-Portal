'use strict';

/**
 * @module controllers/helpdesk/ticket
 * Full CRUD for helpdesk tickets including history, linking, and bulk operations.
 */

const path             = require('path');
const fs               = require('fs');
const crypto           = require('crypto');
const { Op }           = require('sequelize');
const sequelize        = require('../../config/database');
const UPLOAD_DIR       = process.env.UPLOAD_DIR || 'uploads';
const {
  HdTicket,
  HdTicketHistory,
  HdTicketAssignee,
  HdTicketApproval,
  HdTask,
  HdAttachment,
  HdConversation,
  HdGroup,
  HdProject,
  User,
  Project: PmProject,
}                      = require('../../models/helpdesk');
const Department       = require('../../models/Department');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError, ValidationError, AllocationConflictError } = require('../../utils/errors');
const { sendEmail }    = require('../../utils/emailService');

// Team rule (manager + active direct reports) lives in ONE place. Lazy-required
// so this controller still loads (and route wiring can be verified) while the
// service is being introduced alongside migration 043.
let _teamService;
const team = () => (_teamService ||= require('../../services/helpdesk/team.service'));

// Ticket allocation exceptions live in the PM service layer (ONE exception flow).
// Lazy-required for the same reason as the team service.
let _ticketExceptionService;
const ticketExceptionService = () =>
  (_ticketExceptionService ||= require('../../services/pm/ticketException.service'));

const { TICKET_STATUS, TICKET_PRIORITY, LINK_TYPE } = HdTicket;

/** 4xx helper — body carries both `message` and `error.message`. */
const sendClientError = (res, message, status = 400) =>
  res.status(status).json({ success: false, message, error: { message } });

/**
 * 409 for an over-capacity ticket allocation — the SAME payload the PM side
 * returns (conflict + suggestions + canRequestException + exceptionMaxHoursPerDay),
 * in both body shapes.
 */
const sendAllocationConflict = (res, e) =>
  res.status(409).json({
    success: false,
    message: e.message,
    conflict: { ...(e.conflict || {}) },
    error: { message: e.message },
  });

// Lazy-load ExcelJS only when needed (avoids startup cost)
let ExcelJS;
function getExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

const DEFAULT_PAGE      = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE     = 100;

// groupId is intentionally NOT tracked/writable any more — teams come from the
// employee master (users.managerId); legacy group_id is read-only.
const TRACKED_FIELDS = [
  'title', 'description', 'status', 'priority', 'category',
  'requestType', 'mode', 'impact', 'urgency', 'resolution', 'site', // raisedByTeam is derived, never written by clients
  'assigneeId', 'teamManagerId', 'projectId', 'pmProjectId', 'dueDate', 'billable',
  // Phase 3 — assignee effort allocation (stacks against PM allocations)
  'allocationHoursPerDay', 'allocationFrom', 'allocationTo', 'allocationMode', 'allocationTotalHours',
];

/** History fields whose old/new values are user UUIDs (resolved to names). */
const USER_REF_FIELDS = new Set(['assigneeId', 'teamManagerId']);

const ALLOCATION_FIELDS = ['allocationHoursPerDay', 'allocationFrom', 'allocationTo', 'allocationMode', 'allocationTotalHours'];
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isBlank = (v) => v === undefined || v === null || v === '';
/** LOCAL 'YYYY-MM-DD' for a Date or date-ish string — never toISOString(). */
const toDayStr = (v) => (v ? (v instanceof Date ? require('../../utils/capacityEngine').iso(v) : String(v).slice(0, 10)) : null);

// The allocation hour columns are DECIMAL, so sequelize hands them back as
// strings ("40.0"). A raw String() comparison therefore reports 40 ≠ "40.0" and
// would write a history row for a value that did not actually change; dates are
// compared on the day, never on the Date object's stringification.
const DECIMAL_FIELDS = new Set(['allocationHoursPerDay', 'allocationTotalHours']);
const DATE_FIELDS    = new Set(['allocationFrom', 'allocationTo', 'dueDate']);
/** True when `a` and `b` mean the same thing for field `f` (no history row). */
function sameFieldValue(f, a, b) {
  if (isBlank(a) && isBlank(b)) return true;
  if (isBlank(a) || isBlank(b)) return false;
  if (DECIMAL_FIELDS.has(f)) return Number(a) === Number(b);
  if (DATE_FIELDS.has(f))    return toDayStr(a) === toDayStr(b);
  return String(a) === String(b);
}

/**
 * Split a `projectId` body value into the two storage columns (B12).
 * PM UUID → pm_project_id; legacy integer → project_id; blank → both cleared.
 * Setting one side always clears the other so a ticket references ONE project.
 * @returns {{ error: string } | { projectId: number|null, pmProjectId: string|null }}
 */
function splitProjectRef(value) {
  if (isBlank(value)) return { projectId: null, pmProjectId: null };
  const s = String(value).trim();
  if (UUID_RE.test(s)) return { projectId: null, pmProjectId: s };
  if (/^\d+$/.test(s)) return { projectId: Number(s), pmProjectId: null };
  return { error: 'projectId must be a PM project UUID or a legacy helpdesk project id' };
}

/**
 * Resolve the team for a ticket from the (assigneeId, teamManagerId) pair (B5/B6/B7).
 *
 * The rule itself lives in services/helpdesk/team.service so EVERY assignment
 * path can reuse it without requiring this controller (which would create a
 * require cycle) — the ticket allocation exception service calls it directly.
 * Kept exported here for the existing callers/tests.
 *
 * @returns {Promise<{ error: string } | { assigneeId: string|null, teamManagerId: string|null }>}
 */
const resolveTeam = (input) => team().resolveTeamFor(input);

/**
 * Requester team = requester's department name, derived server-side (never typed).
 * @param {string|null} requesterEmail  on-behalf email (falls back to the caller)
 * @param {object} hdUser
 */
async function deriveRaisedByTeam(requesterEmail, hdUser) {
  const email = (requesterEmail || hdUser.email || '').trim().toLowerCase();
  if (!email) return null;
  const u = await User.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email),
    attributes: ['departmentId'],
    raw: true,
  });
  if (!u?.departmentId) return null;
  const dept = await Department.findByPk(u.departmentId, { attributes: ['name'], raw: true });
  return dept?.name || null;
}

// ─── Visibility (B4) — ONE rule shared by list, export and task.controller ──

/**
 * Sequelize `where` fragment restricting tickets to what `hdUser` may see.
 *   scope 'all'   → null (no filter)
 *   scope 'group' → team_manager_id = me OR requester/assignee ∈ (me + my direct
 *                   reports) OR (legacy) group_id = my hd_group_id
 *   scope 'own'   → requester or assignee = me
 * A manager with no reports and no team tickets therefore sees only their own.
 * @returns {Promise<object|null>}
 */
async function ticketVisibilityWhere(hdUser) {
  if (hdUser.isAdmin || hdUser.scope === 'all') return null;

  if (hdUser.scope === 'group') {
    const ids = await team().teamMemberIds(hdUser.id);           // [me, ...reports]
    const or = [
      { teamManagerId: hdUser.id },
      { requesterId:   { [Op.in]: ids } },
      { assigneeId:    { [Op.in]: ids } },
    ];
    if (hdUser.groupId) or.push({ groupId: hdUser.groupId });   // legacy rows
    return { [Op.or]: or };
  }

  return { [Op.or]: [{ requesterId: hdUser.id }, { assigneeId: hdUser.id }] };
}

/**
 * Build the ticket `where` for listTickets / exportTickets from query filters
 * plus the caller's visibility. Filters only ever narrow the visible set.
 */
async function buildTicketWhere(query, hdUser) {
  const { status, priority, category, groupId, teamManagerId, projectId, assigneeId, search, dateFrom, dateTo } = query;
  const and = [];

  const vis = await ticketVisibilityWhere(hdUser);
  if (vis) and.push(vis);

  if (status)        and.push({ status });
  if (priority)      and.push({ priority });
  if (category)      and.push({ category: { [Op.like]: `%${category}%` } });
  if (teamManagerId) and.push({ teamManagerId: String(teamManagerId) });
  // Legacy filter. A non-numeric value (e.g. ?groupId=all) would become NaN and 500
  // the query, so anything that is not a positive integer matches nothing instead.
  if (groupId) {
    const gid = Number.parseInt(groupId, 10);
    and.push(Number.isInteger(gid) && gid > 0 ? { groupId: gid } : { id: null });
  }
  if (assigneeId)    and.push({ assigneeId: assigneeId === 'unassigned' ? null : assigneeId });

  // ?projectId= matches either column: a PM UUID hits pm_project_id directly
  // or via a legacy hd_project linked to that PM project; an INT hits project_id.
  if (projectId) {
    const ref = splitProjectRef(projectId);
    if (ref.error) and.push({ id: null });                            // unknown shape → no rows
    else if (ref.pmProjectId) {
      and.push({ [Op.or]: [
        { pmProjectId: ref.pmProjectId },
        { projectId: { [Op.in]: sequelize.literal(
          `(SELECT id FROM hd_projects WHERE pm_project_id = ${sequelize.escape(ref.pmProjectId)})`) } },
      ] });
    } else {
      and.push({ projectId: ref.projectId });
    }
  }

  if (search) {
    and.push({ [Op.or]: [
      { title:     { [Op.like]: `%${search}%` } },
      { reqNumber: { [Op.like]: `%${search}%` } },
    ] });
  }

  if (dateFrom || dateTo) {
    const createdAt = {};
    if (dateFrom) createdAt[Op.gte] = new Date(dateFrom);
    if (dateTo)   createdAt[Op.lte] = new Date(dateTo);
    and.push({ createdAt });
  }

  return and.length ? { [Op.and]: and } : {};
}

/** Includes shared by list + export: team (new) + group (legacy), project (both kinds), people. */
function listIncludes(userAttrs = ['id', 'name']) {
  return [
    { model: User,      as: 'teamManager',   attributes: ['id', 'name'], required: false, constraints: false },
    { model: HdGroup,   as: 'group',         attributes: ['id', 'name'], required: false },
    { model: PmProject, as: 'pmProject',     attributes: ['id', 'name'], required: false, constraints: false },
    { model: HdProject, as: 'project',       attributes: ['id', 'name'], required: false },
    { model: User,      as: 'assigneeUser',  attributes: userAttrs,      required: false, constraints: false },
    { model: User,      as: 'requesterUser', attributes: userAttrs,      required: false, constraints: false },
  ];
}

/**
 * Annotate plain history rows with changedByName / oldDisplay / newDisplay.
 * User-reference fields (assigneeId, teamManagerId) resolve to user names;
 * legacy groupId resolves to group names.
 */
async function enrichHistory(history) {
  if (!history || history.length === 0) return history;

  const userIds  = new Set();
  const groupIds = new Set();
  for (const h of history) {
    if (h.changedBy && h.changedBy.includes('-')) userIds.add(h.changedBy);
    if (USER_REF_FIELDS.has(h.field)) {
      if (h.oldValue && h.oldValue.includes('-')) userIds.add(h.oldValue);
      if (h.newValue && h.newValue.includes('-')) userIds.add(h.newValue);
    }
    if (h.field === 'groupId') {
      if (h.oldValue && /^\d+$/.test(h.oldValue)) groupIds.add(h.oldValue);
      if (h.newValue && /^\d+$/.test(h.newValue)) groupIds.add(h.newValue);
    }
  }

  const [histUsers, histGroups] = await Promise.all([
    userIds.size  ? User.findAll({ where: { id: [...userIds] }, attributes: ['id', 'name'], raw: true }) : [],
    groupIds.size ? HdGroup.findAll({ where: { id: [...groupIds] }, attributes: ['id', 'name'], raw: true }) : [],
  ]);
  const userMap  = Object.fromEntries(histUsers.map(u => [u.id, u.name]));
  const groupMap = Object.fromEntries(histGroups.map(g => [String(g.id), g.name]));

  for (const h of history) {
    h.changedByName = (h.changedBy && userMap[h.changedBy]) || null;
    if (USER_REF_FIELDS.has(h.field)) {
      h.oldDisplay = (h.oldValue && h.oldValue.includes('-')) ? (userMap[h.oldValue] || null) : null;
      h.newDisplay = (h.newValue && h.newValue.includes('-')) ? (userMap[h.newValue] || null) : null;
    } else if (h.field === 'groupId') {
      h.oldDisplay = h.oldValue ? (groupMap[h.oldValue] || null) : null;
      h.newDisplay = h.newValue ? (groupMap[h.newValue] || null) : null;
    }
  }
  return history;
}

/** True when the body touches any allocation field. */
const hasAllocationInput = (obj) => ALLOCATION_FIELDS.some((f) => hasOwn(obj, f));

/**
 * Resolve the optional helpdesk effort allocation from a body (merged over
 * `base`, the stored ticket, when given) against the working calendar.
 *
 * Mode: explicit `allocationMode`; else 'per_day' when only hours/day was sent
 * (legacy bodies); else the stored mode when the ticket already has an
 * allocation and no amount was sent; else 'total' (helpdesk default).
 *
 * CAPACITY IS ENFORCED, exactly as on the PM side: when the ticket has an
 * assignee and the resolved hours/day would put that person over capacity on any
 * working day, this THROWS AllocationConflictError (409 with suggestions +
 * canRequestException + exceptionMaxHoursPerDay) — the caller may then raise an
 * allocation exception. A derived hours/day above the exception cap can never be
 * approved, so it is refused up front with a 400.
 *
 * @param {object}  obj   body fields
 * @param {object?} base  the stored ticket, when updating
 * @param {object}  opts  { assigneeId, ticketId, dueDate, checkCapacity }
 *        assigneeId — who carries the hours (no assignee ⇒ nobody to overload)
 *        ticketId   — the ticket being edited, excluded from its own capacity check
 *        dueDate    — end-date fallback, mirroring loadTicketAllocationsForUsers
 * @returns {Promise<{ error: string } | { values: object }>}
 *   values = { allocationHoursPerDay, allocationFrom, allocationTo, allocationMode, allocationTotalHours }
 * @throws {AllocationConflictError} 409 — the assignee would be over capacity
 */
async function resolveTicketAllocation(obj, base = null, opts = {}) {
  const val = (f) => (hasOwn(obj, f) ? (isBlank(obj[f]) ? null : obj[f]) : (base ? base[f] ?? null : null));

  const allocationFrom = val('allocationFrom');
  const allocationTo   = val('allocationTo');
  for (const [key, v] of [['allocationFrom', allocationFrom], ['allocationTo', allocationTo]]) {
    if (v !== null && (typeof v !== 'string' || !DATE_ONLY_RE.test(v) || isNaN(new Date(v).getTime()))) {
      return { error: `${key} must be a date in YYYY-MM-DD format` };
    }
  }
  if (allocationFrom && allocationTo && allocationFrom > allocationTo) {
    return { error: 'allocationFrom must be on or before allocationTo' };
  }

  const bodyHours = hasOwn(obj, 'allocationHoursPerDay') && !isBlank(obj.allocationHoursPerDay);
  const bodyTotal = hasOwn(obj, 'allocationTotalHours') && !isBlank(obj.allocationTotalHours);
  const hoursPerDay = val('allocationHoursPerDay');
  const totalHours  = val('allocationTotalHours');

  // Nothing to allocate (or explicitly cleared) → keep dates only (nothing to check)
  if (hoursPerDay === null && totalHours === null) {
    return { values: { allocationHoursPerDay: null, allocationFrom, allocationTo, allocationMode: 'total', allocationTotalHours: null } };
  }

  let mode = hasOwn(obj, 'allocationMode') && !isBlank(obj.allocationMode) ? obj.allocationMode : null;
  if (!mode) {
    if (bodyHours && !bodyTotal)                               mode = 'per_day';
    else if (bodyTotal && !bodyHours)                          mode = 'total';
    else if (base && base.allocationHoursPerDay != null)       mode = base.allocationMode || 'total';
    else                                                       mode = 'total';
  }
  if (mode !== 'per_day' && mode !== 'total') return { error: "allocationMode must be 'per_day' or 'total'" };

  const calendar = await require('../../services/pm/pmSettings.service').getCalendar();
  const r = require('../../utils/capacityEngine').resolveAllocation(
    { allocationMode: mode, hoursPerDay, allocationTotalHours: totalHours, allocationFrom, allocationTo },
    calendar,
  );
  if (!r.ok) return { error: r.error };

  // A 'total' over few working days can derive an hours/day beyond anything an
  // approver could ever grant — refuse it here rather than at the exception step.
  const { maxHoursPerDay: exceptionCap } = await require('../../services/pm/pmSettings.service').getExceptionPolicy();
  if (r.hoursPerDay > exceptionCap) {
    return { error: `Exceeds the exception cap of ${exceptionCap} hrs/day: this would put ${r.hoursPerDay} hrs/day on the person` };
  }

  const values = {
    allocationHoursPerDay: r.hoursPerDay,
    allocationFrom, allocationTo,
    allocationMode:        r.mode,
    allocationTotalHours:  r.totalHours,
  };
  if (opts.checkCapacity !== false) {
    await assertTicketCapacity(values, opts, calendar);
  }
  return { values };
}

/**
 * Throw AllocationConflictError (409) when `values` would put the assignee over
 * capacity. An UNASSIGNED ticket has nobody to overload, so it is never checked.
 * The ticket's own current hours are excluded via excludeTicketId so an edit does
 * not fight itself.
 */
async function assertTicketCapacity(values, { assigneeId = null, ticketId = null, dueDate = null, transaction = null } = {}, calendarIn = null) {
  if (!assigneeId || values.allocationHoursPerDay == null) return;
  const pmSettings = require('../../services/pm/pmSettings.service');
  const alloc      = require('../../services/pm/allocation.service');
  const calendar   = calendarIn || await pmSettings.getCalendar();
  await alloc.assertNoConflict(
    String(assigneeId),
    {
      hoursPerDay:    values.allocationHoursPerDay,
      allocationFrom: values.allocationFrom,
      // No explicit end → the due date, exactly as loadTicketAllocationsForUsers reads it
      allocationTo:   values.allocationTo || toDayStr(dueDate),
      projectId:      null,
    },
    calendar,
    null,
    { excludeTicketId: ticketId, transaction },
  );
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Log a single field change to HdTicketHistory.
 * @param {number} ticketId
 * @param {string} field
 * @param {*} oldValue
 * @param {*} newValue
 * @param {string|null} changedBy - PLI user UUID
 * @param {import('sequelize').Transaction|null} [t]
 */
async function logHistory(ticketId, field, oldValue, newValue, changedBy, t) {
  await HdTicketHistory.create(
    {
      ticketId,
      field,
      oldValue: oldValue != null ? String(oldValue) : null,
      newValue: newValue != null ? String(newValue) : null,
      changedBy: changedBy || null,
    },
    { transaction: t },
  );
}

/**
 * Generate the next REQ-XXXX number inside a transaction with a SELECT FOR UPDATE.
 * @param {import('sequelize').Transaction} t
 * @returns {Promise<string>}
 */
async function generateReqNumber(t) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await HdTicket.findOne({
      attributes: ['reqNumber'],
      order: [
        [
          sequelize.literal('CAST(SUBSTRING(req_number, 5) AS UNSIGNED)'),
          'DESC',
        ],
      ],
      lock: t ? t.LOCK.UPDATE : undefined,
      transaction: t || undefined,
    });

    let next = 1;
    if (last?.reqNumber) {
      const num = parseInt(last.reqNumber.replace(/^REQ-/, ''), 10);
      if (!isNaN(num)) next = num + 1;
    }

    const candidate = `REQ-${String(next).padStart(4, '0')}`;
    // Check if this number is already taken (race condition guard)
    const exists = await HdTicket.findOne({
      where: { reqNumber: candidate },
      transaction: t || undefined,
    });
    if (!exists) return candidate;
    // Another concurrent request grabbed this number — retry with next
  }
  // Absolute fallback: cryptographically random suffix — avoids timestamp
  // collisions when two callers exhaust retries at the same millisecond.
  return `REQ-F${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

/** Standard paginated query scope builder. */
function paginationParams(query) {
  let page     = Math.max(1, parseInt(query.page, 10) || DEFAULT_PAGE);
  let pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize };
}

// â”€â”€â”€ Controllers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GET /helpdesk/tickets
 * Paginated list with filters; respects req.hdUser.scope.
 * @type {import('express').RequestHandler}
 */
const listTickets = async (req, res, next) => {
  try {
    const { page, pageSize, offset, limit } = paginationParams(req.query);
    const where = await buildTicketWhere(req.query, req.hdUser);

    const { rows, count: total } = await HdTicket.findAndCountAll({
      where,
      include: listIncludes(),
      order:  [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
    });

    // Allocation exception state ('pending' | 'approved' | 'none') for the whole
    // page in ONE query — never one lookup per row.
    const tickets = rows.map((r) => r.get({ plain: true }));
    const statuses = await ticketExceptionService()
      .ticketExceptionStatuses(tickets.map((tk) => tk.id));
    for (const tk of tickets) tk.exceptionStatus = statuses.get(String(tk.id)) || 'none';

    return sendSuccess(res, { tickets, total, page, pageSize }, 'Tickets fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/:id
 * Single ticket with all associations.
 * @type {import('express').RequestHandler}
 */
const getTicket = async (req, res, next) => {
  try {
    const hdUser = req.hdUser;
    const ticket = await HdTicket.findByPk(req.params.id, {
      include: [
        {
          model:    HdConversation,
          as:       'conversations',
          required: false,
          where:    (!hdUser.isAdmin)
            ? { [Op.or]: [{ isInternal: false }, { userId: hdUser.id }] }
            : undefined,
          include: [{ model: HdAttachment, as: 'files', required: false }],
        },
        { model: HdTicketHistory,  as: 'history',   required: false, order: [['changed_at', 'DESC']] },
        { model: HdTicketAssignee, as: 'assignees',  required: false },
        { model: HdTicketApproval, as: 'approvals',  required: false },
        { model: HdTask,           as: 'tasks',      required: false },
        { model: HdAttachment,     as: 'attachments', required: false },
        ...listIncludes(['id', 'name', 'email']),
        { model: HdTicket,  as: 'linkedTicket',  attributes: ['id', 'reqNumber', 'title', 'status', 'priority'], required: false },
      ],
    });

    if (!ticket) return next(new NotFoundError('Ticket'));

    // ── Enrich history: resolve changedBy UUID and field values to names ─────
    const ticketPlain = ticket.get({ plain: true });

    if (ticketPlain.history && ticketPlain.history.length > 0) {
      // Sort newest-first (include-level order is ignored by Sequelize for hasMany)
      ticketPlain.history.sort((a, b) =>
        new Date(b.changedAt || b.changed_at) - new Date(a.changedAt || a.changed_at)
      );
      await enrichHistory(ticketPlain.history);
    }

    // Derived allocation exception state — 'pending' | 'approved' | 'none'
    // (there is no column on hd_tickets; it comes from pm_allocation_approvals).
    const exc = await ticketExceptionService().ticketExceptionStatus(ticket.id);
    ticketPlain.exceptionStatus     = exc.status;
    ticketPlain.exceptionApprovalId = exc.approvalId;

    return sendSuccess(res, ticketPlain, 'Ticket fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets
 * Create a new ticket; auto-generates reqNumber.
 * @type {import('express').RequestHandler}
 */
const createTicket = async (req, res, next) => {
  try {
    const {
      title, category, description, priority, status,
      projectId, dueDate, assigneeId, teamManagerId,
      requestType, mode, impact, urgency, site,
      // "On behalf of" fields — admins/managers creating tickets for others
      requesterName, requesterEmail,
      // Phase 3 — optional effort allocation for the assignee
      allocationHoursPerDay, allocationFrom, allocationTo, allocationMode, allocationTotalHours,
    } = req.body;
    // NOTE: body.groupId and body.raisedByTeam are deliberately ignored —
    // team comes from the employee master, requester team is derived.

    if (!title) return sendClientError(res, 'title is required');

    // ── Team / assignee (B5) ─────────────────────────────────────────────────
    const teamRes = await resolveTeam({ assigneeId, teamManagerId });
    if (teamRes.error) return sendClientError(res, teamRes.error);

    // ── Project reference (B12): PM UUID → pm_project_id, INT → project_id ──
    const projRef = splitProjectRef(projectId);
    if (projRef.error) return sendClientError(res, projRef.error);

    let alloc = { allocationHoursPerDay: null, allocationFrom: null, allocationTo: null, allocationMode: 'total', allocationTotalHours: null };
    if (hasAllocationInput(req.body)) {
      let resolved;
      try {
        resolved = await resolveTicketAllocation(
          { allocationHoursPerDay, allocationFrom, allocationTo, allocationMode, allocationTotalHours },
          null,
          { assigneeId: teamRes.assigneeId, dueDate },
        );
      } catch (e) {
        // Over capacity → 409 with the same conflict payload the PM side returns
        if (e instanceof AllocationConflictError) return sendAllocationConflict(res, e);
        throw e;
      }
      if (resolved.error) return sendClientError(res, resolved.error);
      alloc = resolved.values;
    }

    const raisedByTeam = await deriveRaisedByTeam(requesterEmail, req.hdUser);

    let destPath;
    const t = await sequelize.transaction();
    try {
      const reqNumber = await generateReqNumber(t);

      const ticket = await HdTicket.create(
        {
          title,
          category:     category     || null,
          description:  description  || null,
          priority:     priority     || TICKET_PRIORITY.MEDIUM,
          status:       status       || TICKET_STATUS.OPEN,
          projectId:    projRef.projectId,
          pmProjectId:  projRef.pmProjectId,
          dueDate:      dueDate      || null,
          assigneeId:   teamRes.assigneeId,
          teamManagerId: teamRes.teamManagerId,
          allocationHoursPerDay: alloc.allocationHoursPerDay,
          allocationFrom:        alloc.allocationFrom,
          allocationTo:          alloc.allocationTo,
          allocationMode:        alloc.allocationMode,
          allocationTotalHours:  alloc.allocationTotalHours,
          requestType:  requestType  || null,
          mode:         mode         || null,
          impact:       impact       || null,
          urgency:      urgency      || null,
          site:         site         || null,
          raisedByTeam,
          // If creating on behalf of someone, store their name/email in the widget fields
          widgetName:   requesterName  || null,
          widgetEmail:  requesterEmail || null,
          requesterId:  req.hdUser.id,
          reqNumber,
        },
        { transaction: t },
      );

      await logHistory(ticket.id, 'status', null, ticket.status, req.hdUser.id, t);

      // Save optional attachment uploaded with ticket creation
      if (req.file) {
        const ext        = path.extname(req.file.originalname);
        const ALLOWED_EXTS = ['.pdf','.png','.jpg','.jpeg','.docx','.xlsx','.csv','.txt','.doc','.xls'];
        if (!ALLOWED_EXTS.includes(ext.toLowerCase())) {
          // FIX: rollback the open transaction before returning — otherwise the
          // connection is leaked and held open until the idle-timeout fires.
          await t.rollback();
          return sendClientError(res, `File type ${ext} is not allowed. Allowed: ${ALLOWED_EXTS.join(', ')}`);
        }
        const storedName = `${crypto.randomUUID()}${ext}`;
        destPath   = path.join(UPLOAD_DIR, storedName);
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(destPath, req.file.buffer);
        await HdAttachment.create(
          {
            ticketId:   ticket.id,
            uploadedBy: req.hdUser.id,
            filename:   req.file.originalname,
            storedName,
            mimeType:   req.file.mimetype,
            sizeBytes:  req.file.size,
          },
          { transaction: t },
        );
      }

      await t.commit();

      // Non-blocking email notification — send to requester if provided, else creator
      const notifyEmail = requesterEmail || req.hdUser.email;
      if (notifyEmail) {
        sendEmail(
          notifyEmail,
          `Ticket Created: ${reqNumber}`,
          `<p>Your ticket <strong>${reqNumber}</strong> — <em>${title}</em> has been created.</p>`,
        ).catch(() => {});
      }

      return sendSuccess(res, ticket, 'Ticket created', 201);
    } catch (err) {
      await t.rollback();
      if (req.file && destPath && fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch(_) {}
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/tickets/:id
 * Update allowed ticket fields; auto-logs every changed field.
 * @type {import('express').RequestHandler}
 */
const updateTicket = async (req, res, next) => {
  try {
    const ticket = await HdTicket.findByPk(req.params.id);
    if (!ticket) return next(new NotFoundError('Ticket'));

    // ── Authorization ─────────────────────────────────────────────────────────
    // Admins and canAssign agents can update any ticket.
    // Everyone else (e.g. a requester) may only update their own ticket.
    if (!req.hdUser?.isAdmin && !req.hdUser?.permissions?.canAssign) {
      if (String(ticket.requesterId) !== String(req.hdUser?.id)) {
        return sendClientError(res, 'You do not have permission to update this ticket', 403);
      }
    }

    const snapshot = {};
    TRACKED_FIELDS.forEach((f) => { snapshot[f] = ticket[f]; });

    const prevStatus = ticket.status;
    const updates    = {};
    TRACKED_FIELDS.forEach((f) => {
      if (hasOwn(req.body, f)) updates[f] = req.body[f];
    });
    // body.groupId is ignored (not in TRACKED_FIELDS) — legacy column is read-only.

    // ── Project reference (B12): body.projectId may be a PM UUID or legacy INT
    if (hasOwn(updates, 'projectId')) {
      const ref = splitProjectRef(updates.projectId);
      if (ref.error) return sendClientError(res, ref.error);
      updates.projectId   = ref.projectId;
      updates.pmProjectId = ref.pmProjectId;
    } else if (hasOwn(updates, 'pmProjectId')) {
      const ref = splitProjectRef(updates.pmProjectId);
      if (ref.error || ref.projectId !== null) return sendClientError(res, 'pmProjectId must be a PM project UUID');
      updates.pmProjectId = ref.pmProjectId;
      updates.projectId   = null;
    }

    // ── Team / assignee (B6) ─────────────────────────────────────────────────
    // Validation runs whenever either side changes. Clearing the assignee keeps
    // the team; changing the team without an assignee is allowed.
    if (hasOwn(updates, 'assigneeId') || hasOwn(updates, 'teamManagerId')) {
      const nextAssignee = hasOwn(updates, 'assigneeId')
        ? (isBlank(updates.assigneeId) ? null : String(updates.assigneeId))
        : (ticket.assigneeId || null);
      const bodyTeam = hasOwn(updates, 'teamManagerId')
        ? (isBlank(updates.teamManagerId) ? null : String(updates.teamManagerId))
        : undefined;

      if (nextAssignee === null && bodyTeam === undefined) {
        updates.assigneeId = null;                                   // keep team as-is
      } else {
        let teamInput = bodyTeam;
        if (teamInput === undefined) {
          // Only the assignee changed (e.g. pick-up): keep the current team if
          // the new assignee belongs to it, otherwise derive from the assignee.
          teamInput = (ticket.teamManagerId && await team().isInTeam(nextAssignee, ticket.teamManagerId))
            ? ticket.teamManagerId : null;
        }
        const r = await resolveTeam({ assigneeId: nextAssignee, teamManagerId: teamInput });
        if (r.error) return sendClientError(res, r.error);
        updates.assigneeId    = r.assigneeId;
        updates.teamManagerId = r.teamManagerId;
      }
    }

    // ── Phase 3: effort allocation validation / normalisation + capacity ─────
    const nextAssigneeId = hasOwn(updates, 'assigneeId') ? updates.assigneeId : (ticket.assigneeId || null);
    const nextDueDate    = hasOwn(updates, 'dueDate')    ? updates.dueDate    : ticket.dueDate;
    // The due date IS the allocation end date when there is no explicit allocationTo
    // (loadTicketAllocationsForUsers / assertTicketCapacity both fall back to it),
    // so moving it stretches or shrinks the counted window.
    const nextAllocationTo = hasOwn(updates, 'allocationTo') ? updates.allocationTo : ticket.allocationTo;
    const dueDateMovesAllocation =
      hasOwn(updates, 'dueDate')
      && ticket.allocationHoursPerDay != null
      && isBlank(nextAllocationTo)
      && toDayStr(updates.dueDate) !== toDayStr(ticket.dueDate);
    const touchesAllocation = hasAllocationInput(updates)
      || dueDateMovesAllocation
      || (hasOwn(updates, 'assigneeId') && String(updates.assigneeId ?? '') !== String(ticket.assigneeId ?? ''));

    // A ticket whose exception is still undecided must be settled first — its hours
    // are not counted anywhere while pending, so editing them would bypass capacity.
    if (touchesAllocation) {
      const pending = await ticketExceptionService().pendingExceptionFor(ticket.id);
      if (pending) {
        // Dual error shape PLUS a machine-readable `reason` so the UI can show the
        // pending-exception panel instead of falling through to a generic toast.
        const message = 'This ticket has a pending allocation exception — approve, reject or withdraw it before changing its assignee or allocation';
        return res.status(409).json({
          success: false,
          message,
          reason: 'pending_exception',
          exceptionApprovalId: pending.id,
          error: { message },
        });
      }
    }

    try {
      if (hasAllocationInput(updates)) {
        const resolved = await resolveTicketAllocation(updates, ticket, {
          assigneeId: nextAssigneeId, ticketId: ticket.id, dueDate: nextDueDate,
        });
        if (resolved.error) return sendClientError(res, resolved.error);
        Object.assign(updates, resolved.values);
      } else if (touchesAllocation && ticket.allocationHoursPerDay != null) {
        // Only the assignee changed: the stored hours now land on a different person.
        await assertTicketCapacity(
          {
            allocationHoursPerDay: Number(ticket.allocationHoursPerDay),
            allocationFrom: ticket.allocationFrom,
            allocationTo:   ticket.allocationTo,
          },
          { assigneeId: nextAssigneeId, ticketId: ticket.id, dueDate: nextDueDate },
        );
      }
    } catch (e) {
      if (e instanceof AllocationConflictError) return sendAllocationConflict(res, e);
      throw e;
    }

    // Clearing the assignee also clears the allocation — nobody to allocate to.
    if (hasOwn(updates, 'assigneeId') && updates.assigneeId === null) {
      for (const f of ALLOCATION_FIELDS) updates[f] = null;
      updates.allocationMode = 'total';
    }

    // ── Approval gate: block status change while any approval is pending ─────
    if (updates.status && updates.status !== prevStatus) {
      const pendingApproval = await HdTicketApproval.findOne({
        where:      { ticketId: ticket.id, status: 'pending' },
        attributes: ['id'],
      });
      if (pendingApproval) {
        return sendError(
          res,
          'This ticket is awaiting approval — its status is locked until the approver accepts or rejects.',
          409,
        );
      }
    }

    Object.assign(ticket, updates);

    // Reopen logic
    const newStatus = ticket.status;
    if (
      [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED].includes(prevStatus) &&
      newStatus === TICKET_STATUS.OPEN
    ) {
      ticket.reopenCount += 1;
      ticket.closedAt    = null;
    }

    await sequelize.transaction(async (t) => {
      await ticket.save({ transaction: t });

      // Log diffs
      for (const f of TRACKED_FIELDS) {
        if (String(snapshot[f] ?? '') !== String(ticket[f] ?? '')) {
          await logHistory(ticket.id, f, snapshot[f], ticket[f], req.hdUser.id, t);
        }
      }
    }); // end transaction

    return sendSuccess(res, ticket, 'Ticket updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/tickets/:id
 * Hard delete â€” admin only.
 * @type {import('express').RequestHandler}
 */
const deleteTicket = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin) return next(new ForbiddenError('Admin access required'));

    const ticket = await HdTicket.findByPk(req.params.id);
    if (!ticket) return next(new NotFoundError('Ticket'));

    const attachments = await HdAttachment.findAll({ where: { ticketId: ticket.id } });
    await ticket.destroy();
    for (const att of attachments) {
      const filePath = path.join(UPLOAD_DIR, att.storedName);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch(_) {}
      }
    }
    return sendSuccess(res, null, 'Ticket deleted');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/bulk-assign
 * Assign multiple tickets to one agent (B7).
 * Body: { ticketIds: number[], assigneeId: string, teamManagerId?: string }
 * Team = teamManagerId || assignee's manager. An assignee outside the team
 * skips every ticket (reported in skippedDetails); an unknown/inactive manager
 * is a 400. Every ticket that passes gets team_manager_id set.
 * Response data: { updated, skipped, skippedDetails: [{ ticketId, reason }] }
 * @type {import('express').RequestHandler}
 */
const bulkAssign = async (req, res, next) => {
  try {
    // ── Permission guard ─────────────────────────────────────────────────────
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canAssign) {
      return sendClientError(res, 'You do not have permission to assign tickets', 403);
    }
    const { ticketIds, assigneeId, teamManagerId } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0)
      return sendClientError(res, 'ticketIds must be a non-empty array');
    if (!assigneeId)
      return sendClientError(res, 'assigneeId is required');

    // Phase 3 — optional allocation applied to every ticket in the batch
    let alloc = {};
    // Set when the batch carries hours but not both dates: the resolved
    // allocationTotalHours describes NO ticket then (each keeps its own window),
    // so it is dropped here and recomputed per ticket below.
    let recomputeTotals = false;
    if (hasAllocationInput(req.body)) {
      const body = {};
      for (const f of ALLOCATION_FIELDS) if (hasOwn(req.body, f)) body[f] = req.body[f];
      // Resolve/validate once for the batch; capacity is checked PER TICKET below
      // (each ticket excludes its own current hours).
      const resolved = await resolveTicketAllocation(body, null, { checkCapacity: false });
      if (resolved.error) return sendClientError(res, resolved.error);
      alloc = resolved.values;
      // Dates not sent stay as each ticket has them. This only ever applies to a
      // per_day body: 'total' cannot resolve without BOTH dates (400 above), so
      // for a total-mode batch both keys are always present and nothing is dropped.
      if (!hasOwn(body, 'allocationFrom')) delete alloc.allocationFrom;
      if (!hasOwn(body, 'allocationTo'))   delete alloc.allocationTo;
      // …and the total resolved from the batch's (missing) dates must go with them,
      // or every ticket is written a total that contradicts its own window.
      if (!hasOwn(body, 'allocationFrom') || !hasOwn(body, 'allocationTo')) {
        delete alloc.allocationTotalHours;
        recomputeTotals = alloc.allocationHoursPerDay != null;
      }
    }

    // ── Team rule ────────────────────────────────────────────────────────────
    const teamRes = await resolveTeam({ assigneeId, teamManagerId });
    const skippedDetails = [];
    if (teamRes.error && teamRes.error !== 'Assignee is not in the selected team') {
      return sendClientError(res, teamRes.error);           // bad manager / assignee
    }

    const tickets = await HdTicket.findAll({ where: { id: { [Op.in]: ticketIds } } });
    const found   = new Set(tickets.map((tk) => String(tk.id)));
    for (const id of ticketIds) {
      if (!found.has(String(id))) skippedDetails.push({ ticketId: id, reason: 'Ticket not found' });
    }

    if (teamRes.error) {
      for (const tk of tickets) skippedDetails.push({ ticketId: tk.id, reason: teamRes.error });
      return sendSuccess(res, { updated: 0, skipped: skippedDetails.length, skippedDetails }, 'No tickets assigned');
    }

    // Capacity is enforced PER TICKET inside the batch transaction: a ticket whose
    // allocation would overload the assignee is SKIPPED with a reason, never a
    // whole-batch failure. The check runs on the transaction, so every ticket
    // already assigned in this batch counts towards the next one's total, and each
    // ticket excludes its own current hours (excludeTicketId).
    // A ticket whose exception is still undecided must be SETTLED first — the same
    // guard updateTicket applies. Bulk assign would otherwise overwrite the
    // assignee and all five allocation columns while the pending approval row
    // still points at the old agent/hours, so approving it would leave an
    // unapproved allocation and rejecting it would destroy the new one.
    // Batched: ONE query for the whole set, never per ticket.
    const pendingIds = new Set(
      tickets.length
        ? (await require('../../services/pm/ticketException.service')
            .pendingExceptionTicketIds(tickets.map((tk) => tk.id))).map(String)
        : [],
    );

    let updated = 0;
    const t = await sequelize.transaction();
    try {
      for (const ticket of tickets) {
        if (pendingIds.has(String(ticket.id))) {
          skippedDetails.push({ ticketId: ticket.id, reason: 'Ticket has a pending allocation exception' });
          continue;
        }
        const values = {
          allocationHoursPerDay: hasOwn(alloc, 'allocationHoursPerDay')
            ? alloc.allocationHoursPerDay
            : (ticket.allocationHoursPerDay == null ? null : Number(ticket.allocationHoursPerDay)),
          allocationFrom: hasOwn(alloc, 'allocationFrom') ? alloc.allocationFrom : ticket.allocationFrom,
          allocationTo:   hasOwn(alloc, 'allocationTo')   ? alloc.allocationTo   : ticket.allocationTo,
        };
        try {
          await assertTicketCapacity(values, {
            assigneeId: teamRes.assigneeId, ticketId: ticket.id, dueDate: ticket.dueDate, transaction: t,
          });
        } catch (e) {
          if (e instanceof AllocationConflictError) {
            skippedDetails.push({ ticketId: ticket.id, reason: 'Assignee would be over capacity' });
            continue;
          }
          throw e;
        }

        // Keep the stored total consistent with what THIS ticket ends up with:
        // hoursPerDay × its own working days. With no window at all there is no
        // total to speak of, so it is cleared rather than left stale.
        const perTicketAlloc = { ...alloc };
        if (recomputeTotals) {
          const from = values.allocationFrom ? toDayStr(values.allocationFrom) : null;
          const to   = values.allocationTo ? toDayStr(values.allocationTo) : toDayStr(ticket.dueDate);
          if (from && to) {
            const calendar = await require('../../services/pm/pmSettings.service').getCalendar();
            const wd = require('../../utils/capacityEngine').workingDaysBetween(from, to, calendar);
            perTicketAlloc.allocationTotalHours = Math.round(values.allocationHoursPerDay * wd * 10) / 10;
          } else {
            perTicketAlloc.allocationTotalHours = null;
          }
        }

        const changed = [];
        const apply = (f, v) => {
          const prev = ticket[f];
          if (!sameFieldValue(f, prev, v)) { ticket[f] = v; changed.push([f, prev, v]); }
        };
        apply('assigneeId',    teamRes.assigneeId);
        apply('teamManagerId', teamRes.teamManagerId);
        for (const f of Object.keys(perTicketAlloc)) apply(f, perTicketAlloc[f]);

        await ticket.save({ transaction: t });
        updated++;
        for (const [f, prev, next] of changed) {
          await logHistory(ticket.id, f, prev, next, req.hdUser.id, t);
        }
      }
      await t.commit();
    } catch(err) {
      await t.rollback();
      throw err;
    }

    return sendSuccess(res, { updated, skipped: skippedDetails.length, skippedDetails }, 'Tickets assigned');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/:id/allocation-exception
 * Ask an approver to allow an over-capacity allocation on this ticket.
 * Body: { allocationMode?, allocationHoursPerDay?, allocationTotalHours?,
 *         allocationFrom?, allocationTo?, assigneeId?, reason }
 * Decided in the SAME admin inbox as project exceptions (/pm/allocation-exceptions).
 * Permission mirrors assigning: admin or canAssign.
 * @type {import('express').RequestHandler}
 */
const requestTicketAllocationException = async (req, res, next) => {
  try {
    if (!req.hdUser?.isAdmin && !req.hdUser?.permissions?.canAssign) {
      return sendClientError(res, 'You do not have permission to assign tickets', 403);
    }
    const result = await ticketExceptionService()
      .requestTicketAllocationException(req.params.id, req.body || {}, req.hdUser);

    // Mail the approvers — the SAME notification the PM path sends (one flow, one
    // inbox, one email). Fire-and-forget: mail failures never fail the API.
    if (result?.approval) {
      require('../pm/project.controller')
        .notifyExceptionRequested(result.approval, req.hdUser)
        .catch(() => {});
    }
    return sendSuccess(res, result, 'Allocation exception requested', 201);
  } catch (e) {
    if (e instanceof AllocationConflictError) return sendAllocationConflict(res, e);
    if (e && e.isOperational && e.statusCode >= 400 && e.statusCode < 500) {
      return sendClientError(res, e.message, e.statusCode);
    }
    next(e);
  }
};

/**
 * GET /helpdesk/tickets/:id/history
 * Audit trail for a ticket, newest first.
 * @type {import('express').RequestHandler}
 */
const getHistory = async (req, res, next) => {
  try {
    const ticket = await HdTicket.findByPk(req.params.id, { attributes: ['id'] });
    if (!ticket) return next(new NotFoundError('Ticket'));

    const rows = await HdTicketHistory.findAll({
      where: { ticketId: req.params.id },
      order: [['changed_at', 'DESC']],
    });

    // Convert to plain objects (camelCase keys via underscored:true model)
    const history = rows.map(h => h.get({ plain: true }));

    // ── Enrich: resolve UUIDs / IDs to display names ───────────────────────
    await enrichHistory(history);

    return sendSuccess(res, history, 'History fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/tickets/:id/link
 * Link this ticket to another.
 * Body: { linkedTicketId: number, linkType: string }
 * @type {import('express').RequestHandler}
 */
const linkTicket = async (req, res, next) => {
  try {
    const { linkedTicketId, linkType } = req.body;

    if (!linkedTicketId) return sendError(res, 'linkedTicketId is required', 400);
    if (!Object.values(LINK_TYPE).includes(linkType))
      return sendError(res, `linkType must be one of: ${Object.values(LINK_TYPE).join(', ')}`, 400);

    const ticket = await HdTicket.findByPk(req.params.id);
    if (!ticket) return next(new NotFoundError('Ticket'));

    const target = await HdTicket.findByPk(linkedTicketId, { attributes: ['id'] });
    if (!target) return sendError(res, 'Linked ticket not found', 404);

    const old = { linkedTicketId: ticket.linkedTicketId, linkType: ticket.linkType };
    ticket.linkedTicketId = linkedTicketId;
    ticket.linkType       = linkType;

    const t = await sequelize.transaction();
    try {
      await ticket.save({ transaction: t });
      await logHistory(ticket.id, 'linkedTicketId', old.linkedTicketId, linkedTicketId, req.hdUser.id, t);
      await logHistory(ticket.id, 'linkType',       old.linkType,       linkType,       req.hdUser.id, t);
      await t.commit();
    } catch(err) {
      await t.rollback();
      throw err;
    }

    return sendSuccess(res, ticket, 'Ticket linked');
  } catch (err) {
    next(err);
  }
};

// ── Bulk Upload ───────────────────────────────────────────────────────────────
/**
 * POST /api/helpdesk/tickets/bulk-upload
 * Body: { rows: [{ "Title *", "Category", "Priority", "Description", ... }] }
 * Accepts rows parsed from the xlsx template by the frontend.
 * Keys are header-normalized (e.g. "Title *" → "title") before processing.
 * Returns { created, skipped, errors } — per-row errors never abort the batch.
 */
const bulkUpload = async (req, res, next) => {
  try {
    // ── Permission guard — require admin or both canAssign AND create access ─
    // canAssign alone is insufficient; it grants ticket management, not creation.
    // Until a dedicated canBulkCreate flag exists, restrict to admins only to
    // prevent privilege escalation via the import endpoint.
    if (!req.hdUser?.isAdmin) {
      return sendClientError(res, 'Only admins can bulk upload tickets', 403);
    }

    const { rows } = req.body || {};

    // Fix 3 — Row limit guard
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return sendClientError(res, 'No rows provided');
    }
    if (rows.length > 500) {
      return sendClientError(res, 'Maximum 500 rows per import');
    }

    // Requester team is derived per row from requester_email (falls back to the
    // importing user), never typed. Cached per distinct email for the batch.
    const importerTeam = await deriveRaisedByTeam(null, req.hdUser);
    const teamByEmail  = new Map();
    const raisedByTeamFor = async (email) => {
      const key = (email || '').trim().toLowerCase();
      if (!key) return importerTeam;
      if (!teamByEmail.has(key)) teamByEmail.set(key, await deriveRaisedByTeam(key, req.hdUser));
      return teamByEmail.get(key);
    };

    // Case-insensitive email → user lookup (cached per import)
    const userByEmail = new Map();
    const findUserByEmail = async (raw) => {
      const email = String(raw).trim().toLowerCase();
      if (!userByEmail.has(email)) {
        userByEmail.set(email, await User.findOne({
          where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email),
          attributes: ['id', 'isActive'],
          raw: true,
        }));
      }
      return { email, user: userByEmail.get(email) };
    };

    // Fix 1 — Header normalization: "Title *" → "title", "Category" → "category", etc.
    const normalize = (row) => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        const clean = k.replace(/\*/g, '').trim().toLowerCase().replace(/\s+/g, '_');
        out[clean] = typeof v === 'string' ? v.trim() : v;
      }
      return out;
    };

    // Fix 5 — Enum sets used for validation
    const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];
    const VALID_STATUSES   = ['open', 'in-progress', 'pending', 'resolved', 'closed'];

    const created = [];
    const errors  = [];

    // Fix 2 — No shared transaction; each row is an independent insert so one
    //          failure does not roll back previously committed tickets.
    for (let idx = 0; idx < rows.length; idx++) {
      // Fix 1 — Normalize raw header keys from the xlsx parser
      const r = normalize(rows[idx]);

      // Fix 4 — Title is required, min 3 characters
      if (!r.title || String(r.title).trim().length < 3) {
        errors.push({ row: idx + 1, field: 'title', msg: 'Title is required (min 3 characters)' });
        continue;
      }

      // Priority normalization and validation
      const priority = (r.priority || 'medium').toLowerCase();
      if (r.priority && !VALID_PRIORITIES.includes(priority)) {
        errors.push({ row: idx + 1, field: 'priority', msg: `Invalid priority "${r.priority}". Use: ${VALID_PRIORITIES.join(', ')}` });
        continue;
      }

      // Status (optional, defaults to 'open' — resolved/closed not allowed on import)
      const VALID_IMPORT_STATUSES = ['open', 'in-progress', 'pending'];
      const status = (r.status || 'open').toLowerCase().trim();
      if (r.status && !VALID_IMPORT_STATUSES.includes(status)) {
        errors.push({ row: idx + 1, field: 'status', msg: `Invalid status "${r.status}". Allowed: ${VALID_IMPORT_STATUSES.join(', ')}` });
        continue;
      }

      // Mode (optional — pass the raw template value through as-is; key is lowercased by normalize but value is untouched)
      const mode = r.mode ? String(r.mode).trim() : null;

      // Impact (optional, case-insensitive, stored as lowercase)
      const VALID_IMPACTS = ['low', 'medium', 'high'];
      const impact = r.impact ? String(r.impact).trim().toLowerCase() : null;
      if (impact && !VALID_IMPACTS.includes(impact)) {
        errors.push({ row: idx + 1, field: 'impact', msg: `Invalid impact "${r.impact}". Use: Low, Medium, High` });
        continue;
      }

      // Urgency (optional, same rules as impact)
      const urgency = r.urgency ? String(r.urgency).trim().toLowerCase() : null;
      if (urgency && !VALID_IMPACTS.includes(urgency)) {
        errors.push({ row: idx + 1, field: 'urgency', msg: `Invalid urgency "${r.urgency}". Use: Low, Medium, High` });
        continue;
      }

      // Site (optional, free text)
      const site = r.site ? String(r.site).trim() : null;

      // raised_by_team column is no longer accepted — derived above.

      // Billable (optional ENUM: 'Billable' or 'Non-Billable', defaults to 'Non-Billable')
      const billableRaw  = r.billable ? String(r.billable).trim() : 'Non-Billable';
      const billableNorm = billableRaw.toLowerCase() === 'billable' ? 'Billable' : 'Non-Billable';

      // Requester name and email (for external/widget tickets)
      const widgetName  = r.requester_name  ? String(r.requester_name).trim()  : null;
      const widgetEmail = r.requester_email ? String(r.requester_email).trim() : null;
      const raisedByTeam = await raisedByTeamFor(widgetEmail);

      // Team manager resolution (team_manager_email → users.id). group_name is ignored.
      let teamManagerId = null;
      if (r.team_manager_email) {
        const { email, user } = await findUserByEmail(r.team_manager_email);
        if (!user || !user.isActive) {
          errors.push({ row: idx + 1, field: 'team_manager_email', msg: `Team manager "${email}" not found` });
          continue;
        }
        teamManagerId = user.id;
      }

      // Assignee resolution (assignee_email → userId UUID string)
      let assigneeId = null;
      if (r.assignee_email) {
        const { email, user } = await findUserByEmail(r.assignee_email);
        if (!user) {
          errors.push({ row: idx + 1, field: 'assignee_email', msg: `User with email "${email}" not found` });
          continue;
        }
        assigneeId = user.id;
      }

      // Same team rule as createTicket (B5): manager must lead a team, assignee ∈ team
      const teamRes = await resolveTeam({ assigneeId, teamManagerId });
      if (teamRes.error) {
        const field = teamRes.error.startsWith('Assignee') ? 'assignee_email' : 'team_manager_email';
        const msg   = teamRes.error === 'Selected team manager has no active direct reports'
          ? `Team manager "${String(r.team_manager_email).trim().toLowerCase()}" not found`
          : teamRes.error;
        errors.push({ row: idx + 1, field, msg });
        continue;
      }
      assigneeId    = teamRes.assigneeId;
      teamManagerId = teamRes.teamManagerId;

      // requesterId guard: cannot create ticket without an authenticated user
      if (!req.hdUser?.id) {
        errors.push({ row: idx + 1, msg: 'Auth session missing — cannot assign requester' });
        continue;
      }

      // Wrap each row in its own short-lived transaction so generateReqNumber
      // can use SELECT FOR UPDATE, preventing concurrent-upload collisions.
      let rowTx;
      try {
        rowTx = await sequelize.transaction();
        const reqNumber = await generateReqNumber(rowTx);

        // request_type: validate against allowed values; store original casing
        const VALID_REQUEST_TYPES = ['incident', 'service request'];
        const rawRequestType      = (r.request_type || '').trim();
        const requestType         = VALID_REQUEST_TYPES.includes(rawRequestType.toLowerCase())
          ? rawRequestType
          : null;

        // due_date: accept ISO strings or date values coerced by the xlsx parser
        let dueDate = null;
        if (r.due_date) {
          const d = new Date(r.due_date);
          if (!isNaN(d.getTime())) dueDate = d;
        }

        const ticket = await HdTicket.create({
          reqNumber,
          title:       String(r.title).trim(),
          category:    (r.category    || '').trim() || null,
          description: (r.description || '').trim() || null,
          priority,
          requestType,
          dueDate,
          status,
          requesterId: req.hdUser.id,
          mode,
          impact,
          urgency,
          site,
          raisedByTeam,
          billable:    billableNorm,
          widgetName,
          widgetEmail,
          assigneeId,
          teamManagerId,
        }, { transaction: rowTx });

        await rowTx.commit();
        rowTx = null; // committed — no rollback needed

        // Log creation event in history (non-fatal — outside committed tx)
        try {
          await logHistory(ticket.id, 'status', null, ticket.status, req.hdUser?.id);
        } catch (_) { /* non-fatal */ }

        created.push(ticket.id);
      } catch (rowErr) {
        // Roll back the per-row transaction if still open
        if (rowTx) { try { await rowTx.rollback(); } catch (_) {} }
        // Sanitize: never expose raw SQL fragments from rowErr.message
        const safeMsg = rowErr.name === 'SequelizeValidationError'
          ? rowErr.errors.map(e => e.message).join('; ')
          : 'Database error creating ticket';
        errors.push({ row: idx + 1, msg: safeMsg });
      }
    }

    // Fix 9 — Consistent response format; partial success is still HTTP 200
    return res.status(200).json({
      success: true,
      message: `${created.length} ticket(s) created, ${errors.length} row(s) skipped`,
      data: { created: created.length, skipped: errors.length, errors },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/template/import
 * Download an Excel import template with dropdown validation for all manual ticket fields.
 * Columns: title, description, category, priority, request_type, due_date, status,
 * mode, impact, urgency, site, team_manager_email, assignee_email, requester_name,
 * requester_email, billable. (raised_by_team is derived; group_name retired.)
 * @type {import('express').RequestHandler}
 */
const getImportTemplate = async (req, res, next) => {
  try {
    const XL = getExcelJS();
    const wb = new XL.Workbook();

    // ── Main data sheet ────────────────────────────────────────────────────────
    const ws = wb.addWorksheet('Import Template');

    // Column headers use plain lowercase snake_case so that the parsed row keys
    // match exactly what the bulk-upload controller reads after normalisation.
    ws.columns = [
      { header: 'title',           key: 'title',           width: 40 },
      { header: 'description',     key: 'description',     width: 50 },
      { header: 'category',        key: 'category',        width: 20 },
      { header: 'priority',        key: 'priority',        width: 15 },
      { header: 'request_type',    key: 'request_type',    width: 18 },
      { header: 'due_date',        key: 'due_date',        width: 16 },
      { header: 'status',          key: 'status',          width: 15 },
      { header: 'mode',            key: 'mode',            width: 18 },
      { header: 'impact',          key: 'impact',          width: 15 },
      { header: 'urgency',         key: 'urgency',         width: 15 },
      { header: 'site',               key: 'site',               width: 20 },
      { header: 'team_manager_email', key: 'team_manager_email', width: 30 },
      { header: 'assignee_email',     key: 'assignee_email',     width: 28 },
      { header: 'requester_name',  key: 'requester_name',  width: 25 },
      { header: 'requester_email', key: 'requester_email', width: 28 },
      { header: 'billable',        key: 'billable',        width: 18 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    headerRow.height = 20;

    // ── Fetch all option types from DB with fallbacks ──────────────────────────
    let categories  = ['Technical', 'HR', 'Finance', 'Operations', 'General'];
    let modeOpts    = ['Web Form', 'E-Mail', 'Phone Call'];
    let impactOpts  = ['Low', 'Medium', 'High'];
    let urgencyOpts = ['Low', 'Medium', 'High'];
    let siteOpts      = [];
    let managerEmails = [];   // active users with ≥1 active direct report (same set as GET /helpdesk/teams)
    let agentEmails   = [];   // active users — for assignee_email & requester_email lookups

    try {
      const HdOption = require('../../models/helpdesk/HdOption');
      const [catRows, modeRows, impactRows, urgencyRows, siteRows, managerRows, userRows] = await Promise.all([
        HdOption.findAll({ where: { type: 'category' }, order: [['sort_order', 'ASC'], ['name', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'mode' },     order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'impact' },   order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'urgency' },  order: [['sort_order', 'ASC']], raw: true }),
        HdOption.findAll({ where: { type: 'site' },     order: [['sort_order', 'ASC']], raw: true }),
        User.findAll({
          where: {
            isActive: true,
            id: { [Op.in]: sequelize.literal('(SELECT DISTINCT managerId FROM users WHERE isActive = 1 AND managerId IS NOT NULL)') },
          },
          attributes: ['name', 'email'], order: [['name', 'ASC']], raw: true,
        }),
        User.findAll({ where: { isActive: true }, attributes: ['name', 'email'], order: [['name', 'ASC']], raw: true }),
      ]);
      if (catRows.length)     categories  = catRows.map((o) => o.name);
      if (modeRows.length)    modeOpts    = modeRows.map((o) => o.name);
      if (impactRows.length)  impactOpts  = impactRows.map((o) => o.name);
      if (urgencyRows.length) urgencyOpts = urgencyRows.map((o) => o.name);
      if (siteRows.length)    siteOpts    = siteRows.map((o) => o.name);
      managerEmails = managerRows.map((u) => u.email).filter(Boolean);
      agentEmails   = userRows.map((u) => u.email).filter(Boolean);
    } catch (optErr) {
      console.warn('[HD Template] Failed to load options from DB, using fallbacks:', optErr.message);
    }

    // Fixed lists
    const priorities   = Object.values(TICKET_PRIORITY); // low, medium, high, critical
    const statuses     = ['open', 'in-progress', 'pending'];
    const requestTypes = ['Incident', 'Service Request'];
    const billableOpts = ['Billable', 'Non-Billable'];

    // ── Valid Options sheet (visible tab — users see ALL allowed values here) ────
    // Layout: each column = one field. Dropdowns in Import Template reference this sheet.
    //  A=category  B=priority  C=status  D=request_type  E=mode  F=impact
    //  G=urgency   H=billable  I=site    J=team_manager_email  K=assignee_email / requester_email
    const dropSheet = wb.addWorksheet('Valid Options');
    const hdrs = ['category','priority','status','request_type','mode','impact','urgency','billable','site','team_manager_email','user_email (assignee/requester)'];
    dropSheet.getRow(1).values = hdrs;
    dropSheet.getRow(1).font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    dropSheet.getRow(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    dropSheet.getRow(1).height = 18;

    const optCols = [
      categories,
      priorities,
      statuses,
      requestTypes,
      modeOpts,
      impactOpts,
      urgencyOpts,
      billableOpts,
      siteOpts,
      managerEmails,
      agentEmails,
    ];
    optCols.forEach((list, ci) => {
      list.forEach((v, ri) => { dropSheet.getCell(ri + 2, ci + 1).value = v; });
      dropSheet.getColumn(ci + 1).width = ci >= 9 ? 35 : 22;
    });

    // Row 2: example/hint row — shows users the expected format; actual data starts at row 3
    ws.addRow({
      title:           'My example ticket',
      description:     'Detailed description here',
      category:        categories[0],
      priority:        'medium',
      request_type:    'Incident',
      due_date:        '',
      status:          'open',
      mode:            'Web Form',
      impact:          'Medium',
      urgency:         'Medium',
      site:               '',
      team_manager_email: '',
      assignee_email:     '',
      requester_name:     '',
      requester_email:    '',
      billable:           'Non-Billable',
    });
    const exampleRow = ws.getRow(2);
    exampleRow.font = { italic: true, color: { argb: 'FF6B7280' } };

    // Freeze header
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // ── Apply dropdown validation as ranges (rows 2–502) ─────────────────────
    // Starts at row 2 (example row) so dropdown arrows are visible immediately on open.
    // Columns: A=title B=description C=category D=priority E=request_type F=due_date
    //          G=status H=mode I=impact J=urgency K=site L=team_manager_email
    //          M=assignee_email N=requester_name(free) O=requester_email P=billable

    // Helper: register a DV range referencing a 'Valid Options' column
    const addSheetDV = (range, col, count, title, err) => {
      if (count === 0) return; // no options — leave as free text
      ws.dataValidations.add(range, {
        type: 'list', allowBlank: true,
        formulae: [`'Valid Options'!$${col}$2:$${col}$${count + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: title, error: err,
      });
    };
    // Helper: register a DV range with inline string (for short fixed lists)
    const addInlineDV = (range, vals, title) => {
      ws.dataValidations.add(range, {
        type: 'list', allowBlank: true,
        formulae: [`"${vals.join(',')}"`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: title, error: `Allowed: ${vals.join(', ')}`,
      });
    };

    // Valid Options columns:  A=category B=priority C=status D=request_type E=mode
    //                         F=impact G=urgency H=billable I=site J=team_manager_email
    //                         K=user_email

    // C = category         → Valid Options col A
    addSheetDV('C2:C502', 'A', categories.length,  'Invalid Category',     'Please select a category from the list');
    // D = priority         → inline (short fixed ENUM)
    addInlineDV('D2:D502', priorities,   'Invalid Priority');
    // E = request_type     → inline
    addInlineDV('E2:E502', requestTypes, 'Invalid Request Type');
    // G = status           → inline
    addInlineDV('G2:G502', statuses,     'Invalid Status');
    // H = mode             → Valid Options col E (from DB / fallback)
    addSheetDV('H2:H502', 'E', modeOpts.length,    'Invalid Mode',         'Please select a mode from the list');
    // I = impact           → Valid Options col F
    addSheetDV('I2:I502', 'F', impactOpts.length,  'Invalid Impact',       'Please select an impact level');
    // J = urgency          → Valid Options col G
    addSheetDV('J2:J502', 'G', urgencyOpts.length, 'Invalid Urgency',      'Please select an urgency level');
    // K = site             → Valid Options col I (conditional)
    addSheetDV('K2:K502', 'I', siteOpts.length,    'Invalid Site',         'Please select a site from the list');
    // L = team_manager_email → Valid Options col J (managers with direct reports)
    addSheetDV('L2:L502', 'J', managerEmails.length, 'Invalid Team Manager', 'Please select a team manager email from the list');
    // M = assignee_email   → Valid Options col K (active users)
    addSheetDV('M2:M502', 'K', agentEmails.length, 'Invalid Assignee',     'Please select an email from the list');
    // N = requester_name   → free text (any external person name — no dropdown)
    // O = requester_email  → Valid Options col K (same user list — reuse)
    addSheetDV('O2:O502', 'K', agentEmails.length, 'Invalid Email',        'Please select an email from the list');
    // P = billable         → Valid Options col H
    addSheetDV('P2:P502', 'H', billableOpts.length,'Invalid Billable',     'Select: Billable or Non-Billable');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="helpdesk-import-template.xlsx"');

    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/tickets/export
 * Export all tickets (matching current filters) as an Excel file.
 * Supports the same filter query params as listTickets.
 * @type {import('express').RequestHandler}
 */
const exportTickets = async (req, res, next) => {
  try {
    // Same visibility + filters as listTickets (one helper — B4)
    const where = await buildTicketWhere(req.query, req.hdUser);

    const tickets = await HdTicket.findAll({
      where,
      include: listIncludes(),
      order: [['created_at', 'DESC']],
    });

    const XL = getExcelJS();
    const wb = new XL.Workbook();
    const ws = wb.addWorksheet('Helpdesk Tickets');

    ws.columns = [
      { header: 'Req Number',   key: 'reqNumber',    width: 14 },
      { header: 'Title',        key: 'title',        width: 40 },
      { header: 'Category',     key: 'category',     width: 20 },
      { header: 'Priority',     key: 'priority',     width: 12 },
      { header: 'Status',       key: 'status',       width: 14 },
      { header: 'Team',         key: 'teamName',     width: 25 },
      { header: 'Project',      key: 'projectName',  width: 30 },
      { header: 'Assignee',     key: 'assigneeName', width: 25 },
      { header: 'Requester',    key: 'requesterName',width: 25 },
      { header: 'Description',  key: 'description',  width: 50 },
      { header: 'Created At',   key: 'createdAt',    width: 20 },
      { header: 'Closed At',    key: 'closedAt',     width: 20 },
    ];

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.height = 20;

    for (const t of tickets) {
      const plain = t.get({ plain: true });
      ws.addRow({
        reqNumber:     plain.reqNumber   || '',
        title:         plain.title       || '',
        category:      plain.category    || '',
        priority:      plain.priority    || '',
        status:        plain.status      || '',
        teamName:      plain.teamManager?.name || plain.group?.name || '',
        projectName:   plain.pmProject?.name   || plain.project?.name || '',
        assigneeName:  plain.assigneeUser?.name  || plain.widgetName || '',
        requesterName: plain.requesterUser?.name || '',
        description:   plain.description || '',
        createdAt:     plain.createdAt   ? new Date(plain.createdAt).toLocaleString() : '',
        closedAt:      plain.closedAt    ? new Date(plain.closedAt).toLocaleString()  : '',
      });
    }

    // Freeze header and auto-filter
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: `L1` };

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="helpdesk-tickets-${dateStr}.xlsx"`);

    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  bulkAssign,
  bulkUpload,
  getHistory,
  linkTicket,
  getImportTemplate,
  exportTickets,
  requestTicketAllocationException,
  // Shared rules (used by task.controller / tests)
  ticketVisibilityWhere,
  resolveTeam,
  resolveTicketAllocation,
  assertTicketCapacity,
};
