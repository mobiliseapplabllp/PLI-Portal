const publicService = require('../services/publicSurvey.service');
const { sendSuccess } = require('../utils/response');

const getSurvey = async (req, res, next) => {
  try {
    const data = await publicService.getSurveyByToken(req.params.token);
    return sendSuccess(res, data);
  } catch (err) { next(err); }
};

const submitSurvey = async (req, res, next) => {
  try {
    const result = await publicService.submitSurvey(req.params.token, req.body.answers || {});
    return sendSuccess(res, result);
  } catch (err) { next(err); }
};

module.exports = { getSurvey, submitSurvey };
