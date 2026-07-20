const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');
const {
  approveValidator,
  requestChangesValidator,
  rejectValidator,
} = require('../../validators/csat.validator');
const ctrl = require('../../controllers/surveyApproval.controller');

const ADMIN_ONLY = [authenticate, authorize('admin')];
const MANAGER_ROLES = [authenticate, authorize('manager', 'senior_manager')];
const CAN_VIEW_APPROVAL = [authenticate, authorize('admin', 'manager', 'senior_manager')];

// ── Manager routes (dispatch sub-actions) ─────────────────────────────────────
// Note: these are mounted under /api/survey-dispatches via index.js

// ── Approval inbox + detail (admin) + my-requests (manager) ──────────────────

// Admin: list all approvals
router.get('/', ...ADMIN_ONLY, ctrl.listApprovals);

// Manager: list own requests  — must come BEFORE /:approvalId
router.get('/my-requests', ...MANAGER_ROLES, ctrl.getMyRequests);

// Admin or requester: get approval detail
router.get('/:approvalId', ...CAN_VIEW_APPROVAL, ctrl.getApprovalDetail);

// Admin actions
router.post('/:approvalId/approve', ...ADMIN_ONLY, approveValidator, ctrl.approveDispatch);
router.post('/:approvalId/request-changes', ...ADMIN_ONLY, requestChangesValidator, ctrl.requestChanges);
router.post('/:approvalId/reject', ...ADMIN_ONLY, rejectValidator, ctrl.rejectDispatch);

module.exports = router;
