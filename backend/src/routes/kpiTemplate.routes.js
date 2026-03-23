const router = require('express').Router();
const { getTemplates, createTemplate, updateTemplate, deleteTemplate } = require('../controllers/kpiTemplate.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

// All authenticated users can read templates (managers need them when assigning)
router.get('/', getTemplates);

// Only admin can create/update/delete
router.post('/', authorize('admin'), createTemplate);
router.put('/:id', authorize('admin'), updateTemplate);
router.delete('/:id', authorize('admin'), deleteTemplate);

module.exports = router;
