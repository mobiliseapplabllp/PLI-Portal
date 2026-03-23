const cycleService = require('../services/cycle.service');
const { sendSuccess } = require('../utils/response');

const getCycles = async (req, res, next) => {
  try {
    const cycles = await cycleService.getCycles(req.query);
    sendSuccess(res, cycles);
  } catch (error) {
    next(error);
  }
};

const createCycle = async (req, res, next) => {
  try {
    const cycle = await cycleService.createCycle(req.body, req.user._id);
    sendSuccess(res, cycle, 'Appraisal cycle created', 201);
  } catch (error) {
    next(error);
  }
};

const updateCycle = async (req, res, next) => {
  try {
    const cycle = await cycleService.updateCycle(req.params.id, req.body, req.user._id);
    sendSuccess(res, cycle, 'Appraisal cycle updated');
  } catch (error) {
    next(error);
  }
};

module.exports = { getCycles, createCycle, updateCycle };
