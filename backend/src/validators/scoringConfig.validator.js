const { body } = require('express-validator');

const createScoringConfigValidator = [
  body('financialYear')
    .notEmpty().withMessage('financialYear is required')
    .matches(/^\d{4}-\d{2}$/).withMessage('financialYear must be in YYYY-YY format (e.g. 2025-26)'),
  body('meetsMultiplier')
    .optional()
    .isNumeric().withMessage('meetsMultiplier must be a number'),
  body('belowMultiplier')
    .optional()
    .isNumeric().withMessage('belowMultiplier must be a number'),
  body('exceedsMultiplier')
    .optional()
    .isNumeric().withMessage('exceedsMultiplier must be a number'),
];

const updateScoringConfigValidator = [
  body('meetsMultiplier')
    .optional()
    .isNumeric().withMessage('meetsMultiplier must be a number'),
  body('belowMultiplier')
    .optional()
    .isNumeric().withMessage('belowMultiplier must be a number'),
  body('exceedsMultiplier')
    .optional()
    .isNumeric().withMessage('exceedsMultiplier must be a number'),
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean'),
];

module.exports = { createScoringConfigValidator, updateScoringConfigValidator };
