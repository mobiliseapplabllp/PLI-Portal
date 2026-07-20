const sequelize = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const SurveyRecipient = require('../models/csat/SurveyRecipient');
const SurveyDispatch = require('../models/csat/SurveyDispatch');
const Survey = require('../models/csat/Survey');
const SurveyQuestion = require('../models/csat/SurveyQuestion');
const SurveyResponse = require('../models/csat/SurveyResponse');
const ClientEmployee = require('../models/csat/ClientEmployee');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { checkAllSubmittedAndNotify } = require('./surveyDispatch.service');

const getSurveyByToken = async (token) => {
  const recipient = await SurveyRecipient.findOne({
    where: { token },
    include: [
      {
        model: SurveyDispatch,
        as: 'dispatch',
        include: [
          {
            model: Survey,
            as: 'survey',
            include: [{ model: SurveyQuestion, as: 'questions', order: [['orderIndex', 'ASC']] }],
          },
        ],
      },
      { model: ClientEmployee, as: 'employee', attributes: ['name'] },
    ],
  });

  if (!recipient) throw new NotFoundError('Survey link');

  const dispatch = recipient.dispatch;
  const survey = dispatch?.survey;

  if (!dispatch || !survey) throw new NotFoundError('Survey');

  if (dispatch.status === 'closed') {
    return { closed: true, surveyName: survey.name };
  }

  const now = new Date();
  if (dispatch.expiresAt && new Date(dispatch.expiresAt) < now) {
    return { expired: true, expiresAt: dispatch.expiresAt, surveyName: survey.name };
  }

  if (recipient.status === 'submitted') {
    return {
      alreadySubmitted: true,
      thankYouMessage: survey.thankYouMessage || 'Thank you for your feedback!',
      surveyName: survey.name,
    };
  }

  // Mark as opened idempotently
  if (recipient.status === 'sent') {
    await SurveyRecipient.update(
      { status: 'opened', openedAt: now },
      { where: { id: recipient.id } }
    );
  }

  const questions = (survey.questions || [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    survey: {
      name: survey.name,
      description: survey.description,
      thankYouMessage: survey.thankYouMessage,
      expiresAt: dispatch.expiresAt,
      questions,
    },
    recipientName: recipient.employee?.name || null,
    dispatchId: dispatch.id,
    recipientId: recipient.id,
  };
};

const submitSurvey = async (token, answers) => {
  const recipient = await SurveyRecipient.findOne({
    where: { token },
    include: [{
      model: SurveyDispatch,
      as: 'dispatch',
      include: [{
        model: Survey,
        as: 'survey',
        include: [{ model: SurveyQuestion, as: 'questions' }],
      }],
    }],
  });

  if (!recipient) throw new NotFoundError('Survey link');

  const dispatch = recipient.dispatch;
  const survey = dispatch?.survey;

  if (!dispatch || !survey) throw new NotFoundError('Survey');

  if (recipient.status === 'submitted') throw new ConflictError('You have already submitted this survey');
  if (dispatch.status === 'closed') throw new ConflictError('This survey is closed');

  const now = new Date();
  if (dispatch.expiresAt && new Date(dispatch.expiresAt) < now) {
    throw new ConflictError('This survey has expired');
  }

  const questions = survey.questions || [];

  // Validate required questions answered
  for (const q of questions) {
    if (!q.isRequired) continue;
    const ans = answers[q.id];
    const empty = ans === undefined || ans === null || ans === '' ||
      (Array.isArray(ans) && ans.length === 0);
    if (empty) throw new ConflictError(`Question "${q.questionText}" is required`);
  }

  // Validate rating ranges
  for (const q of questions.filter((q) => q.questionType === 'rating')) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === '') continue;
    const val = parseInt(raw);
    if (isNaN(val) || val < q.minValue || val > q.maxValue) {
      throw new ConflictError(`Rating for "${q.questionText}" must be between ${q.minValue} and ${q.maxValue}`);
    }
  }

  const t = await sequelize.transaction();
  try {
    const responseRows = questions
      .filter((q) => answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== '')
      .map((q) => {
        let answer = answers[q.id];
        if (Array.isArray(answer)) answer = JSON.stringify(answer);
        else answer = String(answer);
        return { id: uuidv4(), surveyRecipientId: recipient.id, surveyQuestionId: q.id, answer };
      });

    if (responseRows.length > 0) {
      await SurveyResponse.bulkCreate(responseRows, { transaction: t });
    }

    await SurveyRecipient.update(
      { status: 'submitted', submittedAt: now },
      { where: { id: recipient.id }, transaction: t }
    );

    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  // Post-commit: check if all submitted and notify
  checkAllSubmittedAndNotify(dispatch.id).catch(() => {});

  return {
    success: true,
    thankYouMessage: survey.thankYouMessage || 'Thank you for your feedback!',
  };
};

module.exports = { getSurveyByToken, submitSurvey };
