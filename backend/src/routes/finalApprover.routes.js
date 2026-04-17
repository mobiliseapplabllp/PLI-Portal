const router = require('express').Router();
const ctrl = require('../controllers/finalApprover.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { submitQuarterlyApprovalValidator } = require('../validators/finalApprover.validator');

router.use(authenticate);

// Department quarterly overview (list all employees + their readiness)
router.get('/quarterly', authorize('final_approver', 'admin'), ctrl.getDeptQuarterlyStatus);

// Build auto-calc data for one employee's quarter
router.get('/quarterly/:employeeId/:fy/:quarter', authorize('final_approver', 'admin'), ctrl.buildQuarterlyApprovalData);

// Create (or re-init) draft quarterly approval with auto-calc pre-fill
router.post('/quarterly/:employeeId/:fy/:quarter/init', authorize('final_approver', 'admin'), ctrl.createOrUpdateQuarterlyApproval);

// Get one quarterly approval with all items
router.get('/approvals/:id', authorize('final_approver', 'admin'), ctrl.getQuarterlyApproval);

// Submit (finalise) a quarterly approval
router.post('/approvals/:id/submit', authorize('final_approver', 'admin'), submitQuarterlyApprovalValidator, validate, ctrl.submitQuarterlyApproval);

// List dept quarterly approvals
router.get('/approvals', authorize('final_approver', 'admin'), ctrl.getDeptApprovals);

module.exports = router;
