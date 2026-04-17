const router = require('express').Router();
const ctrl = require('../controllers/kpiAssignment.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const {
  createAssignmentValidator,
  commitValidator,
  employeeSubmitValidator,
  managerReviewValidator,
} = require('../validators/kpiAssignment.validator');

router.use(authenticate);

router.get('/', ctrl.getAssignments);
router.get('/team-overview', authorize('manager', 'admin'), ctrl.teamOverview);
router.get('/admin-overview', authorize('admin'), ctrl.adminOverview);

// Clone/import now restricted to hr_admin and admin only
router.get('/import-template', authorize('hr_admin', 'admin'), ctrl.getImportTemplate);
router.post('/bulk-import', authorize('hr_admin', 'admin'), ctrl.bulkImportKpis);
router.post('/clone', authorize('hr_admin', 'admin'), ctrl.cloneKpis);
router.post('/bulk-clone', authorize('hr_admin', 'admin'), ctrl.bulkCloneKpis);

router.get('/:id', ctrl.getAssignmentById);
router.post('/', authorize('manager', 'admin'), createAssignmentValidator, validate, ctrl.createAssignment);
router.put('/:id', authorize('manager', 'admin'), ctrl.updateAssignment);

// Workflow transitions
router.post('/:id/assign', authorize('manager', 'admin'), ctrl.assignToEmployee);

// NEW: Employee submits commitment (ASSIGNED → COMMITMENT_SUBMITTED)
router.post('/:id/commit', authorize('employee', 'manager', 'admin'), commitValidator, validate, ctrl.commitKpi);

// Employee submits achievement (COMMITMENT_SUBMITTED → EMPLOYEE_SUBMITTED)
router.post('/:id/employee-submit', authorize('employee', 'manager', 'admin'), employeeSubmitValidator, validate, ctrl.employeeSubmit);

router.post('/:id/manager-review', authorize('manager', 'admin'), managerReviewValidator, validate, ctrl.managerReview);

// NOTE: /final-review route is REMOVED — replaced by /api/final-approver/approvals/:id/submit
// Kept as 410 Gone for any legacy clients
router.post('/:id/final-review', (req, res) => {
  res.status(410).json({
    success: false,
    error: { message: 'This endpoint has been removed. Final review is now handled by the Final Approver role via /api/final-approver.' },
  });
});

router.post('/:id/lock', authorize('admin'), ctrl.lockAssignment);
router.post('/:id/unlock', authorize('admin'), ctrl.unlockAssignment);
router.post('/:id/reopen', authorize('admin'), ctrl.reopenAssignment);

module.exports = router;
