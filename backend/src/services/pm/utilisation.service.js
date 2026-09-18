/**
 * Utilisation Service — one person's (or a team's) committed hours vs monthly
 * capacity, across BOTH modules:
 *
 *   • PM   — pm_allocation_segments (one line per SEGMENT, keyed by segmentId) via
 *            allocation.service.loadSegmentsForUsers — the one PM loader
 *   • HD   — hd_tickets.allocation_hours_per_day over allocation_from → allocation_to
 *            (assignment is single-valued via hd_tickets.assignee_id)
 *
 * All arithmetic is delegated to capacityEngine.monthBreakdown, which reads
 * the working calendar (hours/day, Saturday policy, holidays). Nothing here
 * is stored — every figure is computed from the allocation rows on demand.
 */

const { Op } = require('sequelize');
const User          = require('../../models/User');
const HdTicket      = require('../../models/helpdesk/HdTicket');
const pmSettingsService = require('./pmSettings.service');
// Only the SEGMENT half here — this service builds its own HD lines below with
// ticket-specific fields (reqNumber, title) that the shared loader does not carry.
const { loadSegmentsForUsers } = require('./allocation.service');
const E = require('../../utils/capacityEngine');
const { ValidationError } = require('../../utils/errors');

const INACTIVE_TICKET_STATUSES  = ['closed', 'resolved'];
const MAX_MONTHS = 12;

const dateOnly = (v) => (v ? String(v instanceof Date ? E.iso(v) : v).slice(0, 10) : null);

/**
 * Every allocation (PM + HD) for a set of users, grouped by userId.
 * PM lines are one per SEGMENT (`segmentId`; `refId` stays the projectId) and
 * carry `exceptionStatus` ('none' | 'approved' | 'pending'); pending exception
 * segments are EXCLUDED unless `includePending` is set — they never count
 * towards totals (D1). Callers that opt in must keep them out of the arithmetic.
 */
async function loadAllocations(userIds, { includePending = false, calendar } = {}) {
  const ids = [...new Set(userIds.map(String))];
  const byUser = new Map(ids.map(id => [id, []]));
  if (!ids.length) return byUser;

  // countedOnly=false returns every status; keep counted + pending, never rejected.
  const segments = await loadSegmentsForUsers(ids, { countedOnly: !includePending, calendar });
  for (const s of segments) {
    if (s.hoursPerDay == null) continue;
    if (s.exceptionStatus !== 'none' && s.exceptionStatus !== 'approved' && !(includePending && s.exceptionStatus === 'pending')) continue;
    byUser.get(String(s.userId))?.push({
      source: 'project',
      refId: s.projectId,
      memberId: s.memberId,
      segmentId: s.segmentId,
      name: s.projectName || 'Project',
      status: s.projectStatus || null,
      hoursPerDay: Number(s.hoursPerDay),
      allocationMode: s.allocationMode || 'per_day',
      allocationTotalHours: s.allocationTotalHours,
      allocationFrom: s.allocationFrom,
      allocationTo: s.allocationTo,
      isEstimated: s.isEstimated === true,
      exceptionStatus: s.exceptionStatus || 'none',
    });
  }

  const tickets = await HdTicket.findAll({
    where: {
      assigneeId: { [Op.in]: ids },
      allocationHoursPerDay: { [Op.ne]: null },
      status: { [Op.notIn]: INACTIVE_TICKET_STATUSES },
    },
    attributes: ['id', 'reqNumber', 'title', 'status', 'assigneeId', 'allocationHoursPerDay', 'allocationFrom', 'allocationTo', 'dueDate',
                 'allocationMode', 'allocationTotalHours'],
  });
  for (const t of tickets) {
    byUser.get(String(t.assigneeId))?.push({
      source: 'helpdesk',
      refId: t.id,
      name: `${t.reqNumber || 'Ticket'} · ${t.title || ''}`.trim(),
      status: t.status,
      hoursPerDay: Number(t.allocationHoursPerDay),
      allocationMode: t.allocationMode || 'total',
      allocationTotalHours: t.allocationTotalHours == null ? null : Number(t.allocationTotalHours),
      allocationFrom: dateOnly(t.allocationFrom),
      // No explicit end → the ticket's due date; still none → engine treats as open-ended
      allocationTo: dateOnly(t.allocationTo) || dateOnly(t.dueDate),
      isEstimated: false,
      exceptionStatus: 'none',
    });
  }
  return byUser;
}

const isPendingException = (a) => a.exceptionStatus === 'pending';

const bandOf = (b) => b;   // kept for clarity — engine already bands

function withModuleTotals(breakdown) {
  const pm = breakdown.lines.filter(l => l.source === 'project').reduce((s, l) => s + l.hours, 0);
  const hd = breakdown.lines.filter(l => l.source === 'helpdesk').reduce((s, l) => s + l.hours, 0);
  return { ...breakdown, pmHours: Math.round(pm * 10) / 10, hdHours: Math.round(hd * 10) / 10 };
}

function parseMonth(s) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(s || ''));
  if (!m) throw new ValidationError('month must be in YYYY-MM format');
  const year = Number(m[1]), month = Number(m[2]);
  if (month < 1 || month > 12) throw new ValidationError('month must be in YYYY-MM format');
  return { year, month };
}
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;

function monthRange(from, to) {
  const a = parseMonth(from), b = parseMonth(to);
  let [y, m] = [a.year, a.month];
  const out = [];
  while (y < b.year || (y === b.year && m <= b.month)) {
    out.push({ year: y, month: m, key: monthKey(y, m) });
    if (out.length > MAX_MONTHS) throw new ValidationError(`Range too large — maximum ${MAX_MONTHS} months`);
    m++; if (m > 12) { m = 1; y++; }
  }
  if (!out.length) throw new ValidationError('"to" month is before "from" month');
  return out;
}

/**
 * One person, one month, full breakdown. `lines` (counted) each carry
 * `exceptionStatus`; pending exception rows are returned separately in
 * `pendingExceptionLines` (same shape, `counted: false`) and never touch totals.
 */
async function getUserUtilisation(userId, monthStr, calendar) {
  const { year, month } = parseMonth(monthStr);
  const cal  = calendar || await pmSettingsService.getCalendar();
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'role', 'designation'] });
  const all     = (await loadAllocations([userId], { includePending: true, calendar: cal })).get(String(userId)) || [];
  const counted = all.filter(a => !isPendingException(a));
  const pending = all.filter(isPendingException);
  const bd = withModuleTotals(E.monthBreakdown(counted, year, month, cal));
  const pendingExceptionLines = pending.length
    ? E.monthBreakdown(pending, year, month, cal).lines.map(l => ({ ...l, counted: false }))
    : [];
  return {
    userId: String(userId),
    user: user ? { name: user.name, email: user.email, role: user.role, designation: user.designation } : null,
    ...bd,
    pendingExceptionLines,
  };
}

/** Team × months grid for the heat map. */
async function getTeamUtilisation({ userIds, from, to }) {
  const cal    = await pmSettingsService.getCalendar();
  const months = monthRange(from, to);

  let users;
  if (userIds && userIds.length) {
    users = await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'name', 'email', 'role', 'designation'] });
  } else {
    const where = {};
    if (User.rawAttributes.isActive) where.isActive = true;
    users = await User.findAll({ where, attributes: ['id', 'name', 'email', 'role', 'designation'], order: [['name', 'ASC']] });
  }

  const allocByUser = await loadAllocations(users.map(u => u.id), { calendar: cal });

  const monthMeta = months.map(({ year, month, key }) => {
    const cap = E.getMonthlyCapacity(year, month, cal);
    return { month: key, year, monthNum: month, workingDays: cap.workingDays, totalHours: cap.totalHours,
             summary: { userCount: 0, avgPct: 0, overCount: 0, highCount: 0, freeCount: 0 }, _pctSum: 0 };
  });

  const rows = users.map(u => {
    const allocs = allocByUser.get(String(u.id)) || [];
    const cells = months.map(({ year, month, key }, i) => {
      const bd = withModuleTotals(E.monthBreakdown(allocs, year, month, cal));
      const meta = monthMeta[i];
      meta.summary.userCount++;
      meta._pctSum += bd.totalPct;
      if (bd.band === 'over') meta.summary.overCount++;
      else if (bd.band === 'high') meta.summary.highCount++;
      else if (bd.band === 'free') meta.summary.freeCount++;
      return {
        month: key,
        totalHours: bd.totalHours, totalPct: bd.totalPct,
        pmHours: bd.pmHours, hdHours: bd.hdHours,
        peakHoursPerDay: bd.peakHoursPerDay, overDays: bd.overDays,
        isOverAllocated: bd.isOverAllocated, band: bandOf(bd.band),
      };
    });
    return { userId: String(u.id), name: u.name, email: u.email, role: u.role, designation: u.designation, cells };
  });

  for (const m of monthMeta) {
    m.summary.avgPct = m.summary.userCount ? Math.round((m._pctSum / m.summary.userCount) * 10) / 10 : 0;
    delete m._pctSum;
  }

  return {
    calendar: { hoursPerDay: cal.hoursPerDay, workingSaturdays: cal.workingSaturdays },
    months: monthMeta,
    users: rows,
  };
}

module.exports = { loadAllocations, getUserUtilisation, getTeamUtilisation, parseMonth, monthRange };
