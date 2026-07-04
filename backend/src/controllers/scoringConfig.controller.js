const scoringConfigService = require('../services/scoringConfig.service');

const getConfigs = async (req, res, next) => {
  try {
    const configs = await scoringConfigService.getConfigs(req.query);
    res.json({ success: true, data: configs });
  } catch (err) {
    next(err);
  }
};

const createConfig = async (req, res, next) => {
  try {
    const config = await scoringConfigService.createConfig(req.body, req.user._id);
    res.status(201).json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

const updateConfig = async (req, res, next) => {
  try {
    const config = await scoringConfigService.updateConfig(req.params.id, req.body, req.user._id);
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

module.exports = { getConfigs, createConfig, updateConfig };
