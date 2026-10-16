const { body } = require('express-validator');
const { CYCLE_STATUS } = require('../config/constants');

const createCycleValidator = [
  body('financialYear')
    .notEmpty().withMessage('Financial year is required')
    .matches(/^\d{4}-\d{2}$/).withMessage('Financial year format must be YYYY-YY (e.g., 2026-27)'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  // Department-wise cycles — omit/null = applies to every department (the global fallback).
  body('departmentId').optional({ nullable: true }).isUUID().withMessage('departmentId must be a valid UUID'),
  body('employeeSubmissionDeadline').optional().isISO8601().withMessage('Invalid date'),
  body('managerReviewDeadline').optional().isISO8601().withMessage('Invalid date'),
  body('finalReviewDeadline').optional().isISO8601().withMessage('Invalid date'),
];

const updateCycleValidator = [
  body('departmentId').optional({ nullable: true }).isUUID().withMessage('departmentId must be a valid UUID'),
  body('employeeSubmissionDeadline').optional().isISO8601().withMessage('Invalid date'),
  body('managerReviewDeadline').optional().isISO8601().withMessage('Invalid date'),
  body('finalReviewDeadline').optional().isISO8601().withMessage('Invalid date'),
  body('status').optional().isIn(Object.values(CYCLE_STATUS)).withMessage('Invalid cycle status'),
];

module.exports = { createCycleValidator, updateCycleValidator };
