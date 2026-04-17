const router = require('express').Router();
const { createItem, updateItem, deleteItem } = require('../controllers/kpiItem.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createItemValidator, updateItemValidator } = require('../validators/kpiItem.validator');

router.use(authenticate);

// KPI items are now managed exclusively by HR Admin and Admin.
// Managers no longer have create/edit/delete access.
router.post('/', authorize('hr_admin', 'admin'), createItemValidator, validate, createItem);
router.put('/:id', authorize('hr_admin', 'admin'), updateItemValidator, validate, updateItem);
router.delete('/:id', authorize('hr_admin', 'admin'), deleteItem);

module.exports = router;
