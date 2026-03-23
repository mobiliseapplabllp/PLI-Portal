const { body } = require('express-validator');

const createAssignmentValidator = [
  body('financialYear')
    .notEmpty().withMessage('Financial year is required')
    .matches(/^\d{4}-\d{2}$/).withMessage('Format: YYYY-YY'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be 1-12'),
  body('employee').isMongoId().withMessage('Valid employee ID required'),
  body('items').optional().isArray().withMessage('Items must be an array'),
  body('items.*.title').optional().notEmpty().withMessage('KPI title is required'),
  body('items.*.weightage').optional().isInt({ min: 1, max: 100 }).withMessage('Weightage 1-100'),
  body('items.*.targetValue').optional().isNumeric().withMessage('Target value must be numeric'),
];

const employeeSubmitValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isMongoId().withMessage('Valid KPI item ID required'),
  body('items.*.employeeValue').isNumeric().withMessage('Employee value is required'),
  body('items.*.employeeComment').optional().trim(),
];

const managerReviewValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isMongoId().withMessage('Valid KPI item ID required'),
  body('items.*.managerValue').isNumeric().withMessage('Manager value is required'),
  body('items.*.managerScore').isFloat({ min: 0, max: 100 }).withMessage('Score must be 0-100'),
  body('items.*.managerComment').optional().trim(),
];

const finalReviewValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isMongoId().withMessage('Valid KPI item ID required'),
  body('items.*.finalValue').isNumeric().withMessage('Final value is required'),
  body('items.*.finalScore').isFloat({ min: 0, max: 100 }).withMessage('Score must be 0-100'),
  body('items.*.finalComment').optional().trim(),
];

module.exports = {
  createAssignmentValidator,
  employeeSubmitValidator,
  managerReviewValidator,
  finalReviewValidator,
};
