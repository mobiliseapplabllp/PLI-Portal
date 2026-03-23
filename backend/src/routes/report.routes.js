const router = require('express').Router();
const ctrl = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

// Quarterly — all roles (employees can view their own summary)
router.get('/quarterly', ctrl.quarterlyReport);

// Monthly — all roles (employees see own, managers see team, admin sees all)
router.get('/monthly', ctrl.monthlyReport);

// Manager + Admin only
router.get('/pending', authorize('manager', 'admin'), ctrl.pendingReport);
router.get('/export/excel', authorize('manager', 'admin'), ctrl.exportExcel);
router.get('/export/pdf', authorize('manager', 'admin'), ctrl.exportPdf);

// Admin only
router.get('/department', authorize('admin'), ctrl.departmentReport);

module.exports = router;
