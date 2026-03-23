const router = require('express').Router();
const { getRules, createRule, updateRule } = require('../controllers/pliRule.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createPliRuleValidator, updatePliRuleValidator } = require('../validators/pliRule.validator');

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getRules);
router.post('/', createPliRuleValidator, validate, createRule);
router.put('/:id', updatePliRuleValidator, validate, updateRule);

module.exports = router;
