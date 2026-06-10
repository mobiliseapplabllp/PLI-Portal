const router = require('express').Router({ mergeParams: true });
const ctrl = require('../../controllers/pm/dailyLog.controller');
const { authorize } = require('../../middleware/rbac');

const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getLogs);
router.post('/', authorize('admin', 'manager', 'senior_manager', 'employee'), ctrl.upsertTodayLog);
router.get('/:logId', authorize(...ALL), ctrl.getLogById);

module.exports = router;
