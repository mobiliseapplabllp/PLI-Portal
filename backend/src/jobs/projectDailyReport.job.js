const cron = require('node-cron');
const { runAllDailyReports } = require('../services/pm/dailyReport.service');
const pmSettingsService = require('../services/pm/pmSettings.service');

function startProjectDailyReportJob() {
  // Run every day at 9:00 AM IST
  cron.schedule('0 9 * * *', async () => {
    try {
      const settings = await pmSettingsService.getSettings();
      if (!settings.dailyReportEnabled) {
        console.log('[PM DailyReport] Disabled in settings — skipping');
        return;
      }
      await runAllDailyReports();
    } catch (err) {
      console.error('[PM DailyReport] Job error:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[PM DailyReport] Scheduled daily at 09:00 IST');
}

module.exports = { startProjectDailyReportJob };
