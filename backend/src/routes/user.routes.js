const router = require('express').Router();
const { getUsers, getUserById, createUser, updateUser, getTeam, getDesignations } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createUserValidator, updateUserValidator } = require('../validators/user.validator');

router.use(authenticate);

// Read-only employee directory (no passwordHash) — opened to all authenticated
// roles. A static role list can't express "whoever has been granted KPI
// Definer/Approver rights" (role-agnostic, see kpiDefinitionApproval.service.js),
// and this same list is already consumed broadly across tickets/projects/CSAT
// by roles beyond admin/manager/senior_manager.
router.get('/', getUsers);
router.post('/', authorize('admin'), createUserValidator, validate, createUser);
router.get('/designations', authorize('hr_admin', 'admin'), getDesignations);
router.get('/team/:managerId', authorize('admin', 'manager', 'senior_manager', 'sales_director'), getTeam);
router.get('/:id', authorize('admin', 'manager', 'senior_manager', 'employee', 'sales_director'), getUserById);
router.put('/:id', authorize('admin'), updateUserValidator, validate, updateUser);

module.exports = router;
