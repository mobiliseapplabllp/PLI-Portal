const cron = require('node-cron');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/database');
const SurveyDispatch = require('../models/csat/SurveyDispatch');
const SurveyDispatchApproval = require('../models/csat/SurveyDispatchApproval');
const SurveyRecipient = require('../models/csat/SurveyRecipient');
const ClientEmployee = require('../models/csat/ClientEmployee');
const Survey = require('../models/csat/Survey');
const User = require('../models/User');
const { sendCsatSurveyEmail, sendCsatReminderEmail, sendApprovalEscalationEmail, sendApprovalOutcomeEmail } = require('../utils/emailService');
const notificationService = require('../services/notification.service');
const { createAuditLog } = require('../middleware/auditLogger');
const { AUDIT_ACTIONS, NOTIFICATION_TYPES } = require('../config/constants');
const logger = require('../utils/logger');

// ── Date arithmetic ───────────────────────────────────────────────────────────
function calculateNext(pattern, fromDate) {
  const d = new Date(fromDate);
  if (pattern === 'weekly')    d.setDate(d.getDate() + 7);
  if (pattern === 'monthly')   d.setMonth(d.getMonth() + 1);
  if (pattern === 'quarterly') d.setMonth(d.getMonth() + 3);
  return d;
}

// ── Shared: create recipients + fire emails ───────────────────────────────────
async function _fireDispatchRow(dispatch, transaction) {
  const survey = await Survey.findByPk(dispatch.surveyId);
  if (!survey || survey.status !== 'published') {
    logger.warn(`[CSAT Cron] Skipping dispatch ${dispatch.id} — survey not published`);
    return;
  }

  const employeeIdList = Array.isArray(dispatch.employeeIds) ? dispatch.employeeIds : [];
  if (!employeeIdList.length) return;

  const employees = await ClientEmployee.findAll({
    where: { id: { [Op.in]: employeeIdList }, isActive: true },
  });
  if (!employees.length) return;

  const now = new Date();
  const recipientRows = employees.map((emp) => ({
    id: uuidv4(),
    surveyDispatchId: dispatch.id,
    clientEmployeeId: emp.id,
    token: uuidv4(),
    status: 'sent',
  }));
  await SurveyRecipient.bulkCreate(recipientRows, { transaction });

  dispatch.totalRecipients = employees.length;
  dispatch.sentAt = now;
  dispatch.status = 'active';
  await dispatch.save({ transaction });

  // Fire emails after commit
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  setImmediate(async () => {
    const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));
    for (const row of recipientRows) {
      const emp = empMap[row.clientEmployeeId];
      if (!emp) continue;
      try {
        await sendCsatSurveyEmail(
          emp.email, emp.name, survey.name,
          `${baseUrl}/survey/${row.token}`,
          dispatch.emailSubject, dispatch.expiresAt
        );
        await SurveyRecipient.update({ emailSentAt: new Date(), emailError: null }, { where: { id: row.id } });
      } catch (err) {
        await SurveyRecipient.update({ emailError: err.message }, { where: { id: row.id } });
      }
    }
  });
}

// ── Task 1: Fire pending scheduled dispatches ─────────────────────────────────
async function fireScheduledDispatches(now) {
  const due = await SurveyDispatch.findAll({
    where: {
      dispatchMode: 'scheduled',
      status: 'pending',
      scheduledAt: { [Op.lte]: now },
      approvalStatus: { [Op.in]: ['not_required', 'approved'] },  // Fix C3
    },
  });

  if (!due.length) return;
  logger.info(`[CSAT Cron] Task1: ${due.length} scheduled dispatch(es) to fire`);

  for (const dispatch of due) {
    const t = await sequelize.transaction();
    try {
      await _fireDispatchRow(dispatch, t);
      await t.commit();
    } catch (err) {
      await t.rollback();
      logger.error(`[CSAT Cron] Task1 error for dispatch ${dispatch.id}: ${err.message}`);
    }
  }
}

// ── Task 2: Process recurring dispatches ─────────────────────────────────────
async function processRecurringDispatches(now) {
  // Find parent recurring dispatches that need firing (first fire or next period)
  const due = await SurveyDispatch.findAll({
    where: {
      dispatchMode: 'recurring',
      parentDispatchId: null,
      approvalStatus: { [Op.in]: ['not_required', 'approved'] },  // Fix C3
      [Op.or]: [
        // First fire — still pending and past scheduledAt
        { status: 'pending', scheduledAt: { [Op.lte]: now } },
        // Subsequent fires — active and nextDispatchAt reached, not past recurrenceEndAt
        {
          status: 'active',
          nextDispatchAt: { [Op.lte]: now },
          [Op.or]: [
            { recurrenceEndAt: null },
            { recurrenceEndAt: { [Op.gt]: now } },
          ],
        },
      ],
    },
  });

  if (!due.length) return;
  logger.info(`[CSAT Cron] Task2: ${due.length} recurring dispatch(es) to process`);

  for (const parent of due) {
    const t = await sequelize.transaction();
    try {
      if (parent.status === 'pending') {
        // First fire — use the parent row itself as the dispatch
        await _fireDispatchRow(parent, t);
        parent.nextDispatchAt = calculateNext(parent.recurrencePattern, parent.scheduledAt);
        await parent.save({ transaction: t });
      } else {
        // Subsequent fire — create a child dispatch row with fresh tokens
        const child = await SurveyDispatch.create({
          id: uuidv4(),
          surveyId: parent.surveyId,
          clientOrganisationId: parent.clientOrganisationId,
          employeeIds: parent.employeeIds,
          emailSubject: parent.emailSubject,
          dispatchMode: 'instant',
          status: 'pending',          // _fireDispatchRow sets to 'active'
          sentAt: null,
          sentById: parent.sentById,
          totalRecipients: 0,
          parentDispatchId: parent.id,
          expiresAt: parent.expiresAt,
          reminderDays: parent.reminderDays,
        }, { transaction: t });

        await _fireDispatchRow(child, t);

        // Advance parent's next fire date
        parent.nextDispatchAt = calculateNext(parent.recurrencePattern, parent.nextDispatchAt);
        await parent.save({ transaction: t });
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      logger.error(`[CSAT Cron] Task2 error for parent ${parent.id}: ${err.message}`);
    }

    // After commit: check if recurrenceEndAt has been passed → close parent
    if (parent.recurrenceEndAt && new Date(parent.recurrenceEndAt) <= now) {
      await SurveyDispatch.update({ status: 'closed' }, { where: { id: parent.id } });
      logger.info(`[CSAT Cron] Recurring dispatch ${parent.id} closed (recurrenceEndAt reached)`);
    }
  }
}

// ── Task 3: Send reminder emails ──────────────────────────────────────────────
async function sendReminderEmails(now) {
  // Dispatches with reminderDays set, active, not expired, where reminder is due
  const dueSql = `
    SELECT id FROM survey_dispatches
    WHERE status = 'active'
      AND approvalStatus IN ('not_required', 'approved')
      AND reminderDays IS NOT NULL
      AND sentAt IS NOT NULL
      AND DATE_ADD(sentAt, INTERVAL reminderDays DAY) <= :now
      AND (expiresAt IS NULL OR expiresAt > :now)
  `;
  const [rows] = await sequelize.query(dueSql, { replacements: { now } });
  if (!rows.length) return;

  logger.info(`[CSAT Cron] Task3: ${rows.length} dispatch(es) need reminders`);

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  for (const row of rows) {
    const pendingRecipients = await SurveyRecipient.findAll({
      where: {
        surveyDispatchId: row.id,
        status: { [Op.ne]: 'submitted' },
        reminderSentAt: null,
      },
      include: [
        { model: ClientEmployee, as: 'employee', attributes: ['name', 'email'] },
        {
          model: SurveyDispatch,
          as: 'dispatch',
          include: [{ model: Survey, as: 'survey', attributes: ['name'] }],
        },
      ],
    });

    for (const recipient of pendingRecipients) {
      const emp = recipient.employee;
      const surveyName = recipient.dispatch?.survey?.name || 'Survey';
      const surveyLink = `${baseUrl}/survey/${recipient.token}`;
      try {
        await sendCsatReminderEmail(emp.email, emp.name, surveyName, surveyLink);
        await SurveyRecipient.update({ reminderSentAt: now }, { where: { id: recipient.id } });
      } catch (err) {
        logger.error(`[CSAT Cron] Task3 reminder failed for recipient ${recipient.id}: ${err.message}`);
      }
    }
  }
}

// ── Task 4: Process approval deadlines ───────────────────────────────────────
async function processApprovalDeadlines(now) {
  const pending = await SurveyDispatchApproval.findAll({
    where: {
      status: 'pending',
      approvalDeadline: { [Op.not]: null },
    },
    include: [{
      model: SurveyDispatch, as: 'dispatch',
      include: [{ model: Survey, as: 'survey', attributes: ['id', 'name'] }],
    }],
  });

  if (!pending.length) return;
  logger.info(`[CSAT Cron] Task4: ${pending.length} pending approval(s) with deadlines`);

  for (const approval of pending) {
    const msRemaining = new Date(approval.approvalDeadline).getTime() - now.getTime();

    // Breach takes precedence — if/else if
    if (msRemaining < 0) {
      const t = await sequelize.transaction();
      try {
        approval.status = 'rejected';
        approval.reviewedAt = now;
        approval.updatedAt = now;
        await approval.save({ transaction: t });
        approval.dispatch.approvalStatus = 'expired_unapproved';
        await approval.dispatch.save({ transaction: t });
        await t.commit();
      } catch (err) {
        await t.rollback().catch(() => {});
        logger.error(`[CSAT Cron] Task4 expire failed for approval ${approval.id}: ${err.message}`);
        continue;
      }

      // Notify requester inline (notifyRequesterExpired was undefined — Fix D5)
      try {
        const requester = await User.findByPk(approval.requestedById, { attributes: ['id', 'email', 'name'] });
        if (requester) {
          await notificationService.create({
            recipientId: requester.id,
            message: `Your survey dispatch request expired without approval. Please create a new request.`,
            type: NOTIFICATION_TYPES.CSAT_APPROVAL_EXPIRED,
          }).catch(err => logger.error(`[CSAT Cron] Task4 in-app notify failed: ${err.message}`));
          await sendApprovalOutcomeEmail(requester.email, {
            outcome: 'expired',
            surveyName: approval.dispatch?.survey?.name,
            approvalLink: `${process.env.FRONTEND_URL}/csat/my-requests`,
          }).catch(err => logger.error(`[CSAT Cron] Task4 expire email failed: ${err.message}`));
        }
      } catch (err) {
        logger.error(`[CSAT Cron] Task4 requester notify failed: ${err.message}`);
      }

      await createAuditLog({ entityType: 'survey_dispatch_approval', entityId: approval.id, action: AUDIT_ACTIONS.APPROVAL_EXPIRED })
        .catch(() => {});

    } else if (msRemaining <= 2 * 3600 * 1000 && !approval.escalationSentAt) {
      // 2-hour warning — only if not already sent
      const admins = await User.findAll({ where: { role: 'admin', isActive: true } });
      const requester = await User.findByPk(approval.requestedById, { attributes: ['name'] });
      for (const admin of admins) {
        await sendApprovalEscalationEmail(admin.email, {
          surveyName: approval.dispatch?.survey?.name,
          requesterName: requester?.name,
          minutesRemaining: Math.floor(msRemaining / 60_000),
          approvalLink: `${process.env.FRONTEND_URL}/csat/approval/${approval.id}`,
        }).catch(err => logger.error(`[CSAT Cron] Task4 escalation email failed: ${err.message}`));
      }
      approval.escalationSentAt = now;
      approval.updatedAt = now;
      await approval.save();
    }
  }
}

// ── Main cron entry ───────────────────────────────────────────────────────────
function startSurveyCron() {
  cron.schedule('0 * * * *', async () => {
    const now = new Date();  // Fix C1 — must be first line
    logger.info(`[CSAT Cron] Running at ${now.toISOString()}`);

    try { await fireScheduledDispatches(now); }
    catch (err) { logger.error(`[CSAT Cron] Task1 fatal: ${err.message}`); }

    try { await processRecurringDispatches(now); }
    catch (err) { logger.error(`[CSAT Cron] Task2 fatal: ${err.message}`); }

    try { await sendReminderEmails(now); }
    catch (err) { logger.error(`[CSAT Cron] Task3 fatal: ${err.message}`); }

    try { await processApprovalDeadlines(now); }
    catch (err) { logger.error(`[CSAT Cron] Task4 fatal: ${err.message}`); }
  }, { timezone: 'Asia/Kolkata' });

  logger.info('[CSAT Cron] Hourly survey cron scheduled (Asia/Kolkata)');
}

module.exports = { startSurveyCron };
