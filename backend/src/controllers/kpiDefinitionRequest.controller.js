const approvalService = require('../services/kpiDefinitionApproval.service');
const delegationService = require('../services/kpiDefinitionDelegation.service');

const listRequests = async (req, res, next) => {
  try {
    const rows = await approvalService.listRequests(req.user, req.query);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
};

const approve = async (req, res, next) => {
  try {
    const { request, applied, finalized } = await approvalService.approveRequest(req.params.id, req.user, req.body.note);
    const message = finalized
      ? 'Approved and published.'
      : 'Approved — forwarded to the next approver.';
    res.json({ success: true, data: { request, applied, finalized }, message });
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    const request = await approvalService.rejectRequest(req.params.id, req.user, req.body.note);
    res.json({ success: true, data: request, message: 'Request rejected.' });
  } catch (err) { next(err); }
};

const myAccess = async (req, res, next) => {
  try {
    const access = await delegationService.getMyAccess(req.user);
    res.json({ success: true, data: access });
  } catch (err) { next(err); }
};

// Sub-delegation — anyone who can already define for a department (admin,
// that department's Approver, or a granted Definer) can grant Definer rights
// to someone else for that SAME department, not just admin.
const grantSubDefiner = async (req, res, next) => {
  try {
    const grant = await approvalService.grantSubDefiner(req.user, req.body.userId);
    res.status(201).json({ success: true, data: grant });
  } catch (err) { next(err); }
};

module.exports = { listRequests, approve, reject, myAccess, grantSubDefiner };
