const router = require('express').Router();
const { createItem, updateItem, deleteItem } = require('../controllers/kpiItem.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createItemValidator, updateItemValidator } = require('../validators/kpiItem.validator');

router.use(authenticate);

router.post('/', authorize('hr_admin', 'admin', 'sales_director'), createItemValidator, validate, createItem);
router.put('/:id', authorize('hr_admin', 'admin', 'sales_director'), updateItemValidator, validate, updateItem);
router.delete('/:id', authorize('hr_admin', 'admin', 'sales_director'), deleteItem);

module.exports = router;
