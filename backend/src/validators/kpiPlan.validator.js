const { body, param } = require('express-validator');
const { KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');

const createPlanValidator = [
  body('financialYear')
    .trim()
    .matches(/^\d{4}-\d{2,4}$/)
    .withMessage('financialYear must be in format YYYY-YY or YYYY-YYYY (e.g. 2025-26)'),
  body('month')
    .isInt({ min: 1, max: 12 })
    .withMessage('month must be an integer between 1 and 12'),
  body('scope')
    .isIn(['team', 'department'])
    .withMessage('scope must be "team" or "department"'),
  body('managerId')
    .if(body('scope').equals('team'))
    .notEmpty()
    .withMessage('managerId is required for team-scoped plans')
    .isUUID()
    .withMessage('managerId must be a valid UUID'),
  body('departmentId')
    .if(body('scope').equals('department'))
    .notEmpty()
    .withMessage('departmentId is required for department-scoped plans')
    .isUUID()
    .withMessage('departmentId must be a valid UUID'),
];

const OPT = { checkFalsy: true }; // treat empty strings the same as absent

const addPlanItemValidator = [
  body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 512 }),
  body('category').isIn(KPI_CATEGORIES).withMessage(`category must be one of: ${KPI_CATEGORIES.join(', ')}`),
  body('unit').isIn(KPI_UNITS).withMessage(`unit must be one of: ${KPI_UNITS.join(', ')}`),
  body('monthlyWeightage')
    .isFloat({ min: 0.01, max: 100 })
    .withMessage('monthlyWeightage must be between 0.01 and 100'),
  body('quarterlyWeightage')
    .optional(OPT)
    .isFloat({ min: 0, max: 100 })
    .withMessage('quarterlyWeightage must be between 0 and 100'),
  body('targetValue')
    .optional(OPT)
    .isFloat()
    .withMessage('targetValue must be a number'),
  body('thresholdValue')
    .optional(OPT)
    .isFloat()
    .withMessage('thresholdValue must be a number'),
  body('stretchTarget')
    .optional(OPT)
    .isFloat()
    .withMessage('stretchTarget must be a number'),
];

const updatePlanItemValidator = [
  body('title').optional(OPT).trim().notEmpty().isLength({ max: 512 }),
  body('category').optional(OPT).isIn(KPI_CATEGORIES),
  body('unit').optional(OPT).isIn(KPI_UNITS),
  body('monthlyWeightage').optional(OPT).isFloat({ min: 0.01, max: 100 }),
  body('quarterlyWeightage').optional(OPT).isFloat({ min: 0, max: 100 }),
  body('targetValue').optional(OPT).isFloat(),
  body('thresholdValue').optional(OPT).isFloat(),
  body('stretchTarget').optional(OPT).isFloat(),
];

module.exports = { createPlanValidator, addPlanItemValidator, updatePlanItemValidator };
