'use strict';

/**
 * Ticket allocation exceptions — the helpdesk half of the ONE exception flow.
 *
 * A helpdesk ticket allocation obeys the same capacity rules as a PM allocation
 * segment: over capacity is BLOCKED (409), and the same exception request /
 * admin inbox unblocks it. The approval rows live in the SAME table
 * (pm_allocation_approvals, requestType 'exception') with `ticketId` set and
 * projectId / memberId / segmentId NULL (migration 047).
 *
 * D1 for tickets — a ticket whose exception is still undecided must NOT count
 * towards anybody's capacity. There is NO exceptionStatus column on hd_tickets:
 * the state is DERIVED from the open approval row
 * (allocation.service.loadTicketAllocationsForUsers excludes every ticket id in
 * the pending-exception subquery). One source of truth, nothing to keep in sync,
 * and reject/withdraw needs no extra column reset.
 *
 * request  → the ticket is written with the requested (over-capacity) allocation
 *            and a pending approval row is created ⇒ derived status 'pending'
 * approve  → the approval is marked approved ⇒ the ticket counts again, with its
 *            over-capacity hours
 * reject / withdraw → previousSnapshot.ticket is restored (or the allocation is
 *            cleared when the request introduced it)
 *
 * Dates are LOCAL 'YYYY-MM-DD' strings everywhere — never toISOString().
 */

const { Op } = require('sequelize');
const sequelize = require('../../config/database');   // the INSTANCE — never `{ sequelize }`
const PmAllocationApproval = require('../../models/pm/PmAllocationApproval');
const HdTicket             = require('../../models/helpdesk/HdTicket');
const User                 = require('../../models/User');
const pmSettingsService    = require('./pmSettings.service');
const alloc                = require('./allocation.service');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { checkConflict, resolveAllocation, toPct, iso, toDate } = require('../../utils/capacityEngine');

const isBlank = (v) => v === undefined || v === null || v === '';
const dateOnly = (v) => (v ? (v instanceof Date ? iso(v) : String(v).slice(0, 10)) : null);
const uidOf = (user) => String(user?._id ?? user?.id);

/** The ticket allocation fields an exception request captures / restores. */
const TICKET_ALLOCATION_FIELDS = [
  'allocationMode', 'allocationHoursPerDay', 'allocationTotalHours', 'allocationFrom', 'allocationTo',
];

/**
 * previousSnapshot.ticket — everything a reject/withdraw has to put back: the five
 * allocation columns AND the assignment (assigneeId + teamManagerId).
 *
 * Returns null only for a missing ticket. The CALLER decides whether a snapshot is
 * worth storing (see `needsSnapshot`): a request that neither changes the
 * assignment nor replaces an existing allocation has nothing to restore.
 * Pre-existing rows may carry no snapshot at all, or one without teamManagerId —
 * revertTicketException tolerates both.
 */
function ticketSnapshot(ticket) {
  if (!ticket) return null;
  return {
    allocationMode:        ticket.allocationMode || 'total',
    allocationHoursPerDay: ticket.allocationHoursPerDay == null ? null : Number(ticket.allocationHoursPerDay),
    allocationTotalHours:  ticket.allocationTotalHours == null ? null : Number(ticket.allocationTotalHours),
    allocationFrom:        dateOnly(ticket.allocationFrom),
    allocationTo:          dateOnly(ticket.allocationTo),
    assigneeId:            ticket.assigneeId ? String(ticket.assigneeId) : null,
    teamManagerId:         ticket.teamManagerId ? String(ticket.teamManagerId) : null,
  };
}

/** The pending exception approval of a ticket, or null. */
const pendingExceptionFor = (ticketId, transaction) =>
  PmAllocationApproval.findOne({
    where: { ticketId, requestType: 'exception', status: 'pending' },
    transaction,
  });

/**
 * Derived exception status of one ticket: 'pending' while an undecided request
 * exists, else 'approved' when its latest decided request was approved, else 'none'.
 */
async function ticketExceptionStatus(ticketId) {
  const rows = await PmAllocationApproval.findAll({
    where: { ticketId, requestType: 'exception' },
    attributes: ['id', 'status', 'createdAt'],
    order: [['createdAt', 'DESC']],
  });
  if (!rows.length) return { status: 'none', approvalId: null };
  const pending = rows.find(r => r.status === 'pending');
  if (pending) return { status: 'pending', approvalId: pending.id };
  const approved = rows.find(r => r.status === 'approved');
  // Every row decided against the request ⇒ the ticket carries NO exception, so
  // there is no approval for the client to open: status 'none' always pairs with
  // a null approvalId (the batched form agrees — it reports the status only).
  return approved ? { status: 'approved', approvalId: approved.id } : { status: 'none', approvalId: null };
}

/**
 * Ask for an over-capacity allocation on ONE helpdesk ticket.
 *
 * body: { allocationMode?, allocationHoursPerDay?, allocationTotalHours?,
 *         allocationFrom?, allocationTo?, assigneeId?, reason }
 *
 * Validated exactly like the project flow: reason required, amount resolved
 * against the EXCEPTION cap, refused when it actually fits ('No exception needed
 * — this allocation fits') and refused when the person's TOTAL daily load would
 * pass the cap. Returns { ticket, approval, user, overload }.
 */
async function requestTicketAllocationException(ticketId, body = {}, hdUser) {
  const ticket = await HdTicket.findByPk(ticketId);
  if (!ticket) throw new NotFoundError('Ticket');

  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) throw new ValidationError('reason is required');

  // Who carries the hours: the body's assignee, else the ticket's.
  const assigneeId = isBlank(body.assigneeId)
    ? (ticket.assigneeId ? String(ticket.assigneeId) : null)
    : String(body.assigneeId);
  if (!assigneeId) throw new ValidationError('The ticket has no assignee — assign it before requesting an exception');
  const assignee = await User.findOne({ where: { id: assigneeId, isActive: true }, attributes: ['id', 'name', 'email'] });
  if (!assignee) throw new NotFoundError('Assignee');

  const existingPending = await pendingExceptionFor(ticket.id);
  if (existingPending) throw new ConflictError('An allocation exception is already pending for this ticket');

  // B6/B7 — the assignee must belong to the ticket's team. THE same rule every
  // other assignment path enforces, taken from services/helpdesk/team.service
  // (resolveTeamFor) so this endpoint can never move a ticket to an agent
  // outside its team. Only evaluated when the assignment actually changes.
  let team = null;
  if (String(ticket.assigneeId ?? '') !== assigneeId || !isBlank(body.teamManagerId)) {
    const teamSvc = require('../helpdesk/team.service');
    const resolved = await teamSvc.resolveTeamForTicket(ticket, {
      assigneeId,
      teamManagerId: isBlank(body.teamManagerId) ? undefined : String(body.teamManagerId),
    });
    if (resolved.error) throw new ValidationError(resolved.error);
    team = resolved;
  }

  const allocationFrom = isBlank(body.allocationFrom) ? dateOnly(ticket.allocationFrom) : dateOnly(body.allocationFrom);
  const allocationTo   = isBlank(body.allocationTo)
    ? (dateOnly(ticket.allocationTo) || dateOnly(ticket.dueDate))
    : dateOnly(body.allocationTo);
  if (!allocationFrom || !allocationTo) throw new ValidationError('allocationFrom and allocationTo are required');
  if (!toDate(allocationFrom) || !toDate(allocationTo)) throw new ValidationError('Dates must be YYYY-MM-DD');
  if (allocationTo < allocationFrom) throw new ValidationError('End date is before start date');

  const calendar = await pmSettingsService.getCalendar();
  const capacity = calendar.hoursPerDay;
  const { maxHoursPerDay: exceptionCap } = await pmSettingsService.getExceptionPolicy();

  let mode = isBlank(body.allocationMode) ? null : body.allocationMode;
  if (!mode) mode = isBlank(body.allocationHoursPerDay) && !isBlank(body.allocationTotalHours) ? 'total' : 'per_day';
  if (mode !== 'per_day' && mode !== 'total') throw new ValidationError("allocationMode must be 'per_day' or 'total'");
  if (mode === 'per_day' && Number(body.allocationHoursPerDay) > exceptionCap) {
    throw new ValidationError(`Exceeds the exception cap of ${exceptionCap} hrs/day`);
  }
  // Resolved against the EXCEPTION cap, not the working-day capacity (same as the project flow)
  const r = resolveAllocation(
    {
      allocationMode: mode,
      hoursPerDay: body.allocationHoursPerDay,
      allocationTotalHours: body.allocationTotalHours,
      allocationFrom, allocationTo,
    },
    { ...calendar, hoursPerDay: exceptionCap },
  );
  if (!r.ok) throw new ValidationError(r.error);
  if (r.hoursPerDay > exceptionCap) throw new ValidationError(`Exceeds the exception cap of ${exceptionCap} hrs/day`);

  // It must actually NOT fit — otherwise a normal save is the right call.
  const others = await alloc.loadAllocationsForUsers([assigneeId], {
    countedOnly: true, calendar, excludeTicketId: ticket.id,
  });
  const check = checkConflict(others, {
    hoursPerDay: r.hoursPerDay, allocationFrom, allocationTo, projectId: null,
  }, calendar);
  if (check.ok) throw new ValidationError('No exception needed — this allocation fits');
  const overloadHours = check.suggestions?.overloadHours ?? Math.max(0, Math.round((check.peak - capacity) * 10) / 10);
  // D2 — the cap is on the person's TOTAL daily load, not on this request alone.
  if (check.peak > exceptionCap) {
    throw new ValidationError(
      `Exceeds the exception cap of ${exceptionCap} hrs/day: this would put ${check.peak} hrs/day on the person`
    );
  }

  // The snapshot is what reject/withdraw replays. It must be taken whenever the
  // request CHANGES something restorable — the allocation it replaces OR the
  // assignment (assignee / team) it moves. A request that only introduces an
  // allocation on the ticket's existing assignee has nothing to put back (null),
  // which is what the revert's "clear the allocation" branch handles.
  const reassigns = Boolean(team) && (
    !sameValue(team.assigneeId, ticket.assigneeId) || !sameValue(team.teamManagerId, ticket.teamManagerId)
  );
  const previousTicket = (ticket.allocationHoursPerDay != null || reassigns) ? ticketSnapshot(ticket) : null;
  const allocationPct = Math.min(255, Math.round(toPct(r.hoursPerDay, capacity)));   // approvals.allocationPct is NOT NULL

  const approval = await sequelize.transaction(async (t) => {
    const auditBefore = ticketAuditSnapshot(ticket);
    if (team) {
      ticket.assigneeId    = team.assigneeId;
      ticket.teamManagerId = team.teamManagerId;
    }
    ticket.allocationMode        = r.mode;
    ticket.allocationHoursPerDay = r.hoursPerDay;
    ticket.allocationTotalHours  = r.totalHours;
    ticket.allocationFrom        = allocationFrom;
    ticket.allocationTo          = allocationTo;
    await ticket.save({ transaction: t });

    const row = await PmAllocationApproval.create({
      requestType:          'exception',
      ticketId:             ticket.id,
      projectId:            null,
      memberId:             null,
      segmentId:            null,
      userId:               assigneeId,
      requestedById:        uidOf(hdUser),
      allocationMode:       r.mode,
      hoursPerDay:          r.hoursPerDay,
      allocationTotalHours: r.totalHours,
      allocationPct,
      fromDate:             allocationFrom,
      toDate:               allocationTo,
      status:               'pending',
      reason,
      overloadHours,
      previousSnapshot:     { ticket: previousTicket },
    }, { transaction: t });

    // The REQUEST mutates the ticket too (allocation, often the assignee/team) —
    // audit it on the same two trails a decision uses, or the reassignment is
    // invisible on the ticket's timeline until somebody decides the request.
    await logTicketExceptionChange({
      approval: row, action: 'exception_request',
      before: auditBefore, after: ticketAuditSnapshot(ticket),
      byId: uidOf(hdUser), note: reason,
    }, t);

    return row;
  });

  return {
    ticket,
    approval,
    user: assignee,
    overload: { capacity, peak: check.peak, overloadHours, exceptionMaxHoursPerDay: exceptionCap },
  };
}

// ── Audit ────────────────────────────────────────────────────────────────────
// A decision on a ticket exception mutates the ticket (allocation, sometimes the
// assignee). The project branches log to pm_allocation_history; the ticket
// branches must do the SAME, and additionally write hd_ticket_history so the
// change shows on the ticket's own timeline and is never a silent mutation.

/** Every field a decision may change, for the audit diff. */
const TICKET_AUDIT_FIELDS = ['assigneeId', 'teamManagerId', ...TICKET_ALLOCATION_FIELDS];

/** Flat, JSON-safe picture of the audited ticket columns. */
function ticketAuditSnapshot(ticket) {
  if (!ticket) return null;
  return {
    ticketId:              ticket.id,
    reqNumber:             ticket.reqNumber ?? null,
    assigneeId:            ticket.assigneeId ? String(ticket.assigneeId) : null,
    teamManagerId:         ticket.teamManagerId ? String(ticket.teamManagerId) : null,
    allocationMode:        ticket.allocationMode || null,
    allocationHoursPerDay: ticket.allocationHoursPerDay == null ? null : Number(ticket.allocationHoursPerDay),
    allocationTotalHours:  ticket.allocationTotalHours == null ? null : Number(ticket.allocationTotalHours),
    allocationFrom:        dateOnly(ticket.allocationFrom),
    allocationTo:          dateOnly(ticket.allocationTo),
  };
}

const sameValue = (a, b) => String(a ?? '') === String(b ?? '');

/**
 * Write the audit trail for ONE change made by the ticket exception flow — the
 * REQUEST as well as the decision that follows it:
 *   - pm_allocation_history (the shared allocation audit — ticketId set,
 *     projectId / memberId NULL, migration 048)
 *   - hd_ticket_history, one row per field actually changed, in the same shape
 *     ticket.controller's logHistory writes.
 * Never throws for the caller's sake beyond the transaction it runs in.
 */
async function logTicketExceptionChange({ approval, action, before, after, byId, note }, t) {
  await alloc.logAllocation({
    projectId: null,
    memberId:  null,
    segmentId: null,
    ticketId:  approval.ticketId,
    userId:    approval.userId,
    action,
    before, after,
    byId: byId || null,
    note: note || null,
  }, t);

  if (!before || !after) return;
  const HdTicketHistory = require('../../models/helpdesk/HdTicketHistory');
  for (const f of TICKET_AUDIT_FIELDS) {
    if (sameValue(before[f], after[f])) continue;
    await HdTicketHistory.create({
      ticketId:  approval.ticketId,
      field:     f,
      oldValue:  before[f] != null ? String(before[f]) : null,
      newValue:  after[f]  != null ? String(after[f])  : null,
      changedBy: byId || null,
    }, { transaction: t });
  }
}

/**
 * Approve: the ticket KEEPS the requested allocation; the approval row going to
 * 'approved' is what makes it count again (derived status 'approved').
 * The decision is still audited — an approval is a state change on the ticket.
 * Returns the ticket (or null when it has since been deleted).
 */
async function approveTicketException(approval, t) {
  const ticket = await HdTicket.findByPk(approval.ticketId, { transaction: t });
  if (!ticket) return null;
  const snap = ticketAuditSnapshot(ticket);
  await logTicketExceptionChange({
    approval, action: 'exception_approve',
    before: snap, after: snap,          // approve changes no column — it unblocks the hours
    byId: approval.approvedById, note: approval.approverNote,
  }, t);
  return ticket;
}

/**
 * Reject / withdraw: put the ticket back exactly as it was — the five allocation
 * columns AND the assignment (assigneeId + teamManagerId as they were), so a
 * rejected exception fully undoes the reassignment. When the request introduced
 * the allocation and moved nothing there is no snapshot (older rows may have
 * none at all, or one without teamManagerId): the
 * allocation is then cleared and the assignment is left alone, because nothing
 * recorded what it used to be.
 * Returns the ticket (or null).
 */
async function revertTicketException(approval, t, { action = 'exception_reject' } = {}) {
  const ticket = await HdTicket.findByPk(approval.ticketId, { transaction: t });
  if (!ticket) return null;
  const snap = approval.previousSnapshot && typeof approval.previousSnapshot === 'object'
    ? (approval.previousSnapshot.ticket || null)
    : null;
  const before = ticketAuditSnapshot(ticket);

  if (snap) {
    for (const f of TICKET_ALLOCATION_FIELDS) if (f in snap) ticket[f] = snap[f];
    // The snapshot captures the assignment too. Restore it VERBATIM: re-deriving
    // the team from the assignee would silently move a ticket that legitimately
    // sat under a manager other than the assignee's reporting manager.
    const assigneeChanged = 'assigneeId' in snap && !sameValue(snap.assigneeId, ticket.assigneeId);
    if (assigneeChanged) ticket.assigneeId = snap.assigneeId || null;   // clearing keeps the team, as updateTicket does
    if ('teamManagerId' in snap) {
      ticket.teamManagerId = snap.teamManagerId || null;
    } else if (assigneeChanged && snap.assigneeId) {
      // Pre-existing rows snapshotted no team — fall back to re-deriving it from
      // the restored assignee (active reporting manager, else self). A
      // since-deactivated assignee cannot be resolved: put the id back anyway
      // (it is what the ticket had) and leave the team as-is.
      const teamSvc = require('../helpdesk/team.service');
      const resolved = await teamSvc.resolveTeamFor({ assigneeId: snap.assigneeId });
      if (!resolved.error) ticket.teamManagerId = resolved.teamManagerId;
    }
  } else {
    ticket.allocationMode        = 'total';
    ticket.allocationHoursPerDay = null;
    ticket.allocationTotalHours  = null;
    ticket.allocationFrom        = null;
    ticket.allocationTo          = null;
  }
  await ticket.save({ transaction: t });

  await logTicketExceptionChange({
    approval, action,
    before, after: ticketAuditSnapshot(ticket),
    byId: approval.approvedById, note: approval.approverNote,
  }, t);
  return ticket;
}

/**
 * Batched form of ticketExceptionStatus for a whole list page — ONE query for
 * every ticket, never one per row.
 * @param {Array<number|string>} ticketIds
 * @returns {Promise<Map<string, 'pending'|'approved'|'none'>>} only ids that have
 *   an approval row appear; callers default the rest to 'none'.
 */
async function ticketExceptionStatuses(ticketIds = []) {
  const ids = [...new Set((ticketIds || []).filter((v) => v != null))];
  const out = new Map();
  if (!ids.length) return out;

  const rows = await PmAllocationApproval.findAll({
    where: { requestType: 'exception', ticketId: { [Op.in]: ids } },
    attributes: ['id', 'ticketId', 'status', 'createdAt'],
    order: [['createdAt', 'DESC']],
    raw: true,
  });
  // Same precedence as ticketExceptionStatus: any pending wins, else any approved.
  for (const r of rows) {
    const key = String(r.ticketId);
    const current = out.get(key);
    if (r.status === 'pending') out.set(key, 'pending');
    else if (r.status === 'approved' && current !== 'pending') out.set(key, 'approved');
    else if (!current) out.set(key, 'none');
  }
  return out;
}

/** Ticket ids that currently carry an undecided exception (for list/filter callers). */
async function pendingExceptionTicketIds(ticketIds = null) {
  const where = { requestType: 'exception', status: 'pending', ticketId: { [Op.ne]: null } };
  if (Array.isArray(ticketIds) && ticketIds.length) where.ticketId = { [Op.in]: ticketIds };
  const rows = await PmAllocationApproval.findAll({ where, attributes: ['ticketId'], raw: true });
  return rows.map(r => r.ticketId);
}

module.exports = {
  requestTicketAllocationException,
  approveTicketException,
  revertTicketException,
  ticketExceptionStatus,
  ticketExceptionStatuses,
  pendingExceptionFor,
  pendingExceptionTicketIds,
  ticketSnapshot,
  ticketAuditSnapshot,
  TICKET_ALLOCATION_FIELDS,
  TICKET_AUDIT_FIELDS,
};
