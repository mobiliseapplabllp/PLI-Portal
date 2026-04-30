const router = require('express').Router();
const ctrl = require('../controllers/kpiPlan.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const {
  createPlanValidator,
  addPlanItemValidator,
  updatePlanItemValidator,
  updatePlanStatusValidator,
} = require('../validators/kpiPlan.validator');

router.use(authenticate);

// List + Create plans
router.get('/', authorize('hr_admin', 'admin', 'manager', 'senior_manager'), ctrl.getPlans);
router.post('/', authorize('hr_admin', 'admin'), createPlanValidator, validate, ctrl.createPlan);

// Individual plan operations
router.get('/:id', authorize('hr_admin', 'admin', 'manager', 'senior_manager'), ctrl.getPlanById);
router.put('/:id', authorize('hr_admin', 'admin'), ctrl.updatePlan);
router.patch('/:id/status', authorize('hr_admin', 'admin'), updatePlanStatusValidator, validate, ctrl.updatePlanStatus);
router.post('/:id/publish', authorize('hr_admin', 'admin'), ctrl.publishPlan);

// Plan item operations
router.post('/:id/items', authorize('hr_admin', 'admin'), addPlanItemValidator, validate, ctrl.addPlanItem);
router.put('/:id/items/:itemId', authorize('hr_admin', 'admin'), updatePlanItemValidator, validate, ctrl.updatePlanItem);
router.delete('/:id/items/:itemId', authorize('hr_admin', 'admin'), ctrl.deletePlanItem);

module.exports = router;
