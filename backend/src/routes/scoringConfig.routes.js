const router = require('express').Router();
const { getConfigs, createConfig, updateConfig } = require('../controllers/scoringConfig.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');
const { createScoringConfigValidator, updateScoringConfigValidator } = require('../validators/scoringConfig.validator');

router.use(authenticate);
router.use(authorize('admin'));

router.get('/', getConfigs);
router.post('/', createScoringConfigValidator, validate, createConfig);
router.put('/:id', updateScoringConfigValidator, validate, updateConfig);

module.exports = router;
