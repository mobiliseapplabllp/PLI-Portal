const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/statusReport.controller');
const { requirePermission } = require('../../core/rbac');


router.get   ('/',             requirePermission('pm.statusReport.view'),     ctrl.list);
router.post  ('/',             requirePermission('pm.statusReport.manage'), ctrl.create);
router.put   ('/:reportId',    requirePermission('pm.statusReport.manage'), ctrl.update);
router.delete('/:reportId',    requirePermission('pm.statusReport.manage'), ctrl.remove);

module.exports = router;
