const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const sequelize = require('../config/database');
const SurveyDispatch = require('../models/csat/SurveyDispatch');
const SurveyDispatchApproval = require('../models/csat/SurveyDispatchApproval');
const SurveyDispatchApprovalFeedback = require('../models/csat/SurveyDispatchApprovalFeedback');
const SurveyQuestion = require('../models/csat/SurveyQuestion');
const Survey = require('../models/csat/Survey');
const ClientOrganisation = require('../models/csat/ClientOrganisation');
const ClientEmployee = require('../models/csat/ClientEmployee');
const User = require('../models/User');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');
const { AUDIT_ACTIONS, NOTIFICATION_TYPES } = require('../config/constants');
const notificationService = require('./notification.service');
const {
  sendApprovalRequestEmail,
  sendApprovalOutcomeEmail,
  sendApprovalEscalationEmail,
} = require('../utils/emailService');

// ── Shared helper ─────────────────────────────────────────────────────────────

function computeApprovalDeadline(dispatch) {
  if (dispatch.dispatchMode === 'instant') return null;
  const deadline = new Date(new Date(dispatch.scheduledAt).getTime() - 24 * 3600 * 1000);
  if (deadline <= new Date()) {
    console.warn(`[approval] deadline already past for dispatch ${dispatch.id} — setting null`);
    return null;
  }
  return deadline;
}

async function _notifyAdmins(message, emailPayload) {
  const admins = await User.findAll({ where: { role: 'admin', isActive: true } });
  for (const admin of admins) {
    await notificationService.create({
      recipientId: admin.id,
      message,
      type: NOTIFICATION_TYPES.CSAT_APPROVAL_SUBMITTED,
    }).catch(err => console.error('[approval] in-app notify admin failed', err));
    if (emailPayload) {
      await sendApprovalRequestEmail(admin.email, emailPayload)
        .catch(err => console.error('[approval] email admin failed', err));
    }
  }
}

// ── submitForApproval ─────────────────────────────────────────────────────────

const submitForApproval = async (dispatchId, userId) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId);
  if (!dispatch) throw new NotFoundError('Dispatch not found');
  if (String(dispatch.sentById) !== String(userId)) throw new ForbiddenError('Access denied');
  if (dispatch.approvalStatus !== 'pending_approval') {
    throw new ValidationError('Dispatch is not awaiting approval');
  }

  // Guard: no existing pending approval record
  const existing = await SurveyDispatchApproval.findOne({
    where: { surveyDispatchId: dispatchId, status: 'pending' },
  });
  if (existing) throw new ConflictError('Already submitted for approval');

  const approvalDeadline = computeApprovalDeadline(dispatch);

  const approval = await SurveyDispatchApproval.create({
    id: uuidv4(),
    surveyDispatchId: dispatchId,
    requestedById: userId,
    status: 'pending',
    submittedAt: new Date(),
    approvalDeadline,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const requester = await User.findByPk(userId, { attributes: ['id', 'name'] });
  const survey = await Survey.findByPk(dispatch.surveyId, { attributes: ['id', 'name'] });
  const org = await ClientOrganisation.findByPk(dispatch.clientOrganisationId, { attributes: ['id', 'name'] });

  await _notifyAdmins(
    `${requester?.name} submitted '${survey?.name}' for approval (${org?.name})`,
    {
      requesterName: requester?.name,
      surveyName: survey?.name,
      orgName: org?.name,
      recipientCount: dispatch.totalRecipients || (Array.isArray(dispatch.employeeIds) ? dispatch.employeeIds.length : 0),
      dispatchMode: dispatch.dispatchMode,
      scheduledAt: dispatch.scheduledAt,
      approvalDeadline,
      version: 1,
      approvalLink: `${process.env.FRONTEND_URL}/csat/approval/${approval.id}`,
    }
  );

  await createAuditLog({
    entityType: 'survey_dispatch_approval', entityId: approval.id,
    action: AUDIT_ACTIONS.APPROVAL_SUBMITTED, changedBy: userId,
    newValue: { dispatchId, version: 1 },
  });

  return approval;
};

// ── reviseDispatch ────────────────────────────────────────────────────────────

const reviseDispatch = async (dispatchId, data, userId) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId);
  if (!dispatch) throw new NotFoundError('Dispatch not found');
  if (String(dispatch.sentById) !== String(userId)) throw new ForbiddenError('Access denied');
  if (dispatch.approvalStatus !== 'changes_requested') {
    throw new ValidationError('Dispatch is not in changes_requested state');
  }

  // Build changeSummary diff
  const changeSummary = {};
  const tracked = ['scheduledAt', 'recurrencePattern', 'recurrenceEndAt', 'expiresAt', 'reminderDays', 'emailSubject', 'employeeIds'];
  for (const key of tracked) {
    if (data[key] !== undefined && JSON.stringify(dispatch[key]) !== JSON.stringify(data[key])) {
      changeSummary[key] = { from: dispatch[key], to: data[key] };
    }
  }

  await dispatch.update({
    ...Object.fromEntries(tracked.filter(k => data[k] !== undefined).map(k => [k, data[k]])),
    tempChangeSummary: JSON.stringify(changeSummary),
  });

  await createAuditLog({
    entityType: 'survey_dispatch', entityId: dispatchId,
    action: AUDIT_ACTIONS.DISPATCH_REVISED, changedBy: userId,
    newValue: changeSummary,
  });

  return dispatch;
};

// ── resubmitForApproval ───────────────────────────────────────────────────────

const resubmitForApproval = async (dispatchId, userId) => {
  const dispatch = await SurveyDispatch.findByPk(dispatchId);
  if (!dispatch) throw new NotFoundError('Dispatch not found');
  if (String(dispatch.sentById) !== String(userId)) throw new ForbiddenError('Access denied');
  if (dispatch.approvalStatus !== 'changes_requested') {
    throw new ValidationError('Dispatch is not in changes_requested state');
  }

  const latestApproval = await SurveyDispatchApproval.findOne({
    where: { surveyDispatchId: dispatchId },
    order: [['version', 'DESC']],
  });
  if (!latestApproval) throw new NotFoundError('No approval record found');

  const changeSummary = dispatch.tempChangeSummary
    ? JSON.parse(dispatch.tempChangeSummary)
    : {};

  const newVersion = latestApproval.version + 1;
  const approval = await SurveyDispatchApproval.create({
    id: uuidv4(),
    surveyDispatchId: dispatchId,
    requestedById: userId,
    status: 'pending',
    submittedAt: new Date(),
    approvalDeadline: computeApprovalDeadline(dispatch),
    version: newVersion,
    changeSummary,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await dispatch.update({ approvalStatus: 'pending_approval', tempChangeSummary: null });

  const requester = await User.findByPk(userId, { attributes: ['id', 'name'] });
  const survey = await Survey.findByPk(dispatch.surveyId, { attributes: ['id', 'name'] });
  const org = await ClientOrganisation.findByPk(dispatch.clientOrganisationId, { attributes: ['id', 'name'] });

  await _notifyAdmins(
    `${requester?.name} resubmitted '${survey?.name}' (v${newVersion}) with changes`,
    {
      requesterName: requester?.name,
      surveyName: survey?.name,
      orgName: org?.name,
      version: newVersion,
      approvalLink: `${process.env.FRONTEND_URL}/csat/approval/${approval.id}`,
    }
  );

  await createAuditLog({
    entityType: 'survey_dispatch_approval', entityId: approval.id,
    action: AUDIT_ACTIONS.APPROVAL_RESUBMITTED, changedBy: userId,
    newValue: { dispatchId, version: newVersion },
  });

  return approval;
};

// ── approveDispatch ───────────────────────────────────────────────────────────

const approveDispatch = async (approvalId, adminId, { overallFeedback } = {}) => {
  const t = await sequelize.transaction();
  let approvalRecord;
  try {
    // Atomic update — race condition guard
    const [rowsUpdated] = await SurveyDispatchApproval.update(
      { status: 'approved', reviewedById: adminId, reviewedAt: new Date(), overallFeedback: overallFeedback || null, updatedAt: new Date() },
      { where: { id: approvalId, status: 'pending' }, transaction: t }
    );
    if (rowsUpdated === 0) {
      await t.rollback();
      throw new ConflictError('This request has already been reviewed');
    }

    approvalRecord = await SurveyDispatchApproval.findByPk(approvalId, {
      include: [{ model: SurveyDispatch, as: 'dispatch' }],
      transaction: t,
    });

    if (approvalRecord.dispatch.approvalStatus === 'expired_unapproved') {
      await t.rollback();
      throw new ValidationError('This dispatch request has expired and cannot be approved');
    }

    await approvalRecord.dispatch.update({ approvalStatus: 'approved' }, { transaction: t });

    // For instant mode approved by admin: fire immediately
    if (approvalRecord.dispatch.dispatchMode === 'instant') {
      const { fireDispatch } = require('./surveyDispatch.service');
      await fireDispatch(approvalRecord.dispatch, t);
    }

    await t.commit();
  } catch (err) {
    if (t && t.finished !== 'commit') await t.rollback().catch(() => {});
    throw err;
  }

  // After commit: notify requester
  await _notifyRequester(approvalRecord, 'approved', overallFeedback);

  await createAuditLog({
    entityType: 'survey_dispatch_approval', entityId: approvalId,
    action: AUDIT_ACTIONS.APPROVAL_APPROVED, changedBy: adminId,
    newValue: { overallFeedback },
  });

  return { success: true };
};

// ── requestChanges ────────────────────────────────────────────────────────────

const requestChanges = async (approvalId, adminId, { overallFeedback, questionFeedbacks = [] } = {}) => {
  const t = await sequelize.transaction();
  let approvalRecord;
  try {
    const [rowsUpdated] = await SurveyDispatchApproval.update(
      { status: 'changes_requested', reviewedById: adminId, reviewedAt: new Date(), overallFeedback: overallFeedback || null, updatedAt: new Date() },
      { where: { id: approvalId, status: 'pending' }, transaction: t }
    );
    if (rowsUpdated === 0) {
      await t.rollback();
      throw new ConflictError('This request has already been reviewed');
    }

    await SurveyDispatchApprovalFeedback.destroy({
      where: { surveyDispatchApprovalId: approvalId }, transaction: t,
    });

    if (questionFeedbacks.length) {
      await SurveyDispatchApprovalFeedback.bulkCreate(
        questionFeedbacks.map(f => ({
          id: uuidv4(),
          surveyDispatchApprovalId: approvalId,
          surveyQuestionId: f.surveyQuestionId,
          feedback: f.feedback,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        { transaction: t }
      );
    }

    approvalRecord = await SurveyDispatchApproval.findByPk(approvalId, {
      include: [{ model: SurveyDispatch, as: 'dispatch' }],
      transaction: t,
    });
    await approvalRecord.dispatch.update({ approvalStatus: 'changes_requested' }, { transaction: t });

    await t.commit();
  } catch (err) {
    if (t && t.finished !== 'commit') await t.rollback().catch(() => {});
    throw err;
  }

  await _notifyRequester(approvalRecord, 'changes_requested', overallFeedback, questionFeedbacks.length);

  await createAuditLog({
    entityType: 'survey_dispatch_approval', entityId: approvalId,
    action: AUDIT_ACTIONS.APPROVAL_CHANGES_REQUESTED, changedBy: adminId,
    newValue: { overallFeedback, questionFeedbackCount: questionFeedbacks.length },
  });

  return { success: true };
};

// ── rejectDispatch ────────────────────────────────────────────────────────────

const rejectDispatch = async (approvalId, adminId, { overallFeedback, questionFeedbacks = [] } = {}) => {
  if (!overallFeedback?.trim()) throw new ValidationError('A reason is required when rejecting');

  const t = await sequelize.transaction();
  let approvalRecord;
  try {
    const [rowsUpdated] = await SurveyDispatchApproval.update(
      { status: 'rejected', reviewedById: adminId, reviewedAt: new Date(), overallFeedback, updatedAt: new Date() },
      { where: { id: approvalId, status: 'pending' }, transaction: t }
    );
    if (rowsUpdated === 0) {
      await t.rollback();
      throw new ConflictError('This request has already been reviewed');
    }

    await SurveyDispatchApprovalFeedback.destroy({
      where: { surveyDispatchApprovalId: approvalId }, transaction: t,
    });

    if (questionFeedbacks.length) {
      await SurveyDispatchApprovalFeedback.bulkCreate(
        questionFeedbacks.map(f => ({
          id: uuidv4(),
          surveyDispatchApprovalId: approvalId,
          surveyQuestionId: f.surveyQuestionId,
          feedback: f.feedback,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
        { transaction: t }
      );
    }

    approvalRecord = await SurveyDispatchApproval.findByPk(approvalId, {
      include: [{ model: SurveyDispatch, as: 'dispatch' }],
      transaction: t,
    });
    await approvalRecord.dispatch.update({ approvalStatus: 'rejected' }, { transaction: t });

    await t.commit();
  } catch (err) {
    if (t && t.finished !== 'commit') await t.rollback().catch(() => {});
    throw err;
  }

  await _notifyRequester(approvalRecord, 'rejected', overallFeedback, questionFeedbacks.length);

  await createAuditLog({
    entityType: 'survey_dispatch_approval', entityId: approvalId,
    action: AUDIT_ACTIONS.APPROVAL_REJECTED, changedBy: adminId,
    newValue: { overallFeedback, questionFeedbackCount: questionFeedbacks.length },
  });

  return { success: true };
};

// ── Shared post-commit notifier ───────────────────────────────────────────────

async function _notifyRequester(approval, outcome, overallFeedback, questionFeedbackCount = 0) {
  try {
    const requester = await User.findByPk(approval.requestedById, { attributes: ['id', 'email', 'name'] });
    if (!requester) return;

    const typeMap = {
      approved: NOTIFICATION_TYPES.CSAT_APPROVAL_APPROVED,
      changes_requested: NOTIFICATION_TYPES.CSAT_APPROVAL_CHANGES_REQUESTED,
      rejected: NOTIFICATION_TYPES.CSAT_APPROVAL_REJECTED,
    };
    const msgMap = {
      approved: `Your survey dispatch request was approved`,
      changes_requested: `Your survey dispatch request needs changes — view feedback`,
      rejected: `Your survey dispatch request was rejected — view feedback and create a new request`,
    };

    await notificationService.create({
      recipientId: requester.id,
      message: msgMap[outcome],
      type: typeMap[outcome],
    }).catch(err => console.error('[approval] in-app notify requester failed', err));

    const dispatch = approval.dispatch || await SurveyDispatch.findByPk(approval.surveyDispatchId);
    const survey = dispatch ? await Survey.findByPk(dispatch.surveyId, { attributes: ['name'] }) : null;

    await sendApprovalOutcomeEmail(requester.email, {
      outcome,
      surveyName: survey?.name,
      overallFeedback,
      questionFeedbackCount,
      approvalLink: `${process.env.FRONTEND_URL}/csat/approval/${approval.id}`,
    }).catch(err => console.error('[approval] outcome email failed', err));
  } catch (err) {
    console.error('[approval] _notifyRequester failed', err);
  }
}

// ── listApprovals (Admin inbox) ───────────────────────────────────────────────

const listApprovals = async (query) => {
  const { status = 'pending', page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  const whereStatus = status === 'reviewed'
    ? { [Op.in]: ['approved', 'rejected', 'changes_requested'] }
    : 'pending';

  const { count, rows } = await SurveyDispatchApproval.findAndCountAll({
    where: { status: whereStatus },
    include: [
      { model: User, as: 'requestedBy', attributes: ['id', 'name', 'employeeCode'] },
      {
        model: SurveyDispatch, as: 'dispatch',
        attributes: ['id', 'dispatchMode', 'scheduledAt', 'approvalStatus', 'totalRecipients', 'employeeIds'],
        include: [
          { model: Survey, as: 'survey', attributes: ['id', 'name'] },
          { model: ClientOrganisation, as: 'clientOrganisation', attributes: ['id', 'name', 'industry'] },
        ],
      },
    ],
    order: [
      [sequelize.literal('approvalDeadline IS NULL'), 'ASC'],
      ['approvalDeadline', 'ASC'],
    ],
    offset,
    limit: Number(limit),
  });

  const now = new Date();
  const data = rows.map(a => ({
    ...a.toJSON(),
    hoursRemaining: a.approvalDeadline
      ? Math.floor((new Date(a.approvalDeadline) - now) / 3_600_000)
      : null,
  }));

  return { data, pagination: { total: count, page: Number(page), pages: Math.ceil(count / limit), limit: Number(limit) } };
};

// ── getApprovalDetail ─────────────────────────────────────────────────────────

const getApprovalDetail = async (approvalId, userId, userRole) => {
  const approval = await SurveyDispatchApproval.findByPk(approvalId, {
    include: [
      { model: User, as: 'requestedBy', attributes: ['id', 'name', 'employeeCode'] },
      { model: User, as: 'reviewedBy', attributes: ['id', 'name'] },
    ],
  });
  if (!approval) throw new NotFoundError('Approval not found');

  if (userRole !== 'admin' && approval.requestedById !== userId) {
    throw new ForbiddenError('Access denied');
  }

  const dispatch = await SurveyDispatch.findByPk(approval.surveyDispatchId);
  if (!dispatch) throw new NotFoundError('Dispatch not found');

  const survey = await Survey.findByPk(dispatch.surveyId, {
    include: [{ model: SurveyQuestion, as: 'questions', order: [['orderIndex', 'ASC']] }],
  });

  // Recipients preview (up to 50)
  const employeeIds = Array.isArray(dispatch.employeeIds) ? dispatch.employeeIds : [];
  const recipients = await ClientEmployee.findAll({
    where: { id: { [Op.in]: employeeIds } },
    attributes: ['id', 'name', 'email'],
    limit: 50,
  });

  // Latest approval record (by version DESC, regardless of status — Fix D6)
  const latestApproval = await SurveyDispatchApproval.findOne({
    where: { surveyDispatchId: dispatch.id },
    order: [['version', 'DESC']],
    include: [{
      model: SurveyDispatchApprovalFeedback, as: 'feedbacks',
    }],
  });

  const feedbackMap = {};
  for (const fb of latestApproval?.feedbacks || []) {
    feedbackMap[fb.surveyQuestionId] = fb.feedback;
  }

  const questionsWithFeedback = (survey?.questions || []).map(q => ({
    ...q.toJSON(),
    feedback: feedbackMap[q.id] || null,
  }));

  // Full approval history (all versions)
  const approvalHistory = await SurveyDispatchApproval.findAll({
    where: { surveyDispatchId: dispatch.id },
    order: [['version', 'ASC']],
    include: [
      { model: User, as: 'reviewedBy', attributes: ['id', 'name'] },
      { model: SurveyDispatchApprovalFeedback, as: 'feedbacks', separate: true },
    ],
  });

  return {
    approval: approval.toJSON(),
    dispatch: dispatch.toJSON(),
    survey: survey ? { ...survey.toJSON(), questions: questionsWithFeedback } : null,
    recipients,
    approvalHistory: approvalHistory.map(h => h.toJSON()),
  };
};

// ── getMyRequests (Manager) ───────────────────────────────────────────────────

const getMyRequests = async (userId, query) => {
  const { page = 1, limit = 20 } = query;
  const offset = (page - 1) * limit;

  // Fix D1: safe where clause — status filter never overwrites the ne guard
  const approvalStatusWhere = { [Op.ne]: 'not_required' };
  if (query.status) {
    approvalStatusWhere[Op.eq] = query.status;
  }

  const { count, rows } = await SurveyDispatch.findAndCountAll({
    where: { sentById: userId, approvalStatus: approvalStatusWhere },
    include: [
      {
        model: SurveyDispatchApproval,
        as: 'approvals',
        separate: true,
        order: [['version', 'DESC']],
        include: [{
          model: SurveyDispatchApprovalFeedback,
          as: 'feedbacks',
          separate: true,
        }],
      },
      { model: Survey, as: 'survey', attributes: ['id', 'name'] },
      { model: ClientOrganisation, as: 'clientOrganisation', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'DESC']],
    offset,
    limit: Number(limit),
  });

  return {
    data: rows.map(r => r.toJSON()),
    pagination: { total: count, page: Number(page), pages: Math.ceil(count / limit), limit: Number(limit) },
  };
};

module.exports = {
  computeApprovalDeadline,
  submitForApproval,
  reviseDispatch,
  resubmitForApproval,
  approveDispatch,
  requestChanges,
  rejectDispatch,
  listApprovals,
  getApprovalDetail,
  getMyRequests,
};
