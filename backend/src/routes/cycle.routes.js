const router = require('express').Router();
const { getCycles, createCycle, updateCycle } = require('../controllers/cycle.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createCycleValidator, updateCycleValidator } = require('../validators/cycle.validator');

router.use(authenticate);

router.get('/', getCycles);
router.post('/', authorize('admin'), createCycleValidator, validate, createCycle);
router.put('/:id', authorize('admin'), updateCycleValidator, validate, updateCycle);

module.exports = router;
