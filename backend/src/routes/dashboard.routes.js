const router = require('express').Router();
const { employeeDashboard, managerDashboard, adminDashboard } = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get('/employee', authorize('employee', 'manager', 'admin'), employeeDashboard);
router.get('/manager', authorize('manager', 'admin'), managerDashboard);
router.get('/admin', authorize('admin'), adminDashboard);

module.exports = router;
