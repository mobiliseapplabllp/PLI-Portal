const { Op } = require('sequelize');
const { RosterWeek, RosterEntry, RosterCompOff, RosterSwapRequest } = require('../../models/associations');
const User = require('../../models/User');
const Department = require('../../models/Department');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../utils/errors');
const { createAuditLog } = require('../../middleware/auditLogger');
const { generateExcel } = require('../../utils/excelExporter');
const {
  ROSTER_STATUS,
  ROSTER_COMP_OFF_STATUS,
  ROSTER_ADMIN_ROLES,
  ROSTER_TEAM_MANAGER_ROLES,
} = require('../../config/constants');
const {
  sendRosterPublishedEmail,
  sendRosterChangeEmail,
} = require('../../utils/emailService');

// ── Role helpers ──────────────────────────────────────────────────────────────
const isRosterAdmin = (user) => ROSTER_ADMIN_ROLES.includes(user.role);
const isTeamManager = (user) => ROSTER_TEAM_MANAGER_ROLES.includes(user.role);

const assertRosterManager = (user) => {
  if (!isRosterAdmin(user) && !isTeamManager(user)) {
    throw new ForbiddenError('You are not allowed to manage rosters');
  }
};

// Admin/HR see everyone; managers see their direct reports (by current managerId)
const scopedEmployeeWhere = (user, extra = {}) => {
  const where = { isActive: true, rosterApplicable: { [Op.ne]: false }, ...extra };
  if (!isRosterAdmin(user)) where.managerId = user._id;
  return where;
};

// ── Date helpers ──────────────────────────────────────────────────────────────
/**
 * Format a Date as YYYY-MM-DD in the SERVER'S LOCAL timezone.
 *
 * Deliberately not toISOString(): the business runs on IST (UTC+5:30), where
 * local midnight is 18:30 UTC the previous day — so toISOString() reports
 * yesterday's date for anything between 00:00 and 05:30 IST, quietly rostering
 * the wrong Saturday.
 */
const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isSaturdayStr = (dateStr) => new Date(`${dateStr}T00:00:00`).getDay() === 6;

const nextSaturdayStr = (from = new Date()) => {
  const d = new Date(from);
  const delta = (6 - d.getDay() + 7) % 7; // 0 when today is Saturday
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
};

const weekLabel = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const wkOfMonth = Math.ceil(d.getDate() / 7);
  const pretty = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `WK ${wkOfMonth} (${pretty})`;
};

/**
 * Company rule: when a month has a 5th Saturday, everybody works it.
 * The 1st–4th Saturdays always fall on days 1–28, so any Saturday dated 29+ is
 * by definition the 5th of its month.
 */
const isFifthSaturday = (dateStr) => Number(String(dateStr).slice(8, 10)) >= 29;

/** All Saturday dates in [from, to] inclusive, as YYYY-MM-DD strings. */
const saturdaysBetween = (from, to) => {
  const out = [];
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); // advance to first Saturday
  const end = new Date(`${to}T00:00:00`);
  while (d <= end) {
    out.push(toDateStr(d));
    d.setDate(d.getDate() + 7);
  }
  return out;
};

/** The most recent `n` Saturdays, ending with the upcoming one. */
const lastNSaturdays = (n) => {
  const out = [];
  const d = new Date(`${nextSaturdayStr()}T00:00:00`);
  for (let i = 0; i < n; i += 1) {
    out.unshift(toDateStr(d));
    d.setDate(d.getDate() - 7);
  }
  return out;
};

/** Every Saturday of an Indian financial year, e.g. "2026-27" → Apr 2026–Mar 2027. */
const financialYearSaturdays = (financialYear) => {
  const startYear = Number(String(financialYear).slice(0, 4));
  return saturdaysBetween(`${startYear}-04-01`, `${startYear + 1}-03-31`);
};

const currentFinancialYear = (d = new Date()) => {
  const y = d.getFullYear();
  const startYear = d.getMonth() + 1 >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

const prettyDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Auto-generation ───────────────────────────────────────────────────────────
/**
 * Latest previous FINAL status per employee before the given Saturday.
 * Returns Map<employeeId, { finalStatus, saturdayDate }>.
 *
 * 5th Saturdays are skipped: everyone works those by company rule, so using one
 * as the baseline would hand the entire company the same next Saturday off and
 * collapse the alternation. The baseline is the last *normal* Saturday.
 */
const getLastStatuses = async (employeeIds, beforeSaturday) => {
  if (!employeeIds.length) return new Map();
  const rows = await RosterEntry.findAll({
    where: { employeeId: { [Op.in]: employeeIds } },
    include: [{ model: RosterWeek, as: 'week', where: { saturdayDate: { [Op.lt]: beforeSaturday } }, attributes: ['saturdayDate'] }],
    attributes: ['employeeId', 'finalStatus', 'isPublished'],
    order: [[{ model: RosterWeek, as: 'week' }, 'saturdayDate', 'DESC']],
  });
  const map = new Map();
  for (const r of rows) {
    if (isFifthSaturday(r.week.saturdayDate)) continue;
    if (!map.has(r.employeeId)) {
      map.set(r.employeeId, { finalStatus: r.finalStatus, saturdayDate: r.week.saturdayDate });
    }
  }
  return map;
};

/**
 * Create missing entries for the caller's scope in a week.
 * Proposal: opposite of the employee's last Saturday final status (alternate),
 * defaulting to WORKING for employees with no history.
 */
const generateEntries = async (week, user) => {
  const employees = await User.findAll({
    where: scopedEmployeeWhere(user),
    attributes: ['id', 'managerId'],
  });
  if (!employees.length) return 0;

  const existing = await RosterEntry.findAll({
    where: { rosterWeekId: week.id, employeeId: { [Op.in]: employees.map((e) => e.id) } },
    attributes: ['employeeId'],
  });
  const have = new Set(existing.map((e) => e.employeeId));
  const missing = employees.filter((e) => !have.has(e.id));
  if (!missing.length) return 0;

  // Company rule: a 5th Saturday is a full-strength working day for everyone.
  const fifth = isFifthSaturday(week.saturdayDate);
  const lastMap = fifth ? new Map() : await getLastStatuses(missing.map((e) => e.id), week.saturdayDate);

  const payload = missing.map((emp) => {
    const last = lastMap.get(emp.id);
    const proposed = fifth
      ? ROSTER_STATUS.WORKING
      : last && last.finalStatus === ROSTER_STATUS.WORKING
        ? ROSTER_STATUS.OFF
        : ROSTER_STATUS.WORKING;
    return {
      rosterWeekId: week.id,
      employeeId: emp.id,
      managerId: emp.managerId || null,
      plannedStatus: proposed,
      finalStatus: proposed,
    };
  });
  await RosterEntry.bulkCreate(payload);
  return payload.length;
};

// ── Weeks ─────────────────────────────────────────────────────────────────────
const getOrCreateWeek = async (saturdayDate, user) => {
  assertRosterManager(user);
  const date = saturdayDate || nextSaturdayStr();
  if (!isSaturdayStr(date)) throw new ValidationError(`${date} is not a Saturday`);

  const [week, created] = await RosterWeek.findOrCreate({
    where: { saturdayDate: date },
    defaults: { label: weekLabel(date), createdById: user._id },
  });
  const generated = await generateEntries(week, user);
  if (created || generated > 0) {
    await createAuditLog({
      entityType: 'roster_week',
      entityId: week.id,
      action: created ? 'created' : 'updated',
      changedBy: user._id,
      newValue: { saturdayDate: date, entriesGenerated: generated },
    });
  }
  return getWeekDetail(week.id, user, {});
};

const listWeeks = async (user, query) => {
  assertRosterManager(user);
  const limit = Math.min(Number(query.limit) || 12, 52);
  const weeks = await RosterWeek.findAll({ order: [['saturdayDate', 'DESC']], limit });
  return weeks;
};

/**
 * Week detail with scoped entries + per-employee recent history + stats.
 * Admin filters: ?departmentId=&managerId=
 */
const getWeekDetail = async (weekId, user, query = {}) => {
  assertRosterManager(user);
  const week = await RosterWeek.findByPk(weekId);
  if (!week) throw new NotFoundError('Roster week');

  const employeeWhere = { isActive: true };
  if (!isRosterAdmin(user)) {
    employeeWhere.managerId = user._id;
  } else {
    if (query.departmentId) employeeWhere.departmentId = query.departmentId;
    if (query.managerId) employeeWhere.managerId = query.managerId;
  }

  const entries = await RosterEntry.findAll({
    where: { rosterWeekId: week.id },
    include: [
      {
        model: User,
        as: 'employee',
        where: employeeWhere,
        attributes: ['id', 'name', 'employeeCode', 'designation', 'managerId', 'rosterApplicable'],
        include: [
          { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
          { model: User, as: 'manager', attributes: ['id', 'name'] },
        ],
      },
      { model: User, as: 'changedBy', attributes: ['id', 'name'] },
    ],
    order: [[{ model: User, as: 'employee' }, 'name', 'ASC']],
  });

  // Recent Saturday history (last 4) per employee, one batched query
  const empIds = entries.map((e) => e.employeeId);
  const historyRows = empIds.length
    ? await RosterEntry.findAll({
        where: { employeeId: { [Op.in]: empIds }, isPublished: true },
        include: [{ model: RosterWeek, as: 'week', where: { saturdayDate: { [Op.lt]: week.saturdayDate } }, attributes: ['saturdayDate'] }],
        attributes: ['employeeId', 'finalStatus'],
        order: [[{ model: RosterWeek, as: 'week' }, 'saturdayDate', 'DESC']],
      })
    : [];
  const historyMap = {};
  for (const h of historyRows) {
    (historyMap[h.employeeId] = historyMap[h.employeeId] || []);
    if (historyMap[h.employeeId].length < 4) {
      historyMap[h.employeeId].push({ saturdayDate: h.week.saturdayDate, status: h.finalStatus });
    }
  }

  const plain = entries.map((e) => {
    const obj = e.get({ plain: true });
    obj.history = historyMap[e.employeeId] || [];
    obj.lastWorked = (historyMap[e.employeeId] || []).find((h) => h.status === ROSTER_STATUS.WORKING)?.saturdayDate || null;
    obj.lastOff = (historyMap[e.employeeId] || []).find((h) => h.status === ROSTER_STATUS.OFF)?.saturdayDate || null;
    return obj;
  });

  const stats = {
    total: plain.length,
    working: plain.filter((e) => e.finalStatus === ROSTER_STATUS.WORKING).length,
    off: plain.filter((e) => e.finalStatus === ROSTER_STATUS.OFF).length,
    published: plain.filter((e) => e.isPublished).length,
    changed: plain.filter((e) => e.isPublished && e.plannedStatus !== e.finalStatus).length,
  };

  return { week: week.get({ plain: true }), entries: plain, stats };
};

// ── Entry updates ─────────────────────────────────────────────────────────────
const assertEntryScope = async (entry, user) => {
  if (isRosterAdmin(user)) return;
  const emp = await User.findByPk(entry.employeeId, { attributes: ['id', 'managerId'] });
  const currentManager = emp && String(emp.managerId) === String(user._id);
  const snapshotManager = String(entry.managerId) === String(user._id);
  if (!currentManager && !snapshotManager) {
    throw new ForbiddenError('You can only manage roster entries of your own team');
  }
};

/**
 * Pre-publish: sets planned + final together (roster building).
 * Post-publish: "change as per company work requirement" — requires a reason,
 * emails the employee, grants a comp-off on Off→Working (cancels it on undo).
 */
const updateEntry = async (entryId, { status, reason }, user) => {
  assertRosterManager(user);
  if (!Object.values(ROSTER_STATUS).includes(status)) {
    throw new ValidationError('Status must be working or off');
  }
  const entry = await RosterEntry.findByPk(entryId, {
    include: [
      { model: RosterWeek, as: 'week' },
      { model: User, as: 'employee', attributes: ['id', 'name', 'email', 'managerId'] },
    ],
  });
  if (!entry) throw new NotFoundError('Roster entry');
  await assertEntryScope(entry, user);

  if (!entry.isPublished) {
    entry.plannedStatus = status;
    entry.finalStatus = status;
    await entry.save();
    return entry;
  }

  // Post-publish change
  if (entry.finalStatus === status) throw new ValidationError('Entry already has this status');
  if (!reason || !String(reason).trim()) {
    throw new ValidationError('A reason is required when changing a published roster');
  }
  const oldStatus = entry.finalStatus;
  entry.finalStatus = status;
  entry.changeReason = String(reason).trim();
  entry.changedById = user._id;
  entry.changedAt = new Date();
  await entry.save();

  let compOffGranted = false;
  if (oldStatus === ROSTER_STATUS.OFF && status === ROSTER_STATUS.WORKING) {
    await RosterCompOff.create({
      employeeId: entry.employeeId,
      rosterEntryId: entry.id,
      earnedDate: entry.week.saturdayDate,
      reason: `Rostered Off changed to Working — ${entry.changeReason}`,
      grantedById: user._id,
    });
    compOffGranted = true;
  } else if (oldStatus === ROSTER_STATUS.WORKING && status === ROSTER_STATUS.OFF) {
    // Undo: cancel any earned comp-off previously granted for this entry
    await RosterCompOff.update(
      { status: ROSTER_COMP_OFF_STATUS.CANCELLED },
      { where: { rosterEntryId: entry.id, status: ROSTER_COMP_OFF_STATUS.EARNED } }
    );
  }

  await createAuditLog({
    entityType: 'roster_entry',
    entityId: entry.id,
    action: 'updated',
    changedBy: user._id,
    oldValue: { finalStatus: oldStatus },
    newValue: { finalStatus: status, reason: entry.changeReason, compOffGranted },
  });

  if (entry.employee?.email) {
    sendRosterChangeEmail(
      entry.employee.email,
      entry.employee.name,
      prettyDate(entry.week.saturdayDate),
      oldStatus,
      status,
      entry.changeReason,
      compOffGranted
    ).catch(() => {});
  }
  return entry;
};

// ── Publish ───────────────────────────────────────────────────────────────────
const publishWeek = async (weekId, user) => {
  assertRosterManager(user);
  const week = await RosterWeek.findByPk(weekId);
  if (!week) throw new NotFoundError('Roster week');

  const entries = await RosterEntry.findAll({
    where: { rosterWeekId: week.id, isPublished: false },
    include: [
      {
        model: User,
        as: 'employee',
        where: scopedEmployeeWhere(user, {}),
        attributes: ['id', 'name', 'email'],
      },
    ],
  });
  if (!entries.length) return { published: 0 };

  const now = new Date();
  await RosterEntry.update(
    { isPublished: true, publishedAt: now, publishedById: user._id },
    { where: { id: { [Op.in]: entries.map((e) => e.id) } } }
  );

  await createAuditLog({
    entityType: 'roster_week',
    entityId: week.id,
    action: 'published',
    changedBy: user._id,
    newValue: { saturdayDate: week.saturdayDate, entriesPublished: entries.length },
  });

  // Fire status emails (sequential, fire-and-forget from the caller's view)
  const dateLabel = prettyDate(week.saturdayDate);
  (async () => {
    for (const e of entries) {
      if (!e.employee?.email) continue;
      try {
        await sendRosterPublishedEmail(e.employee.email, e.employee.name, dateLabel, e.finalStatus);
        await RosterEntry.update({ emailSentAt: new Date() }, { where: { id: e.id } });
      } catch (err) {
        console.error('[Roster] publish email failed:', err.message);
      }
    }
  })().catch(() => {});

  return { published: entries.length };
};

// ── Employee self-view ────────────────────────────────────────────────────────
const getMyRoster = async (user) => {
  const today = toDateStr(new Date());

  const upcoming = await RosterEntry.findOne({
    where: { employeeId: user._id, isPublished: true },
    include: [{ model: RosterWeek, as: 'week', where: { saturdayDate: { [Op.gte]: today } } }],
    order: [[{ model: RosterWeek, as: 'week' }, 'saturdayDate', 'ASC']],
  });

  const history = await RosterEntry.findAll({
    where: { employeeId: user._id, isPublished: true },
    include: [{ model: RosterWeek, as: 'week', where: { saturdayDate: { [Op.lt]: today } } }],
    order: [[{ model: RosterWeek, as: 'week' }, 'saturdayDate', 'DESC']],
    limit: 12,
  });

  const compOffs = await RosterCompOff.findAll({
    where: { employeeId: user._id },
    order: [['earnedDate', 'DESC']],
    limit: 24,
  });
  const compOffBalance = compOffs.filter((c) => c.status === ROSTER_COMP_OFF_STATUS.EARNED).length;

  const workedCount = history.filter((h) => h.finalStatus === ROSTER_STATUS.WORKING).length;

  const me = await User.findByPk(user._id, { attributes: ['rosterApplicable'] });

  return {
    rosterApplicable: me ? me.rosterApplicable !== false : true,
    upcoming,
    history,
    compOffs,
    compOffBalance,
    stats: { recentSaturdays: history.length, workedCount, offCount: history.length - workedCount },
  };
};

// ── Module dashboard ──────────────────────────────────────────────────────────
/**
 * Landing page for the Rostering module. Works for every role: everyone gets
 * their own Saturday + comp-off balance; roster managers additionally get the
 * upcoming week's team picture and anything waiting on them.
 */
const getRosterDashboard = async (user) => {
  const saturdayDate = nextSaturdayStr();
  const canManage = isRosterAdmin(user) || isTeamManager(user);

  const me = await getMyRoster(user);

  // Swaps waiting on this user: as the colleague who must accept, or — for
  // managers — as the approver once both parties have agreed.
  const swapWhere = canManage
    ? {
        [Op.or]: [
          { targetId: user._id, status: 'pending_peer' },
          { status: 'pending_manager' },
        ],
      }
    : { targetId: user._id, status: 'pending_peer' };

  let pendingSwaps = await RosterSwapRequest.count({ where: swapWhere });

  let team = null;
  if (canManage) {
    const week = await RosterWeek.findOne({ where: { saturdayDate } });
    if (week) {
      const employeeWhere = { isActive: true };
      if (!isRosterAdmin(user)) employeeWhere.managerId = user._id;
      const entries = await RosterEntry.findAll({
        where: { rosterWeekId: week.id },
        include: [{ model: User, as: 'employee', where: employeeWhere, attributes: ['id'] }],
        attributes: ['id', 'finalStatus', 'isPublished', 'plannedStatus'],
      });
      team = {
        weekId: week.id,
        label: week.label,
        total: entries.length,
        working: entries.filter((e) => e.finalStatus === ROSTER_STATUS.WORKING).length,
        off: entries.filter((e) => e.finalStatus === ROSTER_STATUS.OFF).length,
        published: entries.filter((e) => e.isPublished).length,
        unpublished: entries.filter((e) => !e.isPublished).length,
        changed: entries.filter((e) => e.isPublished && e.plannedStatus !== e.finalStatus).length,
      };
    } else {
      team = { weekId: null, label: weekLabel(saturdayDate), total: 0, working: 0, off: 0, published: 0, unpublished: 0, changed: 0 };
    }
  }

  return { saturdayDate, canManage, me, team, pendingSwaps };
};

// ── History (manager/admin view of one employee) ──────────────────────────────
const getEmployeeHistory = async (employeeId, user, query = {}) => {
  assertRosterManager(user);
  const employee = await User.findByPk(employeeId, {
    attributes: ['id', 'name', 'employeeCode', 'managerId'],
  });
  if (!employee) throw new NotFoundError('Employee');
  if (!isRosterAdmin(user) && String(employee.managerId) !== String(user._id)) {
    throw new ForbiddenError('You can only view history of your own team');
  }
  const limit = Math.min(Number(query.limit) || 12, 52);
  const entries = await RosterEntry.findAll({
    where: { employeeId, isPublished: true },
    include: [{ model: RosterWeek, as: 'week' }],
    order: [[{ model: RosterWeek, as: 'week' }, 'saturdayDate', 'DESC']],
    limit,
  });
  return { employee, entries };
};

// ── Coverage dashboard ────────────────────────────────────────────────────────
const getCoverage = async (user, query = {}) => {
  assertRosterManager(user);
  const date = query.date || nextSaturdayStr();
  const week = await RosterWeek.findOne({ where: { saturdayDate: date } });

  let entries = [];
  if (week) {
    const employeeWhere = { isActive: true };
    if (!isRosterAdmin(user)) employeeWhere.managerId = user._id;
    entries = await RosterEntry.findAll({
      where: { rosterWeekId: week.id },
      include: [
        {
          model: User,
          as: 'employee',
          where: employeeWhere,
          attributes: ['id', 'name', 'employeeCode', 'managerId'],
          include: [
            { model: Department, as: 'department', attributes: ['id', 'name'] },
            { model: User, as: 'manager', attributes: ['id', 'name'] },
          ],
        },
      ],
    });
  }

  const byDepartment = {};
  const byManager = {};
  for (const e of entries) {
    const dept = e.employee?.department?.name || 'Unassigned';
    const mgr = e.employee?.manager?.name || 'No manager';
    byDepartment[dept] = byDepartment[dept] || { working: 0, off: 0 };
    byManager[mgr] = byManager[mgr] || { working: 0, off: 0 };
    byDepartment[dept][e.finalStatus] += 1;
    byManager[mgr][e.finalStatus] += 1;
  }

  // Fairness over the last 8 published Saturdays (scoped)
  const eightWeeksAgo = new Date();
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 8 * 7);
  const fairWhere = { isActive: true, rosterApplicable: { [Op.ne]: false } };
  if (!isRosterAdmin(user)) fairWhere.managerId = user._id;
  const fairnessRows = await RosterEntry.findAll({
    where: { isPublished: true },
    include: [
      { model: RosterWeek, as: 'week', where: { saturdayDate: { [Op.gte]: toDateStr(eightWeeksAgo) } }, attributes: ['saturdayDate'] },
      { model: User, as: 'employee', where: fairWhere, attributes: ['id', 'name', 'employeeCode'] },
    ],
    attributes: ['employeeId', 'finalStatus'],
  });
  const fairness = {};
  for (const r of fairnessRows) {
    const key = r.employeeId;
    fairness[key] = fairness[key] || {
      employeeId: key,
      name: r.employee.name,
      employeeCode: r.employee.employeeCode,
      worked: 0,
      off: 0,
    };
    if (r.finalStatus === ROSTER_STATUS.WORKING) fairness[key].worked += 1;
    else fairness[key].off += 1;
  }

  return {
    saturdayDate: date,
    week: week ? week.get({ plain: true }) : null,
    stats: {
      total: entries.length,
      working: entries.filter((e) => e.finalStatus === ROSTER_STATUS.WORKING).length,
      off: entries.filter((e) => e.finalStatus === ROSTER_STATUS.OFF).length,
      published: entries.filter((e) => e.isPublished).length,
    },
    byDepartment,
    byManager,
    fairness: Object.values(fairness).sort((a, b) => b.worked - a.worked),
  };
};

// ── Saturday trend matrix ─────────────────────────────────────────────────────
/**
 * Employees down the side, Saturdays across the top.
 *
 * Visible to every role by design — the roster is company-wide information and
 * transparency is what makes the alternation auditable.
 *
 * query: { range: 'recent'|'fy', financialYear?, departmentId?, managerId? }
 */
const getTrend = async (user, query = {}) => {
  const range = query.range === 'fy' ? 'fy' : 'recent';
  const financialYear = query.financialYear || currentFinancialYear();
  const dates = range === 'fy' ? financialYearSaturdays(financialYear) : lastNSaturdays(12);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const employeeWhere = { isActive: true, rosterApplicable: { [Op.ne]: false } };
  if (query.departmentId) employeeWhere.departmentId = query.departmentId;
  if (query.managerId) employeeWhere.managerId = query.managerId;

  const [employees, weeks] = await Promise.all([
    User.findAll({
      where: employeeWhere,
      attributes: ['id', 'name', 'employeeCode', 'designation', 'managerId'],
      include: [
        { model: Department, as: 'department', attributes: ['id', 'name'] },
        { model: User, as: 'manager', attributes: ['id', 'name'] },
      ],
      order: [['name', 'ASC']],
    }),
    RosterWeek.findAll({
      where: { saturdayDate: { [Op.between]: [from, to] } },
      attributes: ['id', 'saturdayDate'],
    }),
  ]);

  const weekByDate = new Map(weeks.map((w) => [String(w.saturdayDate).slice(0, 10), w]));

  const entries = weeks.length
    ? await RosterEntry.findAll({
        where: { rosterWeekId: { [Op.in]: weeks.map((w) => w.id) } },
        attributes: ['rosterWeekId', 'employeeId', 'plannedStatus', 'finalStatus', 'isPublished', 'changeReason'],
      })
    : [];

  // rosterWeekId -> employeeId -> entry
  const byWeek = new Map();
  for (const e of entries) {
    if (!byWeek.has(e.rosterWeekId)) byWeek.set(e.rosterWeekId, new Map());
    byWeek.get(e.rosterWeekId).set(e.employeeId, e);
  }

  const columns = dates.map((date) => {
    const week = weekByDate.get(date);
    const cells = week ? byWeek.get(week.id) : null;
    const values = cells ? [...cells.values()] : [];
    return {
      date,
      label: weekLabel(date),
      isFifthSaturday: isFifthSaturday(date),
      exists: !!week,
      weekId: week ? week.id : null,
      // A column counts as draft while nothing in it has been published yet
      isDraft: values.length > 0 && values.every((e) => !e.isPublished),
      workingCount: values.filter((e) => e.finalStatus === ROSTER_STATUS.WORKING).length,
      offCount: values.filter((e) => e.finalStatus === ROSTER_STATUS.OFF).length,
    };
  });

  const rows = employees.map((emp) => {
    const cells = dates.map((date) => {
      const week = weekByDate.get(date);
      const entry = week ? byWeek.get(week.id)?.get(emp.id) : null;
      if (!entry) return { date, status: null };            // no roster entry at all
      return {
        date,
        status: entry.finalStatus,
        changed: entry.isPublished && entry.plannedStatus !== entry.finalStatus,
        changeReason: entry.changeReason || null,
        published: entry.isPublished,
      };
    });

    const worked = cells.filter((c) => c.status === ROSTER_STATUS.WORKING).length;
    const off = cells.filter((c) => c.status === ROSTER_STATUS.OFF).length;

    // Alternation health: adjacent Saturdays with the same status. 5th Saturdays
    // and empty cells are skipped — neither is a genuine break of the pattern.
    const sequence = cells.filter((c) => c.status && !isFifthSaturday(c.date));
    let breaks = 0;
    for (let i = 1; i < sequence.length; i += 1) {
      if (sequence[i].status === sequence[i - 1].status) breaks += 1;
    }

    return {
      employee: {
        _id: emp.id,
        name: emp.name,
        employeeCode: emp.employeeCode,
        designation: emp.designation,
        department: emp.department ? { _id: emp.department.id, name: emp.department.name } : null,
        manager: emp.manager ? { _id: emp.manager.id, name: emp.manager.name } : null,
      },
      cells,
      worked,
      off,
      breaks,
    };
  });

  return {
    range,
    financialYear,
    from,
    to,
    columns,
    rows,
    totals: {
      employees: rows.length,
      saturdays: columns.length,
      fifthSaturdays: columns.filter((c) => c.isFifthSaturday).length,
      imbalanced: rows.filter((r) => r.breaks > 0).length,
    },
  };
};

const exportTrendExcel = async (user, query = {}) => {
  const trend = await getTrend(user, query);
  const columns = [
    { header: 'Employee Code', key: 'code', width: 16 },
    { header: 'Resource', key: 'name', width: 28 },
    { header: 'Department', key: 'dept', width: 18 },
    { header: 'Manager', key: 'manager', width: 22 },
    ...trend.columns.map((c) => ({
      header: `${new Date(`${c.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}${c.isFifthSaturday ? ' (5th)' : ''}`,
      key: c.date,
      width: 12,
    })),
    { header: 'Worked', key: 'worked', width: 10 },
    { header: 'Off', key: 'off', width: 10 },
    { header: 'Alternation Breaks', key: 'breaks', width: 18 },
  ];

  const rows = trend.rows.map((r) => {
    const row = {
      code: r.employee.employeeCode || '',
      name: r.employee.name,
      dept: r.employee.department?.name || '',
      manager: r.employee.manager?.name || '',
      worked: r.worked,
      off: r.off,
      breaks: r.breaks,
    };
    for (const c of r.cells) {
      row[c.date] = c.status === ROSTER_STATUS.WORKING ? 'Working' : c.status === ROSTER_STATUS.OFF ? 'Off' : '';
    }
    return row;
  });

  // Coverage footer
  rows.push({
    code: '',
    name: 'WORKING HEADCOUNT',
    dept: '',
    manager: '',
    ...Object.fromEntries(trend.columns.map((c) => [c.date, c.exists ? c.workingCount : ''])),
    worked: '',
    off: '',
    breaks: '',
  });

  const buffer = await generateExcel(`Saturday Trend ${trend.from} to ${trend.to}`, columns, rows);
  return { buffer, filename: `saturday-trend-${trend.from}-to-${trend.to}.xlsx` };
};

// ── Excel export ──────────────────────────────────────────────────────────────
const exportWeekExcel = async (weekId, user) => {
  const { week, entries } = await getWeekDetail(weekId, user, {});
  const columns = [
    { header: 'Employee Code', key: 'code', width: 16 },
    { header: 'Resource', key: 'name', width: 28 },
    { header: 'Department', key: 'dept', width: 18 },
    { header: 'Manager', key: 'manager', width: 24 },
    { header: `${week.label} Planned`, key: 'planned', width: 20 },
    { header: 'Final (as per work requirement)', key: 'final', width: 26 },
    { header: 'Change Reason', key: 'reason', width: 36 },
    { header: 'Published', key: 'published', width: 12 },
  ];
  const cap = (s) => (s === ROSTER_STATUS.WORKING ? 'Working' : 'Off');
  const rows = entries.map((e) => ({
    code: e.employee?.employeeCode || '',
    name: e.employee?.name || '',
    dept: e.employee?.department?.name || '',
    manager: e.employee?.manager?.name || '',
    planned: cap(e.plannedStatus),
    final: cap(e.finalStatus),
    reason: e.changeReason || '',
    published: e.isPublished ? 'Yes' : 'No',
  }));
  const buffer = await generateExcel(`Saturday Roster ${week.saturdayDate}`, columns, rows);
  return { buffer, filename: `saturday-roster-${week.saturdayDate}.xlsx` };
};

module.exports = {
  // helpers reused by swap/comp-off services and the cron job
  isRosterAdmin,
  isTeamManager,
  assertRosterManager,
  nextSaturdayStr,
  prettyDate,
  weekLabel,
  isFifthSaturday,
  currentFinancialYear,
  // API surface
  getOrCreateWeek,
  listWeeks,
  getWeekDetail,
  updateEntry,
  publishWeek,
  getMyRoster,
  getRosterDashboard,
  getEmployeeHistory,
  getCoverage,
  getTrend,
  exportTrendExcel,
  exportWeekExcel,
};
