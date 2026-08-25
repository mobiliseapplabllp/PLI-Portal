const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/financial.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager'];
const ALL      = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get ('/', authorize(...ALL),     ctrl.get);
router.put ('/', authorize(...MANAGERS), ctrl.upsert);

module.exports = router;
