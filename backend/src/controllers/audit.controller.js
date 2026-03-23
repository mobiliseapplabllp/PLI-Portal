const auditService = require('../services/audit.service');
const { sendSuccess, sendPaginated } = require('../utils/response');

const getLogs = async (req, res, next) => {
  try {
    const { logs, pagination } = await auditService.getLogs(req.query);
    sendPaginated(res, logs, pagination);
  } catch (error) {
    next(error);
  }
};

module.exports = { getLogs };
