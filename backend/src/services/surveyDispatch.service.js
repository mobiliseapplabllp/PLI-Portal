const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/database');
const Survey = require('../models/csat/Survey');
const SurveyQuestion = require('../models/csat/SurveyQuestion');
const ClientOrganisation = require('../models/csat/ClientOrganisation');
const SurveyDispatch = require('../models/csat/SurveyDispatch');
const SurveyRecipient = require('../models/csat/SurveyRecipient');
const SurveyResponse = require('../models/csat/SurveyResponse');
const ClientEmployee = require('../models/csat/ClientEmployee');
const { sendCsatSurveyEmail } = require('../utils/emailService');
const { NotFoundError, ConflictError, ForbiddenError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');
const { AUDIT_ACTIONS, NOTIFICATION_TYPES } = require('../config/constants');
const notificationService = require('./notification.service');

const CSAT_ROLES_CAN_VIEW = ['admin', 'manager', 'senior_manager', 'hr_admin', 'final_approver'];

// ── Auth helper ───────────────────────────────────────────────────────────────
function _assertAccess(dispatch, user) {
  if (user.role === 'admin') return;
  if (dispatch.sentById !== user._id) throw new ForbiddenError('Access denied to this dispatch');
}

// ── Create dispatch (all 3 modes) ────────────────────────────────────────────
const createDispatch = async (data, userId) => {
  const {
    surveyId, clientOrganisationId, employeeIds, emailSubject,
    dispatchMode = 'instant', scheduledAt, recurrencePattern, recurrenceEndAt,
    expiresAt, reminderDays,
  } = data;

  // Validate survey is published
  const survey = await Survey.findByPk(surveyId, { include: [{ model: SurveyQuestion, as: 'questions' }] });
  if (!survey) throw new NotFoundError('Survey');
  if (survey.status !== 'published') throw new ConflictError('Only published surveys can be dispatched');
  if (!survey.questions || survey.questions.length === 0) throw new ConflictError('Survey has no questions');

  // Validate employees belong to the org
  if (!employeeIds || employeeIds.length === 0) throw new ConflictError('Select at least one recipient');
  const employees = await ClientEmployee.findAll({
    where: { id: { [Op.in]: employeeIds }, clientOrganisationId, isActive: true },
  });
  if (employees.length !== employeeIds.length) {
    throw new ConflictError('Some employees do not belong to this organisation or are inactive');
  }

  // Validate scheduled/recurring requirements
  if (dispatchMode === 'scheduled' && !scheduledAt) {
    throw new ConflictError('scheduledAt is required for scheduled dispatch');
  }
  if (dispatchMode === 'recurring' && !recurrencePattern) {
    throw new ConflictError('recurrencePattern is required for recurring dispatch');
  }
  if (dispatchMode === 'recurring' && !scheduledAt) {
    throw new ConflictError('scheduledAt (first fire date) is required for recurring dispatch');
  }

  const isInstant = dispatchMode === 'instant';
  const now = new Date();

  // Admin dispatches skip approval; Manager/Senior Manager require approval
  const { role } = await require('./user.service').getUserById(userId).catch(() => ({ role: 'manager' }));
  const approvalStatus = role === 'admin' ? 'not_required' : 'pending_approval';

  const t = await sequelize.transaction();
  try {
    const dispatch = await SurveyDispatch.create({
      id: uuidv4(),
      surveyId,
      clientOrganisationId,
      employeeIds,         // JSON snapshot used by cron for future child dispatches
      emailSubject,
      dispatchMode,
      approvalStatus,
      // instant fires now only for admin; non-admin waits for approval
      status: (isInstant && approvalStatus === 'not_required') ? 'active' : 'pending',
      sentAt: (isInstant && approvalStatus === 'not_required') ? now : null,
      sentById: userId,
      totalRecipients: isInstant ? employees.length : 0,
      scheduledAt: isInstant ? null : scheduledAt,
      recurrencePattern: recurrencePattern || null,
      recurrenceEndAt: recurrenceEndAt || null,
      nextDispatchAt: null,  // set by cron after first fire
      expiresAt: expiresAt || null,
      reminderDays: reminderDays || null,
    }, { transaction: t });

    let recipientRows = [];
    if (isInstant && approvalStatus === 'not_required') {
      recipientRows = employees.map((emp) => ({
        id: uuidv4(),
        surveyDispatchId: dispatch.id,
        clientEmployeeId: emp.id,
        token: uuidv4(),
        status: 'sent',
      }));
      await SurveyRecipient.bulkCreate(recipientRows, { transaction: t });
    }
    // For scheduled/recurring OR pending_approval: NO recipients yet

    await t.commit();

    if (isInstant && approvalStatus === 'not_required') {
      _fireEmailsAsync(dispatch, recipientRows, employees, survey);
    }

    await createAuditLog({
      entityType: 'survey_dispatch', entityId: dispatch.id,
      action: AUDIT_ACTIONS.DISPATCH_CREATED, changedBy: userId,
      newValue: { surveyId, clientOrganisationId, totalRecipients: employees.length, mode: dispatchMode },
    });

    return dispatch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

// ── Fire emails (non-blocking, per-recipient error tracking) ──────────────────
async function _fireEmailsAsync(dispatch, recipientRows, employees, survey) {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));

  for (const row of recipientRows) {
    const emp = empMap[row.clientEmployeeId];
    if (!emp) continue;
    const surveyLink = `${baseUrl}/survey/${row.token}`;
    try {
      await sendCsatSurveyEmail(emp.email, emp.name, survey.name, surveyLink, dispatch.emailSubject, dispatch.expiresAt);
      await SurveyRecipient.update(
        { emailSentAt: new Date(), emailError: null },
        { where: { id: row.id } }
      );
    } catch (err) {
      await SurveyRecipient.update(
        { emailError: err.message },
        { where: { id: row.id } }
      );
    }
  }
}

// ── List dispatches ───────────────────────────────────────────────────────────
const listDispatches = async (query, user) => {
  const { page = 1, limit = 20, status } = query;
  const where = { parentDispatchId: null };
  if (status) where.status = status;
  if (!['admin'].includes(user.role)) where.sentById = user._id;

  const total = await SurveyDispatch.count({ where });
  const dispatches = await SurveyDispatch.findAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * limit,
    limit: Number(limit),
    include: [
      { model: Survey, as: 'survey', attributes: ['id', 'name'] },
    ],
  });

  return { dispatches, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } };
};

// ── Get dispatch detail with stats ───────────────────────────────────────────
const getDispatchDetail = async (id, user) => {
  const dispatch = await SurveyDispatch.findByPk(id, {
    include: [
      { model: Survey, as: 'survey', attributes: ['id', 'name', 'description'] },
      { model: ClientOrganisation, as: 'clientOrganisation', attributes: ['id', 'name'] },
    ],
  });
  if (!dispatch) throw new NotFoundError('Dispatch');
  _assertAccess(dispatch, user);

  const recipients = await SurveyRecipient.findAll({
    where: { surveyDispatchId: id },
    include: [{ model: ClientEmployee, as: 'employee', attributes: ['id', 'name', 'email'] }],
  });

  const sent = recipients.length;
  const opened = recipients.filter((r) => r.status === 'opened' || r.status === 'submitted').length;
  const submitted = recipients.filter((r) => r.status === 'submitted').length;
  const emailFailed = recipients.filter((r) => !r.emailSentAt && r.emailError).length;

  return {
    ...dispatch.toJSON(),
    stats: {
      sent, opened, submitted,
      responseRate: sent > 0 ? Math.round((submitted / sent) * 100) : 0,
      emailFailed,
    },
    recipients,
  };
};

// ── Close dispatch ────────────────────────────────────────────────────────────
const closeDispatch = async (id, user) => {
  const dispatch = await SurveyDispatch.findByPk(id);
  if (!dispatch) throw new NotFoundError('Dispatch');
  _assertAccess(dispatch, user);

  dispatch.status = 'closed';
  await dispatch.save();

  await createAuditLog({
    entityType: 'survey_dispatch', entityId: id,
    action: AUDIT_ACTIONS.DISPATCH_CLOSED, changedBy: user._id,
  });
};

// ── Resend email for a failed recipient ───────────────────────────────────────
const resendEmail = async (recipientId, user) => {
  const recipient = await SurveyRecipient.findByPk(recipientId, {
    include: [
      { model: ClientEmployee, as: 'employee' },
      {
        model: SurveyDispatch,
        as: 'dispatch',
        include: [{ model: Survey, as: 'survey' }],
      },
    ],
  });
  if (!recipient) throw new NotFoundError('Recipient');
  _assertAccess(recipient.dispatch, user);

  if (recipient.emailSentAt) throw new ConflictError('Email already sent successfully');

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const surveyLink = `${baseUrl}/survey/${recipient.token}`;

  await sendCsatSurveyEmail(
    recipient.employee.email,
    recipient.employee.name,
    recipient.dispatch.survey.name,
    surveyLink,
    recipient.dispatch.emailSubject,
    recipient.dispatch.expiresAt
  );

  await SurveyRecipient.update(
    { emailSentAt: new Date(), emailError: null },
    { where: { id: recipientId } }
  );

  await createAuditLog({
    entityType: 'survey_recipient', entityId: recipientId,
    action: AUDIT_ACTIONS.EMAIL_RESENT, changedBy: user._id,
  });
};

// ── Internal: called by cron for scheduled/recurring dispatches ───────────────
const fireDispatch = async (dispatch, transaction) => {
  const survey = await Survey.findByPk(dispatch.surveyId);
  if (!survey || survey.status !== 'published') return;

  const employees = await ClientEmployee.findAll({
    where: { id: { [Op.in]: dispatch.employeeIds || [] }, isActive: true },
  });
  if (!employees.length) return;

  const recipientRows = employees.map((emp) => ({
    id: uuidv4(),
    surveyDispatchId: dispatch.id,
    clientEmployeeId: emp.id,
    token: uuidv4(),
    status: 'sent',
  }));
  await SurveyRecipient.bulkCreate(recipientRows, { transaction });

  dispatch.totalRecipients = employees.length;
  dispatch.sentAt = new Date();
  dispatch.status = 'active';
  await dispatch.save({ transaction });

  // Fire emails after transaction commits
  setImmediate(() => _fireEmailsAsync(dispatch, recipientRows, employees, survey));
};

// ── Post-submit: check if all submitted → notify sender ──────────────────────
const checkAllSubmittedAndNotify = async (dispatchId) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId, {
    include: [{ model: Survey, as: 'survey', attributes: ['name'] }],
  });
  if (!dispatch || !dispatch.sentById) return;

  const [total, submitted] = await Promise.all([
    SurveyRecipient.count({ where: { surveyDispatchId: dispatchId } }),
    SurveyRecipient.count({ where: { surveyDispatchId: dispatchId, status: 'submitted' } }),
  ]);

  if (total > 0 && submitted === total) {
    await notificationService.create({
      recipient: dispatch.sentById,
      type: NOTIFICATION_TYPES.CSAT_ALL_SUBMITTED,
      title: 'All survey responses received',
      message: `All ${total} recipients have submitted "${dispatch.survey?.name}" survey.`,
      referenceType: 'survey_dispatch',
      referenceId: dispatch.id,
    });
  }
};

// ── Per-question aggregate responses ─────────────────────────────────────────
const getDispatchResponses = async (dispatchId, user) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId, {
    include: [{ model: Survey, as: 'survey', include: [{ model: SurveyQuestion, as: 'questions' }] }],
  });
  if (!dispatch) throw new NotFoundError('Dispatch');
  _assertAccess(dispatch, user);

  const recipients = await SurveyRecipient.findAll({
    where: { surveyDispatchId: dispatchId },
    include: [{ model: SurveyResponse, as: 'responses' }],
  });

  const questions = (dispatch.survey?.questions || []).sort((a, b) => a.orderIndex - b.orderIndex);
  const submittedCount = recipients.filter((r) => r.status === 'submitted').length;

  const breakdown = questions.map((q) => {
    const allAnswers = [];
    for (const r of recipients) {
      const resp = (r.responses || []).find((re) => re.surveyQuestionId === q.id);
      if (resp && resp.answer !== null && resp.answer !== undefined) {
        allAnswers.push(resp.answer);
      }
    }

    const result = {
      questionId: q.id,
      questionText: q.questionText,
      helperText: q.helperText,
      questionType: q.questionType,
      totalResponses: allAnswers.length,
    };

    if (q.questionType === 'rating') {
      const nums = allAnswers.map((a) => parseInt(a)).filter((n) => !isNaN(n));
      const threshold = Math.ceil(q.maxValue * 0.6);
      const satisfied = nums.filter((n) => n >= threshold).length;
      result.avgScore = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(2) : null;
      result.csatPercent = nums.length ? Math.round((satisfied / nums.length) * 100) : null;
      result.minValue = q.minValue;
      result.maxValue = q.maxValue;
      result.minLabel = q.minLabel;
      result.maxLabel = q.maxLabel;
      // Distribution: { "1": 2, "2": 0, "3": 5, ... }
      const dist = {};
      for (let i = q.minValue; i <= q.maxValue; i++) dist[String(i)] = 0;
      nums.forEach((n) => { if (dist[String(n)] !== undefined) dist[String(n)]++; });
      result.distribution = dist;
    } else if (['radio', 'select', 'checkbox'].includes(q.questionType)) {
      const freq = {};
      for (const ans of allAnswers) {
        let opts;
        try { opts = q.questionType === 'checkbox' ? JSON.parse(ans) : [ans]; }
        catch { opts = [ans]; }
        for (const o of opts) freq[o] = (freq[o] || 0) + 1;
      }
      result.optionFrequency = freq;
    } else {
      result.textAnswers = allAnswers;
    }

    return result;
  });

  return {
    dispatch: { id: dispatch.id, surveyName: dispatch.survey?.name, dispatchMode: dispatch.dispatchMode, sentAt: dispatch.sentAt },
    totalRecipients: recipients.length,
    submitted: submittedCount,
    responseRate: recipients.length ? Math.round((submittedCount / recipients.length) * 100) : 0,
    breakdown,
  };
};

// ── Per-recipient drill-down ──────────────────────────────────────────────────
const getRecipientResponses = async (dispatchId, recipientId, user) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId, {
    include: [{ model: Survey, as: 'survey', include: [{ model: SurveyQuestion, as: 'questions' }] }],
  });
  if (!dispatch) throw new NotFoundError('Dispatch');
  _assertAccess(dispatch, user);

  const recipient = await SurveyRecipient.findOne({
    where: { id: recipientId, surveyDispatchId: dispatchId },
    include: [
      { model: ClientEmployee, as: 'employee', attributes: ['name', 'email'] },
      { model: SurveyResponse, as: 'responses' },
    ],
  });
  if (!recipient) throw new NotFoundError('Recipient');

  const questions = (dispatch.survey?.questions || []).sort((a, b) => a.orderIndex - b.orderIndex);
  const answers = questions.map((q) => {
    const resp = (recipient.responses || []).find((r) => r.surveyQuestionId === q.id);
    return {
      questionId: q.id,
      questionText: q.questionText,
      helperText: q.helperText,
      questionType: q.questionType,
      options: q.options,
      minValue: q.minValue,
      maxValue: q.maxValue,
      minLabel: q.minLabel,
      maxLabel: q.maxLabel,
      answer: resp?.answer || null,
    };
  });

  return {
    recipient: {
      id: recipient.id,
      name: recipient.employee?.name,
      email: recipient.employee?.email,
      status: recipient.status,
      submittedAt: recipient.submittedAt,
    },
    surveyName: dispatch.survey?.name,
    answers,
  };
};

// ── Excel export ──────────────────────────────────────────────────────────────
const exportDispatchExcel = async (dispatchId, user) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId, {
    include: [{ model: Survey, as: 'survey', include: [{ model: SurveyQuestion, as: 'questions' }] }],
  });
  if (!dispatch) throw new NotFoundError('Dispatch');
  _assertAccess(dispatch, user);

  const recipients = await SurveyRecipient.findAll({
    where: { surveyDispatchId: dispatchId },
    include: [
      { model: ClientEmployee, as: 'employee', attributes: ['name', 'email'] },
      { model: SurveyResponse, as: 'responses' },
    ],
  });

  const questions = (dispatch.survey?.questions || []).sort((a, b) => a.orderIndex - b.orderIndex);
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();

  // Sheet 1 — Raw responses
  const ws1 = wb.addWorksheet('Responses');
  ws1.columns = [
    { header: 'Recipient Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Question', key: 'question', width: 45 },
    { header: 'Answer', key: 'answer', width: 35 },
    { header: 'Submitted At', key: 'submittedAt', width: 22 },
  ];
  ws1.getRow(1).font = { bold: true };

  for (const r of recipients.filter((r) => r.status === 'submitted')) {
    for (const q of questions) {
      const resp = (r.responses || []).find((re) => re.surveyQuestionId === q.id);
      let answerStr = resp?.answer || '';
      try {
        if (q.questionType === 'checkbox' && answerStr) {
          answerStr = JSON.parse(answerStr).join(', ');
        }
      } catch { /* leave raw */ }
      ws1.addRow({
        name: r.employee?.name || '',
        email: r.employee?.email || '',
        question: q.questionText,
        answer: answerStr,
        submittedAt: r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-IN') : '',
      });
    }
  }

  // Sheet 2 — Summary
  const ws2 = wb.addWorksheet('Summary');
  ws2.columns = [
    { header: 'Question', key: 'question', width: 45 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Total Responses', key: 'total', width: 18 },
    { header: 'Avg Score', key: 'avg', width: 12 },
    { header: 'CSAT %', key: 'csat', width: 10 },
    { header: 'Option Breakdown', key: 'breakdown', width: 50 },
  ];
  ws2.getRow(1).font = { bold: true };

  const submittedRecipients = recipients.filter((r) => r.status === 'submitted');
  for (const q of questions) {
    const allAnswers = submittedRecipients
      .map((r) => (r.responses || []).find((re) => re.surveyQuestionId === q.id)?.answer)
      .filter(Boolean);

    let avg = '', csat = '', breakdown = '';
    if (q.questionType === 'rating') {
      const nums = allAnswers.map((a) => parseInt(a)).filter((n) => !isNaN(n));
      if (nums.length) {
        avg = (nums.reduce((s, n) => s + n, 0) / nums.length).toFixed(2);
        const threshold = Math.ceil(q.maxValue * 0.6);
        csat = `${Math.round((nums.filter((n) => n >= threshold).length / nums.length) * 100)}%`;
      }
    } else if (['radio', 'select', 'checkbox'].includes(q.questionType)) {
      const freq = {};
      for (const ans of allAnswers) {
        let opts;
        try { opts = q.questionType === 'checkbox' ? JSON.parse(ans) : [ans]; } catch { opts = [ans]; }
        for (const o of opts) freq[o] = (freq[o] || 0) + 1;
      }
      breakdown = Object.entries(freq).map(([k, v]) => `${k}: ${v}`).join(', ');
    }

    ws2.addRow({ question: q.questionText, type: q.questionType, total: allAnswers.length, avg, csat, breakdown });
  }

  return wb;
};

// ── CSAT dashboard overview ───────────────────────────────────────────────────
const getDashboardStats = async (user) => {
  const where = {};
  if (user.role !== 'admin') where.sentById = user._id;

  const [totalDispatches, pendingScheduled] = await Promise.all([
    SurveyDispatch.count({ where: { ...where, status: { [Op.ne]: 'closed' }, parentDispatchId: null } }),
    SurveyDispatch.count({ where: { ...where, status: 'pending', parentDispatchId: null } }),
  ]);

  // Response rate and CSAT% across all active dispatches
  const activeIds = (await SurveyDispatch.findAll({
    where: { ...where, status: 'active', parentDispatchId: null },
    attributes: ['id'],
  })).map((d) => d.id);

  let totalRecipients = 0, totalSubmitted = 0, totalCsatNumerator = 0, totalCsatDenominator = 0;

  if (activeIds.length) {
    totalRecipients = await SurveyRecipient.count({ where: { surveyDispatchId: { [Op.in]: activeIds } } });
    totalSubmitted = await SurveyRecipient.count({ where: { surveyDispatchId: { [Op.in]: activeIds }, status: 'submitted' } });

    // CSAT% from all rating responses
    const ratingQuestions = await SurveyQuestion.findAll({ where: { questionType: 'rating' } });
    if (ratingQuestions.length) {
      const ratingIds = ratingQuestions.map((q) => q.id);
      const responses = await SurveyResponse.findAll({
        where: { surveyQuestionId: { [Op.in]: ratingIds } },
        include: [{
          model: SurveyRecipient,
          as: 'recipient',
          where: { surveyDispatchId: { [Op.in]: activeIds } },
          attributes: [],
        }],
      });
      for (const resp of responses) {
        const q = ratingQuestions.find((q) => q.id === resp.surveyQuestionId);
        if (!q || !resp.answer) continue;
        const val = parseInt(resp.answer);
        if (isNaN(val)) continue;
        const threshold = Math.ceil(q.maxValue * 0.6);
        totalCsatDenominator++;
        if (val >= threshold) totalCsatNumerator++;
      }
    }
  }

  return {
    totalDispatches,
    pendingScheduled,
    overallResponseRate: totalRecipients ? Math.round((totalSubmitted / totalRecipients) * 100) : 0,
    overallCsatPercent: totalCsatDenominator ? Math.round((totalCsatNumerator / totalCsatDenominator) * 100) : null,
    totalRecipients,
    totalSubmitted,
  };
};

module.exports = {
  createDispatch, listDispatches, getDispatchDetail,
  closeDispatch, resendEmail, fireDispatch, checkAllSubmittedAndNotify,
  getDispatchResponses, getRecipientResponses, exportDispatchExcel, getDashboardStats,
};
