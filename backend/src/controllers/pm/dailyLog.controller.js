const dailyLogService = require('../../services/pm/dailyLog.service');
const { sendSuccess, sendPaginated } = require('../../utils/response');

const getLogs = async (req, res, next) => {
  try {
    const { logs, pagination } = await dailyLogService.getLogs(req.params.id, req.query);
    sendPaginated(res, logs, pagination);
  }
  catch (e) { next(e); }
};
const getLogById = async (req, res, next) => {
  try { sendSuccess(res, await dailyLogService.getLogById(req.params.id, req.params.logId)); }
  catch (e) { next(e); }
};
const upsertTodayLog = async (req, res, next) => {
  try { sendSuccess(res, await dailyLogService.upsertTodayLog(req.params.id, req.body, req.user), "Today's log saved"); }
  catch (e) { next(e); }
};

module.exports = { getLogs, getLogById, upsertTodayLog };
