const { Op } = require('sequelize');
const { RosterWeek, RosterEntry, RosterCompOff } = require('../../models/associations');
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
const isSaturdayStr = (dateStr) => new Date(`${dateStr}T00:00:00`).getDay() === 6;

const nextSaturdayStr = (from = new Date()) => {
  const d = new Date(from);
  const delta = (6 - d.getDay() + 7) % 7; // 0 when today is Saturday
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

const weekLabel = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const wkOfMonth = Math.ceil(d.getDate() / 7);
  const pretty = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `WK ${wkOfMonth} (${pretty})`;
};

const prettyDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Auto-generation ───────────────────────────────────────────────────────────
/**
 * Latest previous FINAL status per employee before the given Saturday.
 * Returns Map<employeeId, { finalStatus, saturdayDate }>.
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

  const lastMap = await getLastStatuses(missing.map((e) => e.id), week.saturdayDate);
  const payload = missing.map((emp) => {
    const last = lastMap.get(emp.id);
    const proposed =
      last && last.finalStatus === ROSTER_STATUS.WORKING ? ROSTER_STATUS.OFF : ROSTER_STATUS.WORKING;
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
  const today = new Date().toISOString().slice(0, 10);

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
      { model: RosterWeek, as: 'week', where: { saturdayDate: { [Op.gte]: eightWeeksAgo.toISOString().slice(0, 10) } }, attributes: ['saturdayDate'] },
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
  // API surface
  getOrCreateWeek,
  listWeeks,
  getWeekDetail,
  updateEntry,
  publishWeek,
  getMyRoster,
  getEmployeeHistory,
  getCoverage,
  exportWeekExcel,
};
