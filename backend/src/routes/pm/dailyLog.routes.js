const router = require('express').Router({ mergeParams: true });
const ctrl = require('../../controllers/pm/dailyLog.controller');
const { authorize } = require('../../middleware/rbac');

const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getLogs);
router.get('/today', authorize(...ALL), ctrl.getTodayLog);
router.post('/', authorize(...ALL), ctrl.upsertTodayLog);
router.get('/:logId', authorize(...ALL), ctrl.getLogById);

module.exports = router;
