const router = require('express').Router();
const { getLogs } = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getLogs);

module.exports = router;
