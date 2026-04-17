const svc = require('../services/finalApprover.service');

const getDeptQuarterlyStatus = async (req, res, next) => {
  try {
    const data = await svc.getDeptQuarterlyStatus(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const buildQuarterlyApprovalData = async (req, res, next) => {
  try {
    const { employeeId, fy, quarter } = req.params;
    const data = await svc.buildQuarterlyApprovalData(employeeId, fy, quarter, req.user);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const createOrUpdateQuarterlyApproval = async (req, res, next) => {
  try {
    const { employeeId, fy, quarter } = req.params;
    const approval = await svc.createOrUpdateQuarterlyApproval(employeeId, fy, quarter, req.user);
    res.status(201).json({ success: true, data: approval });
  } catch (err) { next(err); }
};

const submitQuarterlyApproval = async (req, res, next) => {
  try {
    const approval = await svc.submitQuarterlyApproval(req.params.id, req.body.items, req.user);
    res.json({ success: true, data: approval, message: 'Quarterly approval submitted successfully.' });
  } catch (err) { next(err); }
};

const getQuarterlyApproval = async (req, res, next) => {
  try {
    const approval = await svc.getQuarterlyApproval(req.params.id, req.user);
    res.json({ success: true, data: approval });
  } catch (err) { next(err); }
};

const getDeptApprovals = async (req, res, next) => {
  try {
    const approvals = await svc.getDeptApprovals(req.user, req.query);
    res.json({ success: true, data: approvals });
  } catch (err) { next(err); }
};

module.exports = {
  getDeptQuarterlyStatus,
  buildQuarterlyApprovalData,
  createOrUpdateQuarterlyApproval,
  submitQuarterlyApproval,
  getQuarterlyApproval,
  getDeptApprovals,
};
