const kpiTemplateService = require('../services/kpiTemplate.service');
const { sendSuccess } = require('../utils/response');

const getTemplates = async (req, res, next) => {
  try {
    const templates = await kpiTemplateService.getTemplates(req.query);
    sendSuccess(res, templates);
  } catch (error) {
    next(error);
  }
};

const createTemplate = async (req, res, next) => {
  try {
    const template = await kpiTemplateService.createTemplate(req.body, req.user._id);
    sendSuccess(res, template, 'KPI template created', 201);
  } catch (error) {
    next(error);
  }
};

const updateTemplate = async (req, res, next) => {
  try {
    const template = await kpiTemplateService.updateTemplate(req.params.id, req.body);
    sendSuccess(res, template, 'KPI template updated');
  } catch (error) {
    next(error);
  }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const template = await kpiTemplateService.deleteTemplate(req.params.id);
    sendSuccess(res, template, 'KPI template deactivated');
  } catch (error) {
    next(error);
  }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate };
