const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');
const ctrl = require('../../controllers/surveyDispatch.controller');
const approvalCtrl = require('../../controllers/surveyApproval.controller');

const CAN_SEND = [authenticate, authorize('admin', 'manager', 'senior_manager')];
const CAN_VIEW = [authenticate, authorize('admin', 'manager', 'senior_manager', 'hr_admin', 'final_approver')];
const MANAGER_ROLES = [authenticate, authorize('manager', 'senior_manager')];

router.get('/dashboard',  ...CAN_VIEW, ctrl.getDashboard);
router.get('/',           ...CAN_VIEW, ctrl.listDispatches);
router.post('/',          ...CAN_SEND, ctrl.createDispatch);
router.get('/:id',        ...CAN_VIEW, ctrl.getDispatch);
router.patch('/:id/close', ...CAN_SEND, ctrl.closeDispatch);
router.get('/:id/responses',                     ...CAN_VIEW, ctrl.getDispatchResponses);
router.get('/:id/responses/:recipientId',         ...CAN_VIEW, ctrl.getRecipientResponses);
router.get('/:id/export',                         ...CAN_VIEW, ctrl.exportExcel);
router.patch('/recipients/:recipientId/resend',   ...CAN_SEND, ctrl.resendEmail);

// ── Approval sub-routes (manager actions on their own dispatches) ──────────────
router.post('/:id/submit-approval', ...MANAGER_ROLES, approvalCtrl.submitForApproval);
router.put('/:id/revise',           ...MANAGER_ROLES, approvalCtrl.reviseDispatch);
router.post('/:id/resubmit',        ...MANAGER_ROLES, approvalCtrl.resubmitForApproval);

module.exports = router;
