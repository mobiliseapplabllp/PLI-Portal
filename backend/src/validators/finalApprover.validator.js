const { body } = require('express-validator');
const { KPI_SUBMISSION_VALUES } = require('../config/constants');

const submitQuarterlyApprovalValidator = [
  body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
  body('items.*.id').isUUID().withMessage('Each item must have a valid UUID id'),
  body('items.*.finalStatus')
    .isIn(KPI_SUBMISSION_VALUES)
    .withMessage(`finalStatus must be one of: ${KPI_SUBMISSION_VALUES.join(', ')}`),
  body('items.*.quarterlyAchievedWeightage')
    .isFloat({ min: 0 })
    .withMessage('quarterlyAchievedWeightage must be a number >= 0'),
  body('items.*.finalComment').optional().trim(),
];

module.exports = { submitQuarterlyApprovalValidator };
