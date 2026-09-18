const PmSettings = require('../../models/pm/PmSettings');
const PmHoliday  = require('../../models/pm/PmHoliday');
const { ValidationError } = require('../../utils/errors');

const DEFAULT_SATURDAYS = [2, 4];
const DEFAULT_EXCEPTION_APPROVER_ROLES = ['admin'];
const DEFAULT_EXCEPTION_MAX_HOURS = 12;
/** Every role users.role can hold (config/constants ROLES). */
const KNOWN_ROLES = Object.values(require('../../config/constants').ROLES);

/**
 * The pm_settings singleton. The model's getters guarantee
 * `exceptionApproverRoles` is a non-empty array and `exceptionMaxHoursPerDay`
 * a number (migration 044), so callers never re-parse them.
 */
const getSettings = async () => {
  const [settings] = await PmSettings.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1 },
  });
  return settings;
};

/** { roles: string[], maxHoursPerDay: number } — the exception policy (D2, D3). */
const getExceptionPolicy = async () => {
  const s = await getSettings();
  return {
    roles:          s.exceptionApproverRoles || [...DEFAULT_EXCEPTION_APPROVER_ROLES],
    maxHoursPerDay: Number(s.exceptionMaxHoursPerDay) || DEFAULT_EXCEPTION_MAX_HOURS,
  };
};

// ── Validators ───────────────────────────────────────────────────────────────

const validateHoursPerDay = (raw) => {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 4 || v > 12 || Math.round(v * 2) !== v * 2) {
    throw new ValidationError('workingHoursPerDay must be between 4 and 12 in steps of 0.5');
  }
  return v;
};

/** Array of unique integers 1–5; empty array allowed (no Saturdays work). Returns a sorted copy. */
const validateWorkingSaturdays = (raw) => {
  const bad = () => new ValidationError('workingSaturdays must be an array of unique integers between 1 and 5');
  if (!Array.isArray(raw)) throw bad();
  const out = raw.map((n) => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 5) throw bad();
    return n;
  });
  if (new Set(out).size !== out.length) throw bad();
  return [...out].sort((a, b) => a - b);
};

/** Non-empty array of unique known roles. Returns a de-duplicated copy. */
const validateExceptionApproverRoles = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('exceptionApproverRoles must be a non-empty array of roles');
  }
  const out = [];
  for (const r of raw) {
    if (typeof r !== 'string' || !KNOWN_ROLES.includes(r)) {
      throw new ValidationError(`exceptionApproverRoles: unknown role "${r}" (known: ${KNOWN_ROLES.join(', ')})`);
    }
    if (!out.includes(r)) out.push(r);
  }
  return out;
};

/** 8–24 in 0.5 steps. */
const validateExceptionMaxHours = (raw) => {
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 8 || v > 24 || Math.round(v * 2) !== v * 2) {
    throw new ValidationError('exceptionMaxHoursPerDay must be between 8 and 24 in steps of 0.5');
  }
  return v;
};

const parseSaturdays = (v) => {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (Array.isArray(p)) return p.map(Number); } catch (_) { /* fallthrough */ } }
  return [...DEFAULT_SATURDAYS];
};

// ── Calendar ─────────────────────────────────────────────────────────────────

/**
 * The working calendar consumed by the capacity engine:
 *   { hoursPerDay, workingSaturdays: [1..5], holidays: Set<'YYYY-MM-DD'> }
 * Only NON-optional holidays are included — optional ones never reduce capacity.
 * Load once per request and pass it down; never per member.
 */
const getCalendar = async () => {
  const settings = await getSettings();
  const rows = await PmHoliday.findAll({ where: { isOptional: false }, attributes: ['date'] });
  return {
    hoursPerDay:      Number(settings.workingHoursPerDay) || 8,
    workingSaturdays: parseSaturdays(settings.workingSaturdays),
    holidays:         new Set(rows.map((r) => String(r.date).slice(0, 10))),
  };
};

/**
 * Capacity per person per working day (pm_settings.workingHoursPerDay).
 * Every allocation computation must read capacity through this helper —
 * the only place 8 is allowed to appear is the fallback here.
 */
const getWorkingHoursPerDay = async () => {
  const settings = await getSettings();
  return Number(settings.workingHoursPerDay) || 8;
};

/** Validate + persist the calendar policy on the settings singleton. */
const updateCalendar = async ({ hoursPerDay, workingSaturdays } = {}) => {
  const hours = validateHoursPerDay(hoursPerDay);
  const sats  = validateWorkingSaturdays(workingSaturdays);
  const settings = await getSettings();
  settings.workingHoursPerDay = hours;
  settings.workingSaturdays   = sats;
  settings.changed('workingSaturdays', true);   // JSON column — force dirty so arrays always persist
  await settings.save();
  return { hoursPerDay: hours, workingSaturdays: sats };
};

const ALLOWED_FIELDS = [
  'allowedCreatorRoles', 'dailyReportTime', 'dailyReportEnabled', 'reportCcEmails',
  'consolidatedReport', 'emailAlertOnProjectCreate', 'emailAlertOnMilestoneComplete',
  'emailAlertOnRaidRaised', 'helpdeskDailyReportEnabled', 'helpdeskDailyReportTime',
  'workingHoursPerDay', 'workingSaturdays',
  'exceptionApproverRoles', 'exceptionMaxHoursPerDay',
];

const updateSettings = async (data) => {
  const settings = await getSettings();
  const updateData = {};
  ALLOWED_FIELDS.forEach((key) => { if (key in data) updateData[key] = data[key]; });

  if ('workingHoursPerDay' in updateData) {
    updateData.workingHoursPerDay = validateHoursPerDay(updateData.workingHoursPerDay);
  }
  if ('workingSaturdays' in updateData) {
    updateData.workingSaturdays = validateWorkingSaturdays(updateData.workingSaturdays);
  }
  if ('exceptionApproverRoles' in updateData) {
    updateData.exceptionApproverRoles = validateExceptionApproverRoles(updateData.exceptionApproverRoles);
  }
  if ('exceptionMaxHoursPerDay' in updateData) {
    updateData.exceptionMaxHoursPerDay = validateExceptionMaxHours(updateData.exceptionMaxHoursPerDay);
  }

  Object.assign(settings, updateData);
  if ('workingSaturdays' in updateData) settings.changed('workingSaturdays', true);
  if ('exceptionApproverRoles' in updateData) settings.changed('exceptionApproverRoles', true);   // JSON column
  await settings.save();
  return settings;
};

module.exports = {
  getSettings, getCalendar, getWorkingHoursPerDay, updateCalendar, updateSettings,
  getExceptionPolicy, validateExceptionApproverRoles, validateExceptionMaxHours, KNOWN_ROLES,
};
