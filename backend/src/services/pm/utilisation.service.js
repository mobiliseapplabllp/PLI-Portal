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
 *
 * ACTUALS (time_entries) sit beside the plan: every line gets `actualHours`,
 * every month gets actualTotalHours / actualPmHours / actualHdHours / actualPct.
 * Milestone entries roll up into their project line. Hours logged on an entity
 * the person has no allocation on still count — they appear as an extra line
 * flagged `unplanned:true` so nothing is hidden.
 */

const { Op, QueryTypes } = require('sequelize');
const sequelize     = require('../../config/database');   // instance — never destructure
const ProjectMember = require('../../models/pm/ProjectMember');
const Project       = require('../../models/pm/Project');
const Milestone     = require('../../models/pm/Milestone');
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
                 'allocationMode', 'allocationTotalHours', 'projectId'],
  });

  // Attribute helpdesk hours to the PM project they served, via the helpdesk
  // profile (hd_projects.pm_project_id → pm_projects). One batch lookup.
  const hdProjectIds = [...new Set(tickets.map(t => t.projectId).filter(Boolean))];
  const hdToPm = new Map();   // hd_project id → { projectId (PM UUID), projectName }
  if (hdProjectIds.length) {
    const HdProject = require('../../models/helpdesk/HdProject');
    const profiles = await HdProject.findAll({ where: { id: { [Op.in]: hdProjectIds } }, attributes: ['id', 'name', 'pmProjectId'] });
    const pmIds = [...new Set(profiles.map(p => p.pmProjectId).filter(Boolean))];
    const pmNames = new Map();
    if (pmIds.length) {
      const pms = await Project.findAll({ where: { id: { [Op.in]: pmIds } }, attributes: ['id', 'name'] });
      for (const p of pms) pmNames.set(String(p.id), p.name);
    }
    for (const p of profiles) {
      hdToPm.set(p.id, {
        projectId: p.pmProjectId ? String(p.pmProjectId) : null,
        projectName: (p.pmProjectId && pmNames.get(String(p.pmProjectId))) || p.name || null,
      });
    }
  }

  for (const t of tickets) {
    const proj = t.projectId ? hdToPm.get(t.projectId) : null;
    byUser.get(String(t.assigneeId))?.push({
      source: 'helpdesk',
      refId: t.id,
      name: `${t.reqNumber || 'Ticket'} · ${t.title || ''}`.trim(),
      status: t.status,
      projectId: proj?.projectId ?? null,       // PM master project, when the helpdesk project is linked
      projectName: proj?.projectName ?? null,
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
const r2 = (n) => Math.round(Number(n) * 100) / 100;

// ── Actuals (time_entries) ────────────────────────────────────────────────────

/**
 * Logged hours for a set of users across a run of months — ONE grouped query.
 * Ticket entries key as `helpdesk|<ticketId>`, project entries as
 * `project|<projectId>`, milestone entries roll up to `project|<projectId>`
 * (resolved with one Milestone lookup). A milestone that no longer exists keys
 * as `project|milestone:<id>` so its hours are still shown.
 *
 * @returns {{ byUserMonth: Map<'userId|YYYY-MM', Map<'source|refId', hours>>,
 *             names: Map<'source|refId', { name, status }> }}
 */
async function loadActuals(userIds, months) {
  const ids = [...new Set(userIds.map(String))];
  const out = { byUserMonth: new Map(), names: new Map() };
  if (!ids.length || !months.length) return out;

  const first = months[0], last = months[months.length - 1];
  const from = `${first.key}-01`;
  const to   = E.iso(new Date(last.year, last.month, 0));   // last day of the last month

  const rows = await sequelize.query(
    `SELECT user_id AS userId, entity_type AS entityType, entity_id AS entityId,
            DATE_FORMAT(date, '%Y-%m') AS month, SUM(hours) AS hours
       FROM time_entries
      WHERE user_id IN (:ids) AND date BETWEEN :from AND :to
      GROUP BY user_id, entity_type, entity_id, DATE_FORMAT(date, '%Y-%m')`,
    { type: QueryTypes.SELECT, replacements: { ids, from, to } }
  );
  if (!rows.length) return out;

  const msIds = [...new Set(rows.filter(r => r.entityType === 'milestone').map(r => String(r.entityId)))];
  const msToProject = new Map();
  if (msIds.length) {
    const ms = await Milestone.findAll({ where: { id: { [Op.in]: msIds } }, attributes: ['id', 'projectId'] });
    for (const m of ms) msToProject.set(String(m.id), String(m.projectId));
  }

  const projectRefs = new Set(), ticketRefs = new Set();
  for (const r of rows) {
    let source, refId;
    if (r.entityType === 'ticket') {
      source = 'helpdesk'; refId = String(r.entityId); ticketRefs.add(refId);
    } else {
      source = 'project';
      refId = r.entityType === 'milestone'
        ? (msToProject.get(String(r.entityId)) || `milestone:${r.entityId}`)
        : String(r.entityId);
      projectRefs.add(refId);
    }
    const umKey = `${String(r.userId)}|${r.month}`;
    let cell = out.byUserMonth.get(umKey);
    if (!cell) { cell = new Map(); out.byUserMonth.set(umKey, cell); }
    const k = `${source}|${refId}`;
    cell.set(k, (cell.get(k) || 0) + Number(r.hours));
  }

  // Names for refs that may have no planned line (unplanned work).
  const pids = [...projectRefs].filter(x => !x.startsWith('milestone:'));
  if (pids.length) {
    const ps = await Project.findAll({ where: { id: { [Op.in]: pids } }, attributes: ['id', 'name', 'status'] });
    for (const p of ps) out.names.set(`project|${p.id}`, { name: p.name, status: p.status });
  }
  const tids = [...ticketRefs].filter(x => /^\d+$/.test(x)).map(Number);
  if (tids.length) {
    const ts = await HdTicket.findAll({ where: { id: { [Op.in]: tids } }, attributes: ['id', 'reqNumber', 'title', 'status'] });
    for (const t of ts) out.names.set(`helpdesk|${t.id}`, { name: `${t.reqNumber || 'Ticket'} · ${t.title || ''}`.trim(), status: t.status });
  }
  return out;
}

/**
 * Decorate one month breakdown with actuals. Existing fields are untouched;
 * `actualHours` is added to every line, unmatched actuals become
 * `unplanned:true` lines, and month-level actual totals are appended.
 */
function withActuals(bd, actualMap, names) {
  const map = actualMap || new Map();
  const seen = new Set();
  const lines = bd.lines.map(l => {
    const k = `${l.source}|${String(l.refId)}`;
    seen.add(k);
    return { ...l, actualHours: r2(map.get(k) || 0) };
  });
  for (const [k, hours] of map) {
    if (seen.has(k)) continue;
    const sep = k.indexOf('|');
    const source = k.slice(0, sep), rawRef = k.slice(sep + 1);
    const meta = (names && names.get(k)) || null;
    const isOrphanMilestone = rawRef.startsWith('milestone:');
    lines.push({
      source,
      refId: source === 'helpdesk' && /^\d+$/.test(rawRef) ? Number(rawRef) : rawRef,
      name: meta?.name || (isOrphanMilestone ? 'Deleted milestone' : source === 'helpdesk' ? 'Ticket' : 'Project'),
      status: meta?.status ?? null,
      hoursPerDay: null, allocationMode: null, allocationTotalHours: null,
      allocationFrom: null, allocationTo: null, isEstimated: false,
      workingDaysInMonth: 0, hours: 0, pct: 0,
      actualHours: r2(hours),
      unplanned: true,
    });
  }
  const pm = lines.filter(l => l.source === 'project').reduce((s, l) => s + l.actualHours, 0);
  const hd = lines.filter(l => l.source === 'helpdesk').reduce((s, l) => s + l.actualHours, 0);
  const total = r2(pm + hd);
  const cap = bd.capacity?.totalHours || 0;
  return {
    ...bd, lines,
    actualPmHours: r2(pm), actualHdHours: r2(hd), actualTotalHours: total,
    actualPct: cap ? Math.round((total / cap) * 1000) / 10 : 0,
  };
}

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
  const key  = monthKey(year, month);
  const [allocByUser, actuals] = await Promise.all([
    loadAllocations([userId]),
    loadActuals([userId], [{ year, month, key }]),
  ]);
  const allocs = allocByUser.get(String(userId)) || [];
  const bd = withActuals(
    withModuleTotals(E.monthBreakdown(allocs, year, month, cal)),
    actuals.byUserMonth.get(`${String(userId)}|${key}`), actuals.names
  );
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

  const [allocByUser, actuals] = await Promise.all([
    loadAllocations(users.map(u => u.id)),
    loadActuals(users.map(u => u.id), months),      // one grouped query for the whole grid
  ]);

  const monthMeta = months.map(({ year, month, key }) => {
    const cap = E.getMonthlyCapacity(year, month, cal);
    return { month: key, year, monthNum: month, workingDays: cap.workingDays, totalHours: cap.totalHours,
             summary: { userCount: 0, avgPct: 0, overCount: 0, highCount: 0, freeCount: 0 }, _pctSum: 0 };
  });

  const rows = users.map(u => {
    const allocs = allocByUser.get(String(u.id)) || [];
    const cells = months.map(({ year, month, key }, i) => {
      const bd = withActuals(
        withModuleTotals(E.monthBreakdown(allocs, year, month, cal)),
        actuals.byUserMonth.get(`${String(u.id)}|${key}`), actuals.names
      );
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
        actualTotalHours: bd.actualTotalHours, actualPct: bd.actualPct,
        actualPmHours: bd.actualPmHours, actualHdHours: bd.actualHdHours,
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

module.exports = { loadAllocations, loadActuals, withActuals, getUserUtilisation, getTeamUtilisation, parseMonth, monthRange };
