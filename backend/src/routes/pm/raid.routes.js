const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/raid.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager'];
const ALL      = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get   ('/',          authorize(...ALL),     ctrl.list);
router.post  ('/',          authorize(...MANAGERS), ctrl.create);
router.put   ('/:itemId',   authorize(...MANAGERS), ctrl.update);
router.delete('/:itemId',   authorize(...MANAGERS), ctrl.remove);

module.exports = router;
