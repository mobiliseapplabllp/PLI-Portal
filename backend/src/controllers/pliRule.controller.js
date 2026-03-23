const pliRuleService = require('../services/pliRule.service');
const { sendSuccess } = require('../utils/response');

const getRules = async (req, res, next) => {
  try {
    const rules = await pliRuleService.getRules(req.query);
    sendSuccess(res, rules);
  } catch (error) {
    next(error);
  }
};

const createRule = async (req, res, next) => {
  try {
    const rule = await pliRuleService.createRule(req.body, req.user._id);
    sendSuccess(res, rule, 'PLI rule created', 201);
  } catch (error) {
    next(error);
  }
};

const updateRule = async (req, res, next) => {
  try {
    const rule = await pliRuleService.updateRule(req.params.id, req.body, req.user._id);
    sendSuccess(res, rule, 'PLI rule updated');
  } catch (error) {
    next(error);
  }
};

module.exports = { getRules, createRule, updateRule };
