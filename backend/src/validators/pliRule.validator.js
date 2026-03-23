const { body } = require('express-validator');

const createPliRuleValidator = [
  body('financialYear')
    .notEmpty().withMessage('Financial year is required')
    .matches(/^\d{4}-\d{2}$/).withMessage('Format: YYYY-YY'),
  body('quarter').isIn(['Q1', 'Q2', 'Q3', 'Q4']).withMessage('Invalid quarter'),
  body('slabs').isArray({ min: 1 }).withMessage('At least one slab is required'),
  body('slabs.*.minScore').isNumeric().withMessage('Min score required'),
  body('slabs.*.maxScore').isNumeric().withMessage('Max score required'),
  body('slabs.*.payoutPercentage').isNumeric().withMessage('Payout percentage required'),
  body('slabs.*.label').optional().trim(),
  body('remarks').optional().trim(),
];

const updatePliRuleValidator = [
  body('slabs').optional().isArray({ min: 1 }).withMessage('At least one slab is required'),
  body('slabs.*.minScore').optional().isNumeric(),
  body('slabs.*.maxScore').optional().isNumeric(),
  body('slabs.*.payoutPercentage').optional().isNumeric(),
  body('remarks').optional().trim(),
  body('isActive').optional().isBoolean(),
];

module.exports = { createPliRuleValidator, updatePliRuleValidator };
