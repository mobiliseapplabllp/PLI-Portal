const cron = require('node-cron');
const { runAllDailyReports } = require('../services/pm/dailyReport.service');
const pmSettingsService = require('../services/pm/pmSettings.service');

let currentTask = null;
let currentCronExpr = null;

function buildCronExpr(timeStr) {
  // timeStr is 'HH:MM' in IST, e.g. '14:30'
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '0 9 * * *';
  return `${m} ${h} * * *`;
}

async function runJob() {
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
}

async function startProjectDailyReportJob() {
  const settings = await pmSettingsService.getSettings();
  const cronExpr = buildCronExpr(settings.dailyReportTime);
  scheduleCron(cronExpr);
}

function scheduleCron(cronExpr) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  currentCronExpr = cronExpr;
  currentTask = cron.schedule(cronExpr, runJob, { timezone: 'Asia/Kolkata' });
  console.log(`[PM DailyReport] Scheduled at cron "${cronExpr}" IST`);
}

// Called by pmSettings controller when admin updates dailyReportTime
function rescheduleProjectDailyReportJob(timeStr) {
  const cronExpr = buildCronExpr(timeStr);
  if (cronExpr === currentCronExpr) return;
  scheduleCron(cronExpr);
}

module.exports = { startProjectDailyReportJob, rescheduleProjectDailyReportJob };
