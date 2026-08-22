const rosterService = require('../../services/roster/roster.service');
const swapService = require('../../services/roster/rosterSwap.service');
const compOffService = require('../../services/roster/rosterCompOff.service');
const settingsService = require('../../services/roster/rosterSettings.service');
const { sendSuccess } = require('../../utils/response');

// ── Weeks ─────────────────────────────────────────────────────────────────────
const listWeeks = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.listWeeks(req.user, req.query));
  } catch (err) { next(err); }
};

const createWeek = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getOrCreateWeek(req.body.saturdayDate, req.user), 'Roster week ready', 201);
  } catch (err) { next(err); }
};

const getWeek = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getWeekDetail(req.params.weekId, req.user, req.query));
  } catch (err) { next(err); }
};

const publishWeek = async (req, res, next) => {
  try {
    const result = await rosterService.publishWeek(req.params.weekId, req.user);
    sendSuccess(res, result, `Published ${result.published} roster entr${result.published === 1 ? 'y' : 'ies'} — emails are being sent`);
  } catch (err) { next(err); }
};

const exportWeek = async (req, res, next) => {
  try {
    const { buffer, filename } = await rosterService.exportWeekExcel(req.params.weekId, req.user);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

// ── Entries ───────────────────────────────────────────────────────────────────
const updateEntry = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.updateEntry(req.params.entryId, req.body, req.user), 'Roster entry updated');
  } catch (err) { next(err); }
};

// ── Self / history / coverage ─────────────────────────────────────────────────
const getMyRoster = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getMyRoster(req.user));
  } catch (err) { next(err); }
};

const getDashboard = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getRosterDashboard(req.user));
  } catch (err) { next(err); }
};

const getEmployeeHistory = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getEmployeeHistory(req.params.employeeId, req.user, req.query));
  } catch (err) { next(err); }
};

const getCoverage = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getCoverage(req.user, req.query));
  } catch (err) { next(err); }
};

const getTrend = async (req, res, next) => {
  try {
    sendSuccess(res, await rosterService.getTrend(req.user, req.query));
  } catch (err) { next(err); }
};

const exportTrend = async (req, res, next) => {
  try {
    const { buffer, filename } = await rosterService.exportTrendExcel(req.user, req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) { next(err); }
};

// ── Swaps ─────────────────────────────────────────────────────────────────────
const createSwap = async (req, res, next) => {
  try {
    sendSuccess(res, await swapService.createSwap(req.params.weekId, req.body, req.user), 'Swap request sent to your colleague', 201);
  } catch (err) { next(err); }
};

const listSwaps = async (req, res, next) => {
  try {
    sendSuccess(res, await swapService.listSwaps(req.user, req.query));
  } catch (err) { next(err); }
};

const acceptSwap = async (req, res, next) => {
  try {
    sendSuccess(res, await swapService.acceptSwap(req.params.id, req.user), 'Swap accepted — sent to manager for approval');
  } catch (err) { next(err); }
};

const decideSwap = async (req, res, next) => {
  try {
    sendSuccess(res, await swapService.decideSwap(req.params.id, req.body, req.user), 'Swap decision recorded');
  } catch (err) { next(err); }
};

const cancelSwap = async (req, res, next) => {
  try {
    sendSuccess(res, await swapService.cancelSwap(req.params.id, req.user), 'Swap cancelled');
  } catch (err) { next(err); }
};

// ── Comp-offs ─────────────────────────────────────────────────────────────────
const listCompOffs = async (req, res, next) => {
  try {
    sendSuccess(res, await compOffService.listCompOffs(req.user, req.query));
  } catch (err) { next(err); }
};

const availCompOff = async (req, res, next) => {
  try {
    sendSuccess(res, await compOffService.availCompOff(req.params.id, req.body, req.user), 'Comp-off marked as availed');
  } catch (err) { next(err); }
};

// ── Bulk actions ──────────────────────────────────────────────────────────────
const bulkUpdateWeek = async (req, res, next) => {
  try {
    const r = await rosterService.bulkUpdateWeek(req.params.weekId, req.body.action, req.user);
    sendSuccess(res, r, `${r.updated} entr${r.updated === 1 ? 'y' : 'ies'} updated${r.skipped ? `, ${r.skipped} skipped` : ''}`);
  } catch (err) { next(err); }
};

// ── Settings ──────────────────────────────────────────────────────────────────
const getSettings = async (req, res, next) => {
  try {
    sendSuccess(res, await settingsService.getSettings());
  } catch (err) { next(err); }
};

const updateSettings = async (req, res, next) => {
  try {
    sendSuccess(res, await settingsService.updateSettings(req.body, req.user), 'Roster settings saved');
  } catch (err) { next(err); }
};

// ── Holidays ──────────────────────────────────────────────────────────────────
const listHolidays = async (req, res, next) => {
  try {
    sendSuccess(res, await settingsService.listHolidays(req.query));
  } catch (err) { next(err); }
};

const createHoliday = async (req, res, next) => {
  try {
    sendSuccess(res, await settingsService.createHoliday(req.body, req.user), 'Holiday added', 201);
  } catch (err) { next(err); }
};

const deleteHoliday = async (req, res, next) => {
  try {
    await settingsService.deleteHoliday(req.params.id, req.user);
    sendSuccess(res, null, 'Holiday removed');
  } catch (err) { next(err); }
};

// ── Leave ─────────────────────────────────────────────────────────────────────
const listLeaves = async (req, res, next) => {
  try {
    sendSuccess(res, await settingsService.listLeaves(req.user, req.query));
  } catch (err) { next(err); }
};

const createLeave = async (req, res, next) => {
  try {
    sendSuccess(res, await settingsService.createLeave(req.body, req.user), 'Leave recorded', 201);
  } catch (err) { next(err); }
};

const deleteLeave = async (req, res, next) => {
  try {
    await settingsService.deleteLeave(req.params.id, req.user);
    sendSuccess(res, null, 'Leave removed');
  } catch (err) { next(err); }
};

module.exports = {
  listWeeks,
  bulkUpdateWeek,
  getSettings,
  updateSettings,
  listHolidays,
  createHoliday,
  deleteHoliday,
  listLeaves,
  createLeave,
  deleteLeave,
  createWeek,
  getWeek,
  publishWeek,
  exportWeek,
  updateEntry,
  getMyRoster,
  getDashboard,
  getEmployeeHistory,
  getCoverage,
  getTrend,
  exportTrend,
  createSwap,
  listSwaps,
  acceptSwap,
  decideSwap,
  cancelSwap,
  listCompOffs,
  availCompOff,
};
