const router = require('express').Router();
const ctrl = require('../controllers/kpiDefinitionDelegation.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);
router.use(authorize('admin')); // only true admin manages Definer/Approver grants

router.get('/definers', ctrl.listDefiners);
router.post('/definers', ctrl.grantDefiner);
router.delete('/definers/:userId', ctrl.revokeDefiner);

router.get('/approvers', ctrl.listApprovers);
router.put('/approvers/:departmentId', ctrl.assignApprover);
router.delete('/approvers/:departmentId', ctrl.removeApprover);

module.exports = router;
