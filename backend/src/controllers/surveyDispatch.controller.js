const dispatchService = require('../services/surveyDispatch.service');
const { sendSuccess, sendPaginated } = require('../utils/response');
const path = require('path');

const createDispatch = async (req, res, next) => {
  try {
    const dispatch = await dispatchService.createDispatch(req.body, req.user._id);
    return sendSuccess(res, dispatch, 'Created', 201);
  } catch (err) { next(err); }
};

const listDispatches = async (req, res, next) => {
  try {
    const result = await dispatchService.listDispatches(req.query, req.user);
    return sendPaginated(res, result.dispatches, result.pagination);
  } catch (err) { next(err); }
};

const getDispatch = async (req, res, next) => {
  try {
    const detail = await dispatchService.getDispatchDetail(req.params.id, req.user);
    return sendSuccess(res, detail);
  } catch (err) { next(err); }
};

const closeDispatch = async (req, res, next) => {
  try {
    await dispatchService.closeDispatch(req.params.id, req.user);
    return sendSuccess(res, { message: 'Dispatch closed' });
  } catch (err) { next(err); }
};

const resendEmail = async (req, res, next) => {
  try {
    await dispatchService.resendEmail(req.params.recipientId, req.user);
    return sendSuccess(res, { message: 'Email resent' });
  } catch (err) { next(err); }
};

const getDispatchResponses = async (req, res, next) => {
  try {
    const data = await dispatchService.getDispatchResponses(req.params.id, req.user);
    return sendSuccess(res, data);
  } catch (err) { next(err); }
};

const getRecipientResponses = async (req, res, next) => {
  try {
    const data = await dispatchService.getRecipientResponses(req.params.id, req.params.recipientId, req.user);
    return sendSuccess(res, data);
  } catch (err) { next(err); }
};

const exportExcel = async (req, res, next) => {
  try {
    const wb = await dispatchService.exportDispatchExcel(req.params.id, req.user);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="survey-${req.params.id}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

const getDashboard = async (req, res, next) => {
  try {
    const data = await dispatchService.getDashboardStats(req.user);
    return sendSuccess(res, data);
  } catch (err) { next(err); }
};

module.exports = {
  createDispatch, listDispatches, getDispatch, closeDispatch, resendEmail,
  getDispatchResponses, getRecipientResponses, exportExcel, getDashboard,
};
