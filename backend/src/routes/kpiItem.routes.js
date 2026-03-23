const router = require('express').Router();
const { createItem, updateItem, deleteItem } = require('../controllers/kpiItem.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createItemValidator, updateItemValidator } = require('../validators/kpiItem.validator');

router.use(authenticate);

router.post('/', authorize('manager', 'admin'), createItemValidator, validate, createItem);
router.put('/:id', authorize('manager', 'admin'), updateItemValidator, validate, updateItem);
router.delete('/:id', authorize('manager', 'admin'), deleteItem);

module.exports = router;
