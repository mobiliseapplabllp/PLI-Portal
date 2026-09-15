const router = require('express').Router();
const ctrl = require('../../controllers/pm/pmSettings.controller');
const { requirePermission } = require('../../core/rbac');

router.get('/', requirePermission('pm.settings.manage'), ctrl.getSettings);
router.put('/', requirePermission('pm.settings.manage'), ctrl.updateSettings);

// Admin-only: manually trigger the daily report job (for testing)
router.post('/trigger-report', requirePermission('pm.settings.manage'), ctrl.triggerReport);

module.exports = router;
