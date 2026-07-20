const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createSurveyValidator,
  updateSurveyValidator,
} = require('../../validators/csat.validator');
const ctrl = require('../../controllers/survey.controller');

const ADMIN_ONLY = [authenticate, authorize('admin')];
const CAN_VIEW = [authenticate, authorize('admin', 'manager', 'senior_manager', 'hr_admin', 'final_approver')];

router.get('/', ...CAN_VIEW, ctrl.listSurveys);
router.post('/', ...ADMIN_ONLY, createSurveyValidator, validate, ctrl.createSurvey);
router.get('/:id', ...CAN_VIEW, ctrl.getSurvey);
router.put('/:id', ...ADMIN_ONLY, updateSurveyValidator, validate, ctrl.updateSurvey);
router.patch('/:id/publish', ...ADMIN_ONLY, ctrl.publishSurvey);
router.delete('/:id', ...ADMIN_ONLY, ctrl.archiveSurvey);

module.exports = router;
