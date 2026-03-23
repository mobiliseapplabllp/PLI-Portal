const router = require('express').Router();
const { getDepartments, createDepartment, updateDepartment } = require('../controllers/department.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createDepartmentValidator, updateDepartmentValidator } = require('../validators/department.validator');

router.use(authenticate);

router.get('/', authorize('admin', 'manager'), getDepartments);
router.post('/', authorize('admin'), createDepartmentValidator, validate, createDepartment);
router.put('/:id', authorize('admin'), updateDepartmentValidator, validate, updateDepartment);

module.exports = router;
