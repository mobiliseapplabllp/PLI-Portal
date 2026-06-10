const pmSettingsService = require('../../services/pm/pmSettings.service');
const { sendSuccess } = require('../../utils/response');

const getSettings = async (req, res, next) => {
  try { sendSuccess(res, await pmSettingsService.getSettings()); }
  catch (e) { next(e); }
};
const updateSettings = async (req, res, next) => {
  try { sendSuccess(res, await pmSettingsService.updateSettings(req.body), 'Settings updated'); }
  catch (e) { next(e); }
};

module.exports = { getSettings, updateSettings };
