const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/raid.controller');
const { requirePermission } = require('../../core/rbac');


router.get   ('/',          requirePermission('pm.raid.view'),     ctrl.list);
router.post  ('/',          requirePermission('pm.raid.manage'), ctrl.create);
router.put   ('/:itemId',   requirePermission('pm.raid.manage'), ctrl.update);
router.delete('/:itemId',   requirePermission('pm.raid.manage'), ctrl.remove);

module.exports = router;
