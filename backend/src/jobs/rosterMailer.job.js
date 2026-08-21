/**
 * Saturday Rostering mailer — two IST-pinned schedules:
 *  1. Wednesday 10:30 IST — weekly digest: every published employee gets their
 *     upcoming-Saturday status; every manager gets their team's roster table.
 *  2. Friday 10:00 IST — reminder to employees rostered WORKING for tomorrow.
 *
 * Idempotency: per-entry digestSentAt / reminderSentAt stamps — a re-run the same
 * day (or a late publish before Friday) never double-sends.
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

const nextSaturdayStr = (from = new Date()) => {
  const d = new Date(from);
  const delta = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
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
  const saturday = nextSaturdayStr();
  const dateLabel = prettyDate(saturday);
  const { week, entries } = await loadPublishedEntries(saturday, { digestSentAt: null });
  if (!week) {
    console.log(`[Roster] Digest: no roster week for ${saturday} — skipping`);
    return;
  }

  // 1. Employee digests
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

  // 2. Manager team digests — group ALL published entries (not only un-digested)
  //    by the employee's current manager so managers always get the full table.
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

const runFridayReminder = async () => {
  const saturday = nextSaturdayStr();
  const dateLabel = prettyDate(saturday);
  const { week, entries } = await loadPublishedEntries(saturday, {
    finalStatus: ROSTER_STATUS.WORKING,
    reminderSentAt: null,
  });
  if (!week) {
    console.log(`[Roster] Reminder: no roster week for ${saturday} — skipping`);
    return;
  }
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
  console.log(`[Roster] Friday reminder for ${saturday}: ${sent} mails`);
};

const startRosterMailerJob = () => {
  // Wednesday 10:30 IST — weekly digest
  cron.schedule('30 10 * * 3', () => {
    runWeeklyDigest().catch((err) => console.error('[Roster] digest run failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  // Friday 10:00 IST — working-tomorrow reminder
  cron.schedule('0 10 * * 5', () => {
    runFridayReminder().catch((err) => console.error('[Roster] reminder run failed:', err.message));
  }, { timezone: 'Asia/Kolkata' });

  console.log('[Roster] Mailer scheduled — digest Wed 10:30 IST, reminder Fri 10:00 IST');
};

module.exports = { startRosterMailerJob, runWeeklyDigest, runFridayReminder };
