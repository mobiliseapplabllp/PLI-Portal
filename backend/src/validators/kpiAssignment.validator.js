const { body } = require('express-validator');
const { KPI_SUBMISSION_VALUES } = require('../config/constants');

const createAssignmentValidator = [
  body('financialYear')
    .notEmpty().withMessage('Financial year is required')
    .matches(/^\d{4}-\d{2}$/).withMessage('Format: YYYY-YY'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be 1-12'),
  body('employee').isUUID().withMessage('Valid employee ID required'),
  body('items').optional().isArray().withMessage('Items must be an array'),
  body('items.*.title').optional().notEmpty().withMessage('KPI title is required'),
  body('items.*.weightage').optional().isInt({ min: 1, max: 100 }).withMessage('Weightage 1-100'),
  body('items.*.targetValue').optional().isNumeric().withMessage('Target value must be numeric'),
];

// Employee submits monthly commitment — commit value per item + optional plan comment
const commitValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isUUID().withMessage('Valid KPI item ID required'),
  body('items.*.commitValue').optional().trim(),
  body('items.*.employeeCommitmentComment').optional().trim(),
];

// Manager approves commitment
const approveCommitmentValidator = [];

// Manager rejects commitment with optional reason
const rejectCommitmentValidator = [
  body('rejectionComment').optional().trim(),
];

// Manager reviews commitment per item (approve/reject each KPI)
const reviewCommitmentValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isUUID().withMessage('Valid KPI item ID required'),
  body('items.*.approval')
    .isIn(['approved', 'rejected'])
    .withMessage('Approval must be "approved" or "rejected"'),
  body('items.*.comment').optional().trim(),
];

// UPDATED: Employee submits monthly achievement (end of month / beginning of next)
const employeeSubmitValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isUUID().withMessage('Valid KPI item ID required'),
  body('items.*.employeeStatus')
    .isIn(KPI_SUBMISSION_VALUES)
    .withMessage(`Achievement status must be one of: ${KPI_SUBMISSION_VALUES.join(', ')}`),
  body('items.*.employeeComment').optional().trim(),
];

// UPDATED: Manager reviews employee achievement with status (not numeric value)
const managerReviewValidator = [
  body('items').isArray({ min: 1 }).withMessage('Items array is required'),
  body('items.*.id').isUUID().withMessage('Valid KPI item ID required'),
  body('items.*.managerStatus')
    .isIn(KPI_SUBMISSION_VALUES)
    .withMessage(`Manager status must be one of: ${KPI_SUBMISSION_VALUES.join(', ')}`),
  body('items.*.managerComment').optional().trim(),
];

// LEGACY: finalReviewValidator kept for import compatibility only — route now returns 410
const finalReviewValidator = [];

module.exports = {
  createAssignmentValidator,
  commitValidator,
  approveCommitmentValidator,
  rejectCommitmentValidator,
  reviewCommitmentValidator,
  employeeSubmitValidator,
  managerReviewValidator,
  finalReviewValidator,
};
