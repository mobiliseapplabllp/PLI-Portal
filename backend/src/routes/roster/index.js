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

// Self-view — every authenticated role
router.get('/my', authorize(...ALL), ctrl.getMyRoster);

// Weeks
router.get('/weeks', authorize(...MANAGERS), ctrl.listWeeks);
router.post('/weeks', authorize(...MANAGERS), createWeekValidator, validate, ctrl.createWeek);
router.get('/weeks/:weekId', authorize(...MANAGERS), ctrl.getWeek);
router.post('/weeks/:weekId/publish', authorize(...MANAGERS), ctrl.publishWeek);
router.get('/weeks/:weekId/export', authorize(...MANAGERS), ctrl.exportWeek);

// Entries
router.put('/entries/:entryId', authorize(...MANAGERS), updateEntryValidator, validate, ctrl.updateEntry);

// Employee history + coverage dashboard
router.get('/history/:employeeId', authorize(...MANAGERS), ctrl.getEmployeeHistory);
router.get('/coverage', authorize(...MANAGERS), ctrl.getCoverage);

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
