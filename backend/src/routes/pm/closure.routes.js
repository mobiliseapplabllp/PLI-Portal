const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/closure.controller');
const { requirePermission } = require('../../core/rbac');


router.get  ('/',      requirePermission('pm.closure.view'),     ctrl.get);
router.put  ('/',      requirePermission('pm.closure.manage'), ctrl.upsert);
router.post ('/close', requirePermission('pm.closure.manage'), ctrl.markClosed);

module.exports = router;
