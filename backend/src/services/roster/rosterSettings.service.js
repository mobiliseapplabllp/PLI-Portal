const { Op } = require('sequelize');
const { RosterSettings, RosterHoliday, RosterLeave } = require('../../models/associations');
const User = require('../../models/User');
const { NotFoundError, ValidationError, ForbiddenError } = require('../../utils/errors');
const { createAuditLog } = require('../../middleware/auditLogger');
const { ROSTER_ADMIN_ROLES, ROSTER_TEAM_MANAGER_ROLES } = require('../../config/constants');

const canAdminister = (user) => ROSTER_ADMIN_ROLES.includes(user.role);
const canManage = (user) => canAdminister(user) || ROSTER_TEAM_MANAGER_ROLES.includes(user.role);

const assertAdmin = (user) => {
  if (!canAdminister(user)) throw new ForbiddenError('Only admin or HR can change roster settings');
};

// ── Settings ──────────────────────────────────────────────────────────────────
const getSettings = async () => {
  const [settings] = await RosterSettings.findOrCreate({ where: { id: 1 }, defaults: { id: 1 } });
  return settings;
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const updateSettings = async (data, user) => {
  assertAdmin(user);
  const settings = await getSettings();
  const before = settings.get({ plain: true });

  const patch = {};
  const bools = ['digestEnabled', 'reminderEnabled', 'fifthSaturdayWorking', 'autoCreateEnabled'];
  for (const key of bools) if (data[key] !== undefined) patch[key] = !!data[key];

  for (const key of ['digestTime', 'reminderTime']) {
    if (data[key] !== undefined) {
      if (!HHMM.test(String(data[key]))) throw new ValidationError(`${key} must be HH:MM (24-hour)`);
      patch[key] = data[key];
    }
  }

  for (const key of ['digestDay', 'reminderDay']) {
    if (data[key] !== undefined) {
      const v = Number(data[key]);
      if (!Number.isInteger(v) || v < 0 || v > 6) throw new ValidationError(`${key} must be 0 (Sunday) to 6 (Saturday)`);
      patch[key] = v;
    }
  }

  if (data.autoCreateWeeksAhead !== undefined) {
    const v = Number(data.autoCreateWeeksAhead);
    if (!Number.isInteger(v) || v < 1 || v > 12) throw new ValidationError('autoCreateWeeksAhead must be 1–12');
    patch.autoCreateWeeksAhead = v;
  }

  if (data.minCoveragePercent !== undefined) {
    const v = Number(data.minCoveragePercent);
    if (!Number.isInteger(v) || v < 0 || v > 100) throw new ValidationError('minCoveragePercent must be 0–100');
    patch.minCoveragePercent = v;
  }

  await settings.update(patch);

  await createAuditLog({
    entityType: 'roster_settings',
    entityId: String(settings.id),
    action: 'updated',
    changedBy: user._id,
    oldValue: before,
    newValue: patch,
  });

  // The mail schedule lives in cron — reschedule so a change takes effect now
  require('../../jobs/rosterMailer.job').rescheduleRosterJobs().catch(() => {});

  return settings;
};

// ── Holidays ──────────────────────────────────────────────────────────────────
const listHolidays = async (query = {}) => {
  const where = {};
  if (query.from && query.to) where.holidayDate = { [Op.between]: [query.from, query.to] };
  return RosterHoliday.findAll({
    where,
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [['holidayDate', 'ASC']],
  });
};

const createHoliday = async ({ holidayDate, name }, user) => {
  assertAdmin(user);
  if (!holidayDate || !name?.trim()) throw new ValidationError('Date and name are required');

  const existing = await RosterHoliday.findOne({ where: { holidayDate } });
  if (existing) throw new ValidationError(`A holiday already exists on ${holidayDate}: ${existing.name}`);

  const holiday = await RosterHoliday.create({ holidayDate, name: name.trim(), createdById: user._id });
  await createAuditLog({
    entityType: 'roster_holiday',
    entityId: holiday.id,
    action: 'created',
    changedBy: user._id,
    newValue: { holidayDate, name: holiday.name },
  });
  return holiday;
};

const deleteHoliday = async (id, user) => {
  assertAdmin(user);
  const holiday = await RosterHoliday.findByPk(id);
  if (!holiday) throw new NotFoundError('Holiday');
  await createAuditLog({
    entityType: 'roster_holiday',
    entityId: id,
    action: 'deleted',
    changedBy: user._id,
    oldValue: { holidayDate: holiday.holidayDate, name: holiday.name },
  });
  await holiday.destroy();
  return true;
};

/** Set of YYYY-MM-DD strings that are company holidays in the range. */
const getHolidayDates = async (from, to) => {
  const rows = await RosterHoliday.findAll({
    where: { holidayDate: { [Op.between]: [from, to] } },
    attributes: ['holidayDate', 'name'],
  });
  return new Map(rows.map((r) => [String(r.holidayDate).slice(0, 10), r.name]));
};

// ── Leave ─────────────────────────────────────────────────────────────────────
const listLeaves = async (user, query = {}) => {
  if (!canManage(user)) {
    // Employees see only their own leave
    return RosterLeave.findAll({
      where: { employeeId: user._id },
      include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode'] }],
      order: [['fromDate', 'DESC']],
      limit: 50,
    });
  }

  const where = {};
  if (query.employeeId) where.employeeId = query.employeeId;
  if (query.from && query.to) {
    // Any leave overlapping the window
    where.fromDate = { [Op.lte]: query.to };
    where.toDate = { [Op.gte]: query.from };
  }

  const include = [{ model: User, as: 'employee', attributes: ['id', 'name', 'employeeCode', 'managerId'] }];
  const rows = await RosterLeave.findAll({ where, include, order: [['fromDate', 'DESC']], limit: 500 });

  // Team managers only see their own people
  if (!canAdminister(user)) {
    return rows.filter((r) => String(r.employee?.managerId) === String(user._id));
  }
  return rows;
};

const createLeave = async ({ employeeId, fromDate, toDate, reason }, user) => {
  if (!canManage(user)) throw new ForbiddenError('Only managers, HR or admin can record leave');
  if (!employeeId || !fromDate || !toDate) throw new ValidationError('Employee, from date and to date are required');
  if (String(toDate) < String(fromDate)) throw new ValidationError('The to date cannot be before the from date');

  const employee = await User.findByPk(employeeId, { attributes: ['id', 'name', 'managerId'] });
  if (!employee) throw new NotFoundError('Employee');
  if (!canAdminister(user) && String(employee.managerId) !== String(user._id)) {
    throw new ForbiddenError('You can only record leave for your own team');
  }

  const leave = await RosterLeave.create({
    employeeId,
    fromDate,
    toDate,
    reason: reason?.trim() || null,
    createdById: user._id,
  });

  await createAuditLog({
    entityType: 'roster_leave',
    entityId: leave.id,
    action: 'created',
    changedBy: user._id,
    newValue: { employeeId, fromDate, toDate, reason: leave.reason },
  });
  return leave;
};

const deleteLeave = async (id, user) => {
  if (!canManage(user)) throw new ForbiddenError('Only managers, HR or admin can remove leave');
  const leave = await RosterLeave.findByPk(id, {
    include: [{ model: User, as: 'employee', attributes: ['id', 'managerId'] }],
  });
  if (!leave) throw new NotFoundError('Leave');
  if (!canAdminister(user) && String(leave.employee?.managerId) !== String(user._id)) {
    throw new ForbiddenError('You can only remove leave for your own team');
  }
  await createAuditLog({
    entityType: 'roster_leave',
    entityId: id,
    action: 'deleted',
    changedBy: user._id,
    oldValue: { employeeId: leave.employeeId, fromDate: leave.fromDate, toDate: leave.toDate },
  });
  await leave.destroy();
  return true;
};

/** Employee ids on leave across a given date. */
const getEmployeesOnLeave = async (date) => {
  const rows = await RosterLeave.findAll({
    where: { fromDate: { [Op.lte]: date }, toDate: { [Op.gte]: date } },
    attributes: ['employeeId', 'reason'],
  });
  return new Map(rows.map((r) => [String(r.employeeId), r.reason]));
};

module.exports = {
  canAdminister,
  canManage,
  getSettings,
  updateSettings,
  listHolidays,
  createHoliday,
  deleteHoliday,
  getHolidayDates,
  listLeaves,
  createLeave,
  deleteLeave,
  getEmployeesOnLeave,
};
