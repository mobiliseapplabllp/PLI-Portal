const router = require('express').Router();
const ctrl = require('../../controllers/pm/pmSettings.controller');
const { authorize } = require('../../middleware/rbac');

router.get('/', authorize('admin'), ctrl.getSettings);
router.put('/', authorize('admin'), ctrl.updateSettings);

module.exports = router;
