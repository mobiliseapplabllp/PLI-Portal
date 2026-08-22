/**
 * Saturday Rostering scheduled work — all IST, all driven by roster_settings
 * rather than hardcoded times:
 *   1. Weekly digest    — every employee gets their upcoming-Saturday status,
 *                         every manager gets their team's table
 *   2. Working reminder — to those rostered WORKING for tomorrow
 *   3. Auto-create      — keeps the next N Saturdays drafted so managers arrive
 *                         to a pre-filled roster (daily, 06:00 IST)
 *
 * Idempotency: per-entry digestSentAt / reminderSentAt stamps, so a re-run on
 * the same day (or a late publish) never double-sends.
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const { RosterWeek, RosterEntry } = require('../models/associations');
const User = require('../models/User');
const {
  sendRosterDigestEmail,
  sendRosterManagerDigestEmail,
  sendRosterReminderEmail,
} = require('../utils/emailService');
const { ROSTER_STATUS } = require('../config/constants');

// Local-timezone date string — toISOString() would report yesterday for any run
// between 00:00 and 05:30 IST and mail the wrong Saturday.
const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const nextSaturdayStr = (from = new Date()) => {
  const d = new Date(from);
  const delta = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
};

const prettyDate = (dateStr) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

const loadPublishedEntries = async (saturdayDate, extraWhere = {}) => {
  const week = await RosterWeek.findOne({ where: { saturdayDate } });
  if (!week) return { week: null, entries: [] };
  const entries = await RosterEntry.findAll({
    where: { rosterWeekId: week.id, isPublished: true, ...extraWhere },
    include: [
      {
        model: User,
        as: 'employee',
        where: { isActive: true },
        attributes: ['id', 'name', 'employeeCode', 'email', 'managerId'],
      },
    ],
  });
  return { week, entries };
};

const runWeeklyDigest = async () => {
  const settings = await require('../services/roster/rosterSettings.service').getSettings();
  if (!settings.digestEnabled) { console.log('[Roster] digest disabled in settings — skipping'); return; }

  const saturday = nextSaturdayStr();
  const dateLabel = prettyDate(saturday);
  const { week, entries } = await loadPublishedEntries(saturday, { digestSentAt: null });
  if (!week) { console.log(`[Roster] Digest: no roster week for ${saturday} — skipping`); return; }

  let sent = 0;
  for (const e of entries) {
    if (!e.employee?.email) continue;
    try {
      await sendRosterDigestEmail(e.employee.email, e.employee.name, dateLabel, e.finalStatus);
      await RosterEntry.update({ digestSentAt: new Date() }, { where: { id: e.id } });
      sent += 1;
    } catch (err) {
      console.error('[Roster] digest email failed:', err.message);
    }
  }

  // Manager digests use ALL published entries so the table is complete
  const { entries: allPublished } = await loadPublishedEntries(saturday);
  const byManager = new Map();
  for (const e of allPublished) {
    const mgrId = e.employee?.managerId;
    if (!mgrId) continue;
    if (!byManager.has(mgrId)) byManager.set(mgrId, []);
    byManager.get(mgrId).push({
      name: e.employee.name,
      employeeCode: e.employee.employeeCode,
      status: e.finalStatus,
    });
  }
  if (byManager.size && sent > 0) {
    const managers = await User.findAll({
      where: { id: { [Op.in]: [...byManager.keys()] }, isActive: true },
      attributes: ['id', 'name', 'email'],
    });
    for (const m of managers) {
      if (!m.email) continue;
      const rows = byManager.get(m.id).sort((a, b) => a.name.localeCompare(b.name));
      try {
        await sendRosterManagerDigestEmail(m.email, m.name, dateLabel, rows);
      } catch (err) {
        console.error('[Roster] manager digest failed:', err.message);
      }
    }
  }
  console.log(`[Roster] Digest for ${saturday}: ${sent} employee mails, ${byManager.size} manager digests`);
};

const runReminder = async () => {
  const settings = await require('../services/roster/rosterSettings.service').getSettings();
  if (!settings.reminderEnabled) { console.log('[Roster] reminder disabled in settings — skipping'); return; }

  const saturday = nextSaturdayStr();
  const dateLabel = prettyDate(saturday);
  const { week, entries } = await loadPublishedEntries(saturday, {
    finalStatus: ROSTER_STATUS.WORKING,
    reminderSentAt: null,
  });
  if (!week) { console.log(`[Roster] Reminder: no roster week for ${saturday} — skipping`); return; }

  let sent = 0;
  for (const e of entries) {
    if (!e.employee?.email) continue;
    try {
      await sendRosterReminderEmail(e.employee.email, e.employee.name, dateLabel);
      await RosterEntry.update({ reminderSentAt: new Date() }, { where: { id: e.id } });
      sent += 1;
    } catch (err) {
      console.error('[Roster] reminder email failed:', err.message);
    }
  }
  console.log(`[Roster] Reminder for ${saturday}: ${sent} mails`);
};

const runAutoCreate = async () => {
  try {
    const r = await require('../services/roster/roster.service').ensureUpcomingWeeks();
    if (r.created) console.log(`[Roster] auto-create: ${r.created} week(s) prepared`);
  } catch (err) {
    console.error('[Roster] auto-create failed:', err.message);
  }
};

// ── Scheduling ────────────────────────────────────────────────────────────────
let tasks = [];

const clearTasks = () => {
  tasks.forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
  tasks = [];
};

const scheduleFromSettings = async () => {
  const settings = await require('../services/roster/rosterSettings.service').getSettings();
  clearTasks();

  const [dh, dm] = String(settings.digestTime).split(':').map(Number);
  const [rh, rm] = String(settings.reminderTime).split(':').map(Number);
  const opts = { timezone: 'Asia/Kolkata' };

  const safe = (fn, label) => () => fn().catch((e) => console.error(`[Roster] ${label} failed:`, e.message));

  tasks.push(cron.schedule(`${dm} ${dh} * * ${settings.digestDay}`, safe(runWeeklyDigest, 'digest'), opts));
  tasks.push(cron.schedule(`${rm} ${rh} * * ${settings.reminderDay}`, safe(runReminder, 'reminder'), opts));
  // Daily at 06:00 IST — keeps upcoming Saturdays drafted
  tasks.push(cron.schedule('0 6 * * *', safe(runAutoCreate, 'auto-create'), opts));

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  console.log(
    `[Roster] scheduled — digest ${days[settings.digestDay]} ${settings.digestTime} IST` +
    ` (${settings.digestEnabled ? 'on' : 'off'}), reminder ${days[settings.reminderDay]} ${settings.reminderTime} IST` +
    ` (${settings.reminderEnabled ? 'on' : 'off'}), auto-create daily 06:00` +
    ` (${settings.autoCreateEnabled ? `${settings.autoCreateWeeksAhead} weeks ahead` : 'off'})`
  );
};

const startRosterMailerJob = () => {
  scheduleFromSettings().catch((err) => console.error('[Roster] scheduling failed:', err.message));
};

/** Called when an admin saves roster settings, so changes take effect at once. */
const rescheduleRosterJobs = async () => scheduleFromSettings();

module.exports = { startRosterMailerJob, rescheduleRosterJobs, runWeeklyDigest, runReminder, runAutoCreate };
