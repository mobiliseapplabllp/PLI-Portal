const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/financial.controller');
const { requirePermission } = require('../../core/rbac');


router.get ('/', requirePermission('pm.financial.view'),     ctrl.get);
router.put ('/', requirePermission('pm.financial.manage'), ctrl.upsert);

module.exports = router;
