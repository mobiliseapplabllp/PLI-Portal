const router = require('express').Router();
const ctrl = require('../../controllers/pm/pmSettings.controller');
const { authorize } = require('../../middleware/rbac');

router.get('/', authorize('admin'), ctrl.getSettings);
router.put('/', authorize('admin'), ctrl.updateSettings);

// Admin-only: manually trigger the daily report job (for testing)
router.post('/trigger-report', authorize('admin'), ctrl.triggerReport);

module.exports = router;
