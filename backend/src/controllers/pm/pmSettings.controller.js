const pmSettingsService = require('../../services/pm/pmSettings.service');
const { rescheduleProjectDailyReportJob } = require('../../jobs/projectDailyReport.job');
const { sendSuccess } = require('../../utils/response');

const getSettings = async (req, res, next) => {
  try { sendSuccess(res, await pmSettingsService.getSettings()); }
  catch (e) { next(e); }
};

const updateSettings = async (req, res, next) => {
  try {
    const settings = await pmSettingsService.updateSettings(req.body);
    // Reschedule cron if the report time changed
    if (req.body.dailyReportTime) {
      rescheduleProjectDailyReportJob(req.body.dailyReportTime);
    }
    sendSuccess(res, settings, 'Settings updated');
  }
  catch (e) { next(e); }
};

module.exports = { getSettings, updateSettings };
