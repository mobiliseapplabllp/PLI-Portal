const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/departments', require('./department.routes'));
router.use('/appraisal-cycles', require('./cycle.routes'));
router.use('/kpi-assignments', require('./kpiAssignment.routes'));
router.use('/kpi-items', require('./kpiItem.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/reports', require('./report.routes'));
router.use('/kpi-templates', require('./kpiTemplate.routes'));
router.use('/pli-rules', require('./pliRule.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/audit-logs', require('./audit.routes'));

module.exports = router;
