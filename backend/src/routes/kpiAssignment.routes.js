const router = require('express').Router();
const ctrl = require('../controllers/kpiAssignment.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const {
  createAssignmentValidator,
  employeeSubmitValidator,
  managerReviewValidator,
  finalReviewValidator,
} = require('../validators/kpiAssignment.validator');

router.use(authenticate);

router.get('/', ctrl.getAssignments);
router.get('/team-overview', authorize('manager', 'admin'), ctrl.teamOverview);
router.get('/admin-overview', authorize('admin'), ctrl.adminOverview);
router.get('/import-template', authorize('manager', 'admin'), ctrl.getImportTemplate);
router.post('/bulk-import', authorize('manager', 'admin'), ctrl.bulkImportKpis);
// Clone KPIs (must be before /:id to avoid matching "clone" as an id)
router.post('/clone', authorize('manager', 'admin'), ctrl.cloneKpis);
router.post('/bulk-clone', authorize('manager', 'admin'), ctrl.bulkCloneKpis);

router.get('/:id', ctrl.getAssignmentById);
router.post('/', authorize('manager', 'admin'), createAssignmentValidator, validate, ctrl.createAssignment);
router.put('/:id', authorize('manager', 'admin'), ctrl.updateAssignment);

// Workflow transitions
router.post('/:id/assign', authorize('manager', 'admin'), ctrl.assignToEmployee);
router.post('/:id/employee-submit', authorize('employee', 'manager', 'admin'), employeeSubmitValidator, validate, ctrl.employeeSubmit);
router.post('/:id/manager-review', authorize('manager', 'admin'), managerReviewValidator, validate, ctrl.managerReview);
router.post('/:id/final-review', authorize('admin'), finalReviewValidator, validate, ctrl.finalReview);
router.post('/:id/lock', authorize('admin'), ctrl.lockAssignment);
router.post('/:id/unlock', authorize('admin'), ctrl.unlockAssignment);
router.post('/:id/reopen', authorize('admin'), ctrl.reopenAssignment);

module.exports = router;
