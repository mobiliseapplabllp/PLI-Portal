const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const Survey = require('../models/csat/Survey');
const SurveyQuestion = require('../models/csat/SurveyQuestion');
const SurveyDispatch = require('../models/csat/SurveyDispatch');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');
const { AUDIT_ACTIONS } = require('../config/constants');

const questionAttributes = [
  'id', 'surveyId', 'questionText', 'helperText', 'questionType',
  'options', 'minValue', 'maxValue', 'minLabel', 'maxLabel',
  'isRequired', 'orderIndex', 'createdAt',
];

// ── Surveys ───────────────────────────────────────────────────────────────────

const listSurveys = async (query = {}) => {
  const { page = 1, limit = 20, status, search } = query;
  const where = {};
  if (status) where.status = status;
  else where.status = { [Op.ne]: 'archived' };
  if (search) where.name = { [Op.like]: `%${search}%` };

  const total = await Survey.count({ where });
  const surveys = await Survey.findAll({
    where,
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * limit,
    limit: Number(limit),
  });

  return { surveys, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } };
};

const getSurveyById = async (id) => {
  const survey = await Survey.findByPk(id, {
    include: [{
      model: SurveyQuestion,
      as: 'questions',
      attributes: questionAttributes,
      order: [['orderIndex', 'ASC']],
    }],
  });
  if (!survey) throw new NotFoundError('Survey');
  return survey;
};

const createSurvey = async (data, createdBy) => {
  const { questions = [], ...surveyData } = data;

  const survey = await Survey.create({
    ...surveyData,
    id: uuidv4(),
    status: 'draft',
    createdById: createdBy,
  });

  if (questions.length > 0) {
    await _replaceQuestions(survey.id, questions);
  }

  await createAuditLog({
    entityType: 'survey', entityId: survey.id,
    action: 'created', changedBy: createdBy,
    newValue: { name: survey.name, status: 'draft' },
  });

  return getSurveyById(survey.id);
};

const updateSurvey = async (id, data, updatedBy) => {
  const survey = await Survey.findByPk(id);
  if (!survey) throw new NotFoundError('Survey');

  // Block edits if any dispatch has been sent (status=active/closed)
  if (survey.status === 'published') {
    const hasActiveDispatch = await SurveyDispatch.count({
      where: { surveyId: id, status: { [Op.in]: ['active', 'closed'] } },
    });
    if (hasActiveDispatch > 0) {
      throw new ConflictError('Cannot edit a survey that has active or completed dispatches');
    }
  }

  const { questions, ...surveyData } = data;
  const oldValue = { name: survey.name, status: survey.status };

  Object.assign(survey, surveyData);
  await survey.save();

  if (questions !== undefined) {
    await _replaceQuestions(id, questions);
  }

  await createAuditLog({
    entityType: 'survey', entityId: id,
    action: AUDIT_ACTIONS.UPDATED, changedBy: updatedBy, oldValue, newValue: surveyData,
  });

  return getSurveyById(id);
};

const publishSurvey = async (id, publishedBy) => {
  const survey = await Survey.findByPk(id, {
    include: [{ model: SurveyQuestion, as: 'questions' }],
  });
  if (!survey) throw new NotFoundError('Survey');

  if (survey.status === 'published') return survey;
  if (survey.status === 'archived') throw new ConflictError('Cannot publish an archived survey');

  const questionCount = survey.questions?.length || 0;
  if (questionCount === 0) {
    throw new ConflictError('Survey must have at least one question before publishing');
  }

  survey.status = 'published';
  await survey.save();

  await createAuditLog({
    entityType: 'survey', entityId: id,
    action: AUDIT_ACTIONS.SURVEY_PUBLISHED, changedBy: publishedBy,
    oldValue: { status: 'draft' }, newValue: { status: 'published' },
  });

  return survey;
};

const archiveSurvey = async (id, archivedBy) => {
  const survey = await Survey.findByPk(id);
  if (!survey) throw new NotFoundError('Survey');

  const activeDispatches = await SurveyDispatch.count({
    where: { surveyId: id, status: 'active' },
  });
  if (activeDispatches > 0) {
    throw new ConflictError('Cannot archive a survey with active dispatches. Close them first.');
  }

  survey.status = 'archived';
  await survey.save();

  await createAuditLog({
    entityType: 'survey', entityId: id,
    action: AUDIT_ACTIONS.DELETED, changedBy: archivedBy,
    oldValue: { status: survey.status }, newValue: { status: 'archived' },
  });
};

// ── Questions (internal helper) ───────────────────────────────────────────────

// Replaces all questions for a survey with the provided array (full replace strategy)
const _replaceQuestions = async (surveyId, questions) => {
  await SurveyQuestion.destroy({ where: { surveyId } });

  if (!questions.length) return;

  const rows = questions.map((q, idx) => ({
    id: uuidv4(),
    surveyId,
    questionText: q.questionText,
    helperText: q.helperText || null,
    questionType: q.questionType,
    options: q.options || null,
    minValue: q.minValue ?? null,
    maxValue: q.maxValue ?? null,
    minLabel: q.minLabel || null,
    maxLabel: q.maxLabel || null,
    isRequired: q.isRequired ?? false,
    orderIndex: q.orderIndex ?? idx,
  }));

  await SurveyQuestion.bulkCreate(rows);
};

module.exports = {
  listSurveys, getSurveyById, createSurvey, updateSurvey, publishSurvey, archiveSurvey,
};
