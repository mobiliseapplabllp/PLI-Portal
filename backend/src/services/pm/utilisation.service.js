/**
 * Utilisation Service — one person's (or a team's) committed hours vs monthly
 * capacity, across BOTH modules:
 *
 *   • PM   — pm_project_members.hoursPerDay over allocationFrom → allocationTo
 *   • HD   — hd_tickets.allocation_hours_per_day over allocation_from → allocation_to
 *            (assignment is single-valued via hd_tickets.assignee_id)
 *
 * All arithmetic is delegated to capacityEngine.monthBreakdown, which reads
 * the working calendar (hours/day, Saturday policy, holidays). Nothing here
 * is stored — every figure is computed from the allocation rows on demand.
 */

const { Op } = require('sequelize');
const ProjectMember = require('../../models/pm/ProjectMember');
const Project       = require('../../models/pm/Project');
const User          = require('../../models/User');
const HdTicket      = require('../../models/helpdesk/HdTicket');
const pmSettingsService = require('./pmSettings.service');
const E = require('../../utils/capacityEngine');
const { ValidationError } = require('../../utils/errors');

const INACTIVE_PROJECT_STATUSES = ['completed', 'cancelled', 'closed'];
const INACTIVE_TICKET_STATUSES  = ['closed', 'resolved'];
const MAX_MONTHS = 12;

const dateOnly = (v) => (v ? String(v instanceof Date ? E.iso(v) : v).slice(0, 10) : null);

/** Every allocation (PM + HD) for a set of users, grouped by userId. */
async function loadAllocations(userIds) {
  const ids = [...new Set(userIds.map(String))];
  const byUser = new Map(ids.map(id => [id, []]));
  if (!ids.length) return byUser;

  const members = await ProjectMember.findAll({
    where: { userId: { [Op.in]: ids }, hoursPerDay: { [Op.ne]: null } },
    include: [{
      model: Project, as: 'project', attributes: ['id', 'name', 'status'], required: true,
      where: { status: { [Op.notIn]: INACTIVE_PROJECT_STATUSES } },
    }],
  });
  for (const m of members) {
    byUser.get(String(m.userId))?.push({
      source: 'project',
      refId: m.projectId,
      name: m.project?.name || 'Project',
      status: m.project?.status || null,
      hoursPerDay: Number(m.hoursPerDay),
      allocationMode: m.allocationMode || 'per_day',
      allocationTotalHours: m.allocationTotalHours == null ? null : Number(m.allocationTotalHours),
      allocationFrom: dateOnly(m.allocationFrom),
      allocationTo: dateOnly(m.allocationTo),
      isEstimated: m.hoursConfirmed === false,
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
    });
  }
  return byUser;
}

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

/** One person, one month, full breakdown. */
async function getUserUtilisation(userId, monthStr, calendar) {
  const { year, month } = parseMonth(monthStr);
  const cal  = calendar || await pmSettingsService.getCalendar();
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email', 'role', 'designation'] });
  const allocs = (await loadAllocations([userId])).get(String(userId)) || [];
  const bd = withModuleTotals(E.monthBreakdown(allocs, year, month, cal));
  return {
    userId: String(userId),
    user: user ? { name: user.name, email: user.email, role: user.role, designation: user.designation } : null,
    ...bd,
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

  const allocByUser = await loadAllocations(users.map(u => u.id));

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
