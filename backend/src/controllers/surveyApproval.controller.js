const { validationResult } = require('express-validator');
const approvalService = require('../services/surveyApproval.service');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: { message: errors.array()[0].msg, details: errors.array() } });
  }
  return null;
}

// POST /api/survey-dispatches/:id/submit-approval
exports.submitForApproval = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    const approval = await approvalService.submitForApproval(req.params.id, req.user._id);
    res.status(201).json({ success: true, data: approval });
  } catch (err) { next(err); }
};

// PUT /api/survey-dispatches/:id/revise
exports.reviseDispatch = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    const dispatch = await approvalService.reviseDispatch(req.params.id, req.body, req.user._id);
    res.json({ success: true, data: dispatch });
  } catch (err) { next(err); }
};

// POST /api/survey-dispatches/:id/resubmit
exports.resubmitForApproval = async (req, res, next) => {
  try {
    const approval = await approvalService.resubmitForApproval(req.params.id, req.user._id);
    res.status(201).json({ success: true, data: approval });
  } catch (err) { next(err); }
};

// GET /api/survey-approvals?status=&page=
exports.listApprovals = async (req, res, next) => {
  try {
    const result = await approvalService.listApprovals(req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

// GET /api/survey-approvals/my-requests?status=&page=
exports.getMyRequests = async (req, res, next) => {
  try {
    const result = await approvalService.getMyRequests(req.user._id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

// GET /api/survey-approvals/:approvalId
exports.getApprovalDetail = async (req, res, next) => {
  try {
    const data = await approvalService.getApprovalDetail(req.params.approvalId, req.user._id, req.user.role);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// POST /api/survey-approvals/:approvalId/approve
exports.approveDispatch = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    await approvalService.approveDispatch(req.params.approvalId, req.user._id, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /api/survey-approvals/:approvalId/request-changes
exports.requestChanges = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    await approvalService.requestChanges(req.params.approvalId, req.user._id, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
};

// POST /api/survey-approvals/:approvalId/reject
exports.rejectDispatch = async (req, res, next) => {
  try {
    if (handleValidation(req, res)) return;
    await approvalService.rejectDispatch(req.params.approvalId, req.user._id, req.body);
    res.json({ success: true });
  } catch (err) { next(err); }
};
