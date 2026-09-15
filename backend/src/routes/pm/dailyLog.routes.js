const router = require('express').Router({ mergeParams: true });
const ctrl = require('../../controllers/pm/dailyLog.controller');
const { requirePermission } = require('../../core/rbac');


router.get('/', requirePermission('pm.dailyLog.view'), ctrl.getLogs);
router.get('/today', requirePermission('pm.dailyLog.view'), ctrl.getTodayLog);
router.post('/', requirePermission('pm.dailyLog.write'), ctrl.upsertTodayLog);
router.get('/:logId', requirePermission('pm.dailyLog.view'), ctrl.getLogById);

module.exports = router;
