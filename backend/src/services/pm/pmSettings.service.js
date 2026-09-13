const PmSettings = require('../../models/pm/PmSettings');
const PmHoliday  = require('../../models/pm/PmHoliday');
const { ValidationError } = require('../../utils/errors');

const DEFAULT_SATURDAYS = [2, 4];

const getSettings = async () => {
  const [settings] = await PmSettings.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1 },
  });
  return settings;
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

  Object.assign(settings, updateData);
  if ('workingSaturdays' in updateData) settings.changed('workingSaturdays', true);
  await settings.save();
  return settings;
};

module.exports = { getSettings, getCalendar, getWorkingHoursPerDay, updateCalendar, updateSettings };
