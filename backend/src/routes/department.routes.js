const router = require('express').Router();
const { getDepartments, createDepartment, updateDepartment, getDepartmentRoles } = require('../controllers/department.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createDepartmentValidator, updateDepartmentValidator } = require('../validators/department.validator');

router.use(authenticate);

// 'employee' added so a user granted KPI Definer rights (often a plain
// employee — see kpiDefinitionDelegation.service.js) can populate the
// department picker on the Create/Edit KPI pages. Read-only, no sensitive data.
router.get('/', authorize('admin', 'hr_admin', 'manager', 'senior_manager', 'sales_director', 'employee'), getDepartments);
router.post('/', authorize('admin'), createDepartmentValidator, validate, createDepartment);
router.put('/:id', authorize('admin'), updateDepartmentValidator, validate, updateDepartment);
router.get('/:id/roles', authorize('admin', 'hr_admin', 'manager', 'senior_manager', 'sales_director', 'employee'), getDepartmentRoles);

module.exports = router;
