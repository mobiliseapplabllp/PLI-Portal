const cron = require('node-cron');
const pmSettingsService = require('../services/pm/pmSettings.service');

let currentTask = null;
let currentCronExpr = null;

function buildCronExpr(timeStr) {
  // timeStr is 'HH:MM' in IST, e.g. '09:00'
  const [h, m] = (timeStr || '09:00').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '0 9 * * *';
  return `${m} ${h} * * *`;
}

async function runJob() {
  try {
    const settings = await pmSettingsService.getSettings();
    if (!settings.helpdeskDailyReportEnabled) {
      console.log('[Helpdesk DailyReport] Disabled in settings — skipping');
      return;
    }
    // TODO: implement helpdesk daily report content
    // For now: logs that the job ran
    console.log('[Helpdesk Daily Report] Job fired at', new Date().toISOString());
  } catch (err) {
    console.error('[Helpdesk DailyReport] Job error:', err.message);
  }
}

async function startHelpdeskDailyReportJob() {
  const settings = await pmSettingsService.getSettings();
  const cronExpr = buildCronExpr(settings.helpdeskDailyReportTime);
  scheduleCron(cronExpr);
}

function scheduleCron(cronExpr) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  currentCronExpr = cronExpr;
  currentTask = cron.schedule(cronExpr, runJob, { timezone: 'Asia/Kolkata' });
  console.log(`[Helpdesk DailyReport] Scheduled at cron "${cronExpr}" IST`);
}

// Called by pmSettings controller when admin updates helpdeskDailyReportTime
function rescheduleHelpdeskDailyReportJob(timeStr) {
  const cronExpr = buildCronExpr(timeStr);
  if (cronExpr === currentCronExpr) return;
  scheduleCron(cronExpr);
}

module.exports = { startHelpdeskDailyReportJob, rescheduleHelpdeskDailyReportJob };
