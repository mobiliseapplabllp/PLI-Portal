const delegationService = require('../services/kpiDefinitionDelegation.service');

const uid = (user) => user._id || user.id;

const listDefiners = async (req, res, next) => {
  try {
    const rows = await delegationService.listDefiners();
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const grantDefiner = async (req, res, next) => {
  try {
    const row = await delegationService.grantDefiner(req.body.userId, uid(req.user));
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
};

const revokeDefiner = async (req, res, next) => {
  try {
    await delegationService.revokeDefiner(req.params.userId);
    res.json({ success: true, message: 'Definer rights revoked.' });
  } catch (err) { next(err); }
};

const listApprovers = async (req, res, next) => {
  try {
    const rows = await delegationService.listApprovers();
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const assignApprover = async (req, res, next) => {
  try {
    const row = await delegationService.assignApprover(req.params.departmentId, req.body.userId, uid(req.user));
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
};

const removeApprover = async (req, res, next) => {
  try {
    const result = await delegationService.removeApprover(req.params.departmentId);
    res.json({ success: true, data: result, message: 'Approver removed — falls back to admin.' });
  } catch (err) { next(err); }
};

module.exports = {
  listDefiners, grantDefiner, revokeDefiner,
  listApprovers, assignApprover, removeApprover,
};
