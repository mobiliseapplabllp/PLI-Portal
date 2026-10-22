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
// GET routes: role list keeps everyone who already had access, plus
// 'employee' — the only role newly reachable here, via a granted KPI
// Definer grant (kpiDefinitionApproval.service.js scopes them to their own
// department; see kpiPlan.service.js getPlans/getPlanById).
router.get('/', authorize('hr_admin', 'admin', 'manager', 'senior_manager', 'sales_director', 'employee'), ctrl.getPlans);
// Write routes: static role lists can't express "has been individually
// granted Definer rights", so the real permission check now lives in
// kpiDefinitionApproval.service.js's assertCanDefine() — any authenticated
// user may reach the controller, and gets a clean 403 there if they have no
// rights. This also brings hr_admin/sales_director under the same gate.
router.post('/', createPlanValidator, validate, ctrl.createPlan);

// Individual plan operations
router.get('/:id', authorize('hr_admin', 'admin', 'manager', 'senior_manager', 'sales_director', 'employee'), ctrl.getPlanById);
router.put('/:id', ctrl.updatePlan);
router.patch('/:id/status', updatePlanStatusValidator, validate, ctrl.updatePlanStatus);
router.post('/:id/publish', ctrl.publishPlan);
router.post('/:id/unpublish', ctrl.unpublishPlan);

// Plan item operations
router.post('/:id/items', addPlanItemValidator, validate, ctrl.addPlanItem);
router.put('/:id/items/:itemId', updatePlanItemValidator, validate, ctrl.updatePlanItem);
router.delete('/:id/items/:itemId', ctrl.deletePlanItem);

module.exports = router;
