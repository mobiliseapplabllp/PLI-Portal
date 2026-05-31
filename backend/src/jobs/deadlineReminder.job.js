const cron = require('node-cron');
const { Op } = require('sequelize');
const AppraisalCycle = require('../models/AppraisalCycle');
const KpiAssignment = require('../models/KpiAssignment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getMonthName } = require('../utils/quarterHelper');
const {
  sendCommitmentDeadlineReminderEmail,
  sendSelfReviewDeadlineReminderEmail,
  sendManagerReviewDeadlineReminderEmail,
} = require('../utils/emailService');
const { NOTIFICATION_TYPES } = require('../config/constants');

// Days before deadline to send reminders
const REMINDER_DAYS = [7, 3, 1];

function daysUntil(date) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

async function runDeadlineReminders() {
  console.log('[DeadlineReminder] Running scheduled deadline check...');
  try {
    const openCycles = await AppraisalCycle.findAll({
      where: { status: 'open' },
    });

    for (const cycle of openCycles) {
      const month = getMonthName(cycle.month);
      const year = cycle.financialYear;

      // ── Commitment deadline → employees who haven't committed yet ──────────
      if (cycle.commitmentDeadline) {
        const days = daysUntil(cycle.commitmentDeadline);
        if (REMINDER_DAYS.includes(days)) {
          const assignments = await KpiAssignment.findAll({
            where: {
              financialYear: cycle.financialYear,
              month: cycle.month,
              status: { [Op.in]: ['assigned', 'commitment_draft'] },
            },
            include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'email'] }],
          });
          const deadline = formatDate(cycle.commitmentDeadline);
          for (const a of assignments) {
            if (!a.employee) continue;
            await Promise.allSettled([
              sendCommitmentDeadlineReminderEmail(a.employee.email, a.employee.name, month, year, deadline, days),
              Notification.create({
                recipientId: a.employee.id,
                type: NOTIFICATION_TYPES.CYCLE_DEADLINE,
                title: `KPI Commitment Due in ${days} Day${days === 1 ? '' : 's'}`,
                message: `Your KPI commitment for ${month} ${year} is due by ${deadline}.`,
                referenceType: 'appraisal_cycle',
                referenceId: cycle.id,
              }),
            ]);
          }
          console.log(`[DeadlineReminder] Commitment reminders sent for ${month} ${year} (${days}d left)`);
        }
      }

      // ── Self-review deadline → employees who haven't submitted achievement ──
      if (cycle.employeeSubmissionDeadline) {
        const days = daysUntil(cycle.employeeSubmissionDeadline);
        if (REMINDER_DAYS.includes(days)) {
          const assignments = await KpiAssignment.findAll({
            where: {
              financialYear: cycle.financialYear,
              month: cycle.month,
              status: 'commitment_approved',
            },
            include: [{ model: User, as: 'employee', attributes: ['id', 'name', 'email'] }],
          });
          const deadline = formatDate(cycle.employeeSubmissionDeadline);
          for (const a of assignments) {
            if (!a.employee) continue;
            await Promise.allSettled([
              sendSelfReviewDeadlineReminderEmail(a.employee.email, a.employee.name, month, year, deadline, days),
              Notification.create({
                recipientId: a.employee.id,
                type: NOTIFICATION_TYPES.CYCLE_DEADLINE,
                title: `KPI Self-Review Due in ${days} Day${days === 1 ? '' : 's'}`,
                message: `Your KPI self-review for ${month} ${year} is due by ${deadline}.`,
                referenceType: 'appraisal_cycle',
                referenceId: cycle.id,
              }),
            ]);
          }
          console.log(`[DeadlineReminder] Self-review reminders sent for ${month} ${year} (${days}d left)`);
        }
      }

      // ── Manager review deadline → managers with pending reviews ────────────
      if (cycle.managerReviewDeadline) {
        const days = daysUntil(cycle.managerReviewDeadline);
        if (REMINDER_DAYS.includes(days)) {
          const assignments = await KpiAssignment.findAll({
            where: {
              financialYear: cycle.financialYear,
              month: cycle.month,
              status: 'employee_submitted',
            },
            include: [{ model: User, as: 'manager', attributes: ['id', 'name', 'email'] }],
          });
          // Deduplicate by manager
          const managerMap = {};
          for (const a of assignments) {
            if (a.manager && !managerMap[a.manager.id]) {
              managerMap[a.manager.id] = a.manager;
            }
          }
          const deadline = formatDate(cycle.managerReviewDeadline);
          for (const manager of Object.values(managerMap)) {
            await Promise.allSettled([
              sendManagerReviewDeadlineReminderEmail(manager.email, manager.name, month, year, deadline, days),
              Notification.create({
                recipientId: manager.id,
                type: NOTIFICATION_TYPES.CYCLE_DEADLINE,
                title: `KPI Manager Review Due in ${days} Day${days === 1 ? '' : 's'}`,
                message: `Team KPI review for ${month} ${year} is due by ${deadline}.`,
                referenceType: 'appraisal_cycle',
                referenceId: cycle.id,
              }),
            ]);
          }
          console.log(`[DeadlineReminder] Manager review reminders sent for ${month} ${year} (${days}d left)`);
        }
      }
    }
  } catch (err) {
    console.error('[DeadlineReminder] Error:', err.message);
  }
}

// Run every day at 8:00 AM
function startDeadlineReminderJob() {
  cron.schedule('0 8 * * *', runDeadlineReminders, { timezone: 'Asia/Kolkata' });
  console.log('[DeadlineReminder] Scheduled daily at 08:00 IST');
}

module.exports = { startDeadlineReminderJob };
