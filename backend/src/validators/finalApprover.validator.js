const { body } = require('express-validator');

const submitQuarterlyApprovalValidator = [
  // overrideEarned: optional numeric — FA's total earned weightage sum (raw, e.g. 24.86)
  // When omitted the backend uses the system-calculated sum from QA items.
  body('overrideEarned')
    .optional({ nullable: true })
    .isFloat()
    .withMessage('overrideEarned must be a number'),

  // overrideComment: required only when FA earned differs from calculated (enforced in service)
  body('overrideComment')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('overrideComment must be a string under 1000 characters'),
];

module.exports = { submitQuarterlyApprovalValidator };
