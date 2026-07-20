const surveyService = require('../services/survey.service');
const { sendSuccess, sendPaginated } = require('../utils/response');

const listSurveys = async (req, res, next) => {
  try {
    const result = await surveyService.listSurveys(req.query);
    return sendPaginated(res, result.surveys, result.pagination);
  } catch (err) { next(err); }
};

const getSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.getSurveyById(req.params.id);
    return sendSuccess(res, survey);
  } catch (err) { next(err); }
};

const createSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.createSurvey(req.body, req.user._id);
    return sendSuccess(res, survey, 'Created', 201);
  } catch (err) { next(err); }
};

const updateSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.updateSurvey(req.params.id, req.body, req.user._id);
    return sendSuccess(res, survey);
  } catch (err) { next(err); }
};

const publishSurvey = async (req, res, next) => {
  try {
    const survey = await surveyService.publishSurvey(req.params.id, req.user._id);
    return sendSuccess(res, survey);
  } catch (err) { next(err); }
};

const archiveSurvey = async (req, res, next) => {
  try {
    await surveyService.archiveSurvey(req.params.id, req.user._id);
    return sendSuccess(res, { message: 'Survey archived' });
  } catch (err) { next(err); }
};

module.exports = { listSurveys, getSurvey, createSurvey, updateSurvey, publishSurvey, archiveSurvey };
