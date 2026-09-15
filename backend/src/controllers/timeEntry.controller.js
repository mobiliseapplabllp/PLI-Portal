/**
 * Time Entry Controller — actual hours logged against a ticket, milestone or
 * project. Module-neutral: the same endpoints serve helpdesk and PM.
 *
 *   GET    /time-entries?entityType=&entityId=          list (date desc)
 *   GET    /time-entries/summary?entityType=&entityId=  totals, byUser, byDate
 *   POST   /time-entries                                 log hours (self; managers may log for others)
 *   PUT    /time-entries/:id                             owner or admin
 *   DELETE /time-entries/:id                             owner or admin
 *
 * Every 4xx uses the unified shape: { success:false, message, error:{ message } }.
 */

const { Op } = require('sequelize');
const TimeEntry = require('../models/TimeEntry');
const User      = require('../models/User');
const { sendSuccess, sendError } = require('../utils/response');

const ENTITY_TYPES = TimeEntry.ENTITY_TYPES;
/** Roles allowed to log hours on behalf of another user (POST userId). */
const CAN_SET_USER = ['admin', 'manager', 'senior_manager'];
/** Roles that may edit/delete anyone's entry. */
const ADMIN_ROLES  = ['admin'];

const MIN_HOURS = 0.25, MAX_HOURS = 24, STEP = 0.25;

const fail = (res, status, message) => sendError(res, message, status);
const callerId = (req) => String(req.user?._id ?? req.user?.id ?? '');
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Today as YYYY-MM-DD in server-local time. */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateEntityType(v) {
  if (!ENTITY_TYPES.includes(v)) return `entityType must be one of: ${ENTITY_TYPES.join(', ')}`;
  return null;
}

function validateDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return 'date must be in YYYY-MM-DD format';
  const [y, m, d] = String(v).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return 'date is not a valid calendar date';
  if (String(v) > todayIso()) return 'date cannot be in the future';
  return null;
}

function validateHours(v) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) return 'hours must be a number';
  if (n < MIN_HOURS || n > MAX_HOURS) return `hours must be between ${MIN_HOURS} and ${MAX_HOURS}`;
  if (Math.abs(Math.round(n / STEP) * STEP - n) > 1e-9) return `hours must be in steps of ${STEP}`;
  return null;
}

function validateNote(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return 'note must be a string';
  if (v.length > 500) return 'note must be 500 characters or fewer';
  return null;
}

/**
 * Does the referenced entity exist? Models are required lazily so this
 * controller never forces model load order at boot.
 */
async function entityExists(entityType, entityId) {
  const id = String(entityId ?? '').trim();
  if (!id) return false;
  if (entityType === 'ticket') {
    if (!/^\d+$/.test(id)) return false;                          // INT PK
    const { HdTicket } = require('../models/helpdesk');
    return !!(await HdTicket.findByPk(Number(id), { attributes: ['id'] }));
  }
  if (entityType === 'milestone') {
    const Milestone = require('../models/pm/Milestone');
    return !!(await Milestone.findByPk(id, { attributes: ['id'] }));
  }
  if (entityType === 'project') {
    const Project = require('../models/pm/Project');
    return !!(await Project.findByPk(id, { attributes: ['id'] }));
  }
  return false;
}

// ── Shaping ───────────────────────────────────────────────────────────────────

const shape = (e) => ({
  id: e.id,
  entityType: e.entityType,
  entityId: String(e.entityId),
  userId: String(e.userId),
  userName: e.user?.name ?? null,
  date: e.date,
  hours: round2(e.hours),
  note: e.note ?? null,
  createdById: e.createdById ? String(e.createdById) : null,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const USER_INCLUDE = { model: User, as: 'user', attributes: ['id', 'name'], required: false };

async function loadEntries(entityType, entityId) {
  return TimeEntry.findAll({
    where: { entityType, entityId: String(entityId) },
    include: [USER_INCLUDE],
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
  });
}

function requireEntityQuery(req, res) {
  const { entityType, entityId } = req.query;
  if (!entityType || !entityId) { fail(res, 400, 'entityType and entityId are required'); return null; }
  const err = validateEntityType(entityType);
  if (err) { fail(res, 400, err); return null; }
  return { entityType, entityId: String(entityId) };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

const list = async (req, res, next) => {
  try {
    const q = requireEntityQuery(req, res);
    if (!q) return;
    const rows = await loadEntries(q.entityType, q.entityId);
    return sendSuccess(res, rows.map(shape));
  } catch (e) { return next(e); }
};

const summary = async (req, res, next) => {
  try {
    const q = requireEntityQuery(req, res);
    if (!q) return;
    const rows = await loadEntries(q.entityType, q.entityId);

    const byUserMap = new Map(), byDateMap = new Map();
    let total = 0;
    for (const r of rows) {
      const h = Number(r.hours);
      total += h;
      const uid = String(r.userId);
      const u = byUserMap.get(uid) || { userId: uid, name: r.user?.name ?? null, hours: 0 };
      u.hours += h; byUserMap.set(uid, u);
      byDateMap.set(r.date, (byDateMap.get(r.date) || 0) + h);
    }
    const byUser = [...byUserMap.values()].map(u => ({ ...u, hours: round2(u.hours) })).sort((a, b) => b.hours - a.hours);
    const byDate = [...byDateMap.entries()].map(([date, hours]) => ({ date, hours: round2(hours) })).sort((a, b) => (a.date < b.date ? 1 : -1));

    return sendSuccess(res, { totalHours: round2(total), entries: rows.length, byUser, byDate });
  } catch (e) { return next(e); }
};

const create = async (req, res, next) => {
  try {
    const { entityType, entityId, date, hours, note } = req.body || {};
    let err = validateEntityType(entityType) || validateDate(date) || validateHours(hours) || validateNote(note);
    if (err) return fail(res, 400, err);
    if (entityId === undefined || entityId === null || String(entityId).trim() === '') return fail(res, 400, 'entityId is required');

    // Who the hours belong to — only management may log for someone else.
    let userId = callerId(req);
    const requested = req.body.userId != null ? String(req.body.userId) : null;
    if (requested && requested !== userId) {
      if (!CAN_SET_USER.includes(req.user.role)) return fail(res, 403, 'You can only log hours for yourself');
      const target = await User.findByPk(requested, { attributes: ['id'] });
      if (!target) return fail(res, 404, 'User not found');
      userId = requested;
    }

    if (!(await entityExists(entityType, entityId))) return fail(res, 404, `${entityType} not found`);

    const created = await TimeEntry.create({
      entityType, entityId: String(entityId).trim(), userId, date, hours: round2(hours),
      note: note ? String(note) : null, createdById: callerId(req) || null,
    });
    const row = await TimeEntry.findByPk(created.id, { include: [USER_INCLUDE] });
    return sendSuccess(res, shape(row), 'Time entry logged', 201);
  } catch (e) { return next(e); }
};

/** Owner (the user the hours belong to, or whoever logged them) or admin. */
const canManage = (req, entry) => {
  const me = callerId(req);
  return ADMIN_ROLES.includes(req.user.role) || String(entry.userId) === me || String(entry.createdById) === me;
};

const update = async (req, res, next) => {
  try {
    const entry = await TimeEntry.findByPk(req.params.id);
    if (!entry) return fail(res, 404, 'Time entry not found');
    if (!canManage(req, entry)) return fail(res, 403, 'You can only edit your own time entries');

    const b = req.body || {};
    const patch = {};
    if (b.date !== undefined)  { const e = validateDate(b.date);   if (e) return fail(res, 400, e); patch.date = b.date; }
    if (b.hours !== undefined) { const e = validateHours(b.hours); if (e) return fail(res, 400, e); patch.hours = round2(b.hours); }
    if (b.note !== undefined)  { const e = validateNote(b.note);   if (e) return fail(res, 400, e); patch.note = b.note ? String(b.note) : null; }
    // Re-pointing an entry at a different entity is allowed but must be validated as a pair.
    if (b.entityType !== undefined || b.entityId !== undefined) {
      const et = b.entityType ?? entry.entityType, ei = b.entityId ?? entry.entityId;
      const e = validateEntityType(et); if (e) return fail(res, 400, e);
      if (!(await entityExists(et, ei))) return fail(res, 404, `${et} not found`);
      patch.entityType = et; patch.entityId = String(ei).trim();
    }
    if (b.userId !== undefined && String(b.userId) !== String(entry.userId)) {
      if (!CAN_SET_USER.includes(req.user.role)) return fail(res, 403, 'You cannot reassign a time entry to another user');
      const target = await User.findByPk(String(b.userId), { attributes: ['id'] });
      if (!target) return fail(res, 404, 'User not found');
      patch.userId = String(b.userId);
    }
    if (!Object.keys(patch).length) return fail(res, 400, 'Nothing to update');

    await entry.update(patch);
    const row = await TimeEntry.findByPk(entry.id, { include: [USER_INCLUDE] });
    return sendSuccess(res, shape(row), 'Time entry updated');
  } catch (e) { return next(e); }
};

const remove = async (req, res, next) => {
  try {
    const entry = await TimeEntry.findByPk(req.params.id);
    if (!entry) return fail(res, 404, 'Time entry not found');
    if (!canManage(req, entry)) return fail(res, 403, 'You can only delete your own time entries');
    await entry.destroy();
    return sendSuccess(res, { id: entry.id }, 'Time entry deleted');
  } catch (e) { return next(e); }
};

module.exports = { list, summary, create, update, remove, CAN_SET_USER, ADMIN_ROLES, Op };
