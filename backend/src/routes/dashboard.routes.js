const router = require('express').Router();
const { employeeDashboard, managerDashboard, adminDashboard } = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get('/employee', authorize('employee', 'manager', 'senior_manager', 'admin', 'sales_director'), employeeDashboard);
router.get('/manager', authorize('manager', 'senior_manager', 'admin', 'sales_director'), managerDashboard);
router.get('/admin', authorize('admin'), adminDashboard);

module.exports = router;
