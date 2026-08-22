const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const ctrl = require('../../controllers/roster/roster.controller');
const {
  createWeekValidator,
  updateEntryValidator,
  createSwapValidator,
  decideSwapValidator,
  availCompOffValidator,
} = require('../../validators/roster.validator');

router.use(authenticate);

// Roster managers: team managers + admin/hr (service layer scopes managers to their own team)
const MANAGERS = ['manager', 'senior_manager', 'sales_director', 'admin', 'hr_admin'];
const ALL = ['employee', 'manager', 'senior_manager', 'sales_director', 'hr_admin', 'final_approver', 'admin', 'md', 'director'];

// Module landing page + self-view — every authenticated role
router.get('/dashboard', authorize(...ALL), ctrl.getDashboard);
router.get('/my', authorize(...ALL), ctrl.getMyRoster);

// Weeks
router.get('/weeks', authorize(...MANAGERS), ctrl.listWeeks);
router.post('/weeks', authorize(...MANAGERS), createWeekValidator, validate, ctrl.createWeek);
router.get('/weeks/:weekId', authorize(...MANAGERS), ctrl.getWeek);
router.post('/weeks/:weekId/publish', authorize(...MANAGERS), ctrl.publishWeek);
router.get('/weeks/:weekId/export', authorize(...MANAGERS), ctrl.exportWeek);

// Entries
router.put('/entries/:entryId', authorize(...MANAGERS), updateEntryValidator, validate, ctrl.updateEntry);
router.post('/weeks/:weekId/bulk', authorize(...MANAGERS), ctrl.bulkUpdateWeek);

// Settings — admin/HR only (service re-asserts)
router.get('/settings', authorize(...MANAGERS), ctrl.getSettings);
router.put('/settings', authorize('admin', 'hr_admin'), ctrl.updateSettings);

// Company holidays
router.get('/holidays', authorize(...ALL), ctrl.listHolidays);
router.post('/holidays', authorize('admin', 'hr_admin'), ctrl.createHoliday);
router.delete('/holidays/:id', authorize('admin', 'hr_admin'), ctrl.deleteHoliday);

// Leave — managers record it for their own team, admin/HR for anyone
router.get('/leaves', authorize(...ALL), ctrl.listLeaves);
router.post('/leaves', authorize(...MANAGERS), ctrl.createLeave);
router.delete('/leaves/:id', authorize(...MANAGERS), ctrl.deleteLeave);

// Employee history + coverage dashboard
router.get('/history/:employeeId', authorize(...MANAGERS), ctrl.getEmployeeHistory);
router.get('/coverage', authorize(...MANAGERS), ctrl.getCoverage);

// Saturday trend matrix — company-wide and visible to every role by design
router.get('/trend', authorize(...ALL), ctrl.getTrend);
router.get('/trend/export', authorize(...ALL), ctrl.exportTrend);

// Swaps — employees create/accept/cancel; managers/admin decide
router.post('/weeks/:weekId/swaps', authorize(...ALL), createSwapValidator, validate, ctrl.createSwap);
router.get('/swaps', authorize(...ALL), ctrl.listSwaps);
router.post('/swaps/:id/accept', authorize(...ALL), ctrl.acceptSwap);
router.post('/swaps/:id/decide', authorize(...MANAGERS), decideSwapValidator, validate, ctrl.decideSwap);
router.post('/swaps/:id/cancel', authorize(...ALL), ctrl.cancelSwap);

// Comp-offs
router.get('/comp-offs', authorize(...ALL), ctrl.listCompOffs);
router.patch('/comp-offs/:id/avail', authorize(...MANAGERS), availCompOffValidator, validate, ctrl.availCompOff);

module.exports = router;
