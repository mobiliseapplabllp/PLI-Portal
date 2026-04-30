const { body } = require('express-validator');
const { KPI_CATEGORIES, KPI_UNITS, KPI_HEADS, KPI_ASSIGNED_TO, KPI_PLAN_STATUS } = require('../config/constants');

const createPlanValidator = [
  body('financialYear')
    .trim()
    .notEmpty()
    .withMessage('financialYear is required'),
  body('departmentId')
    .notEmpty()
    .withMessage('departmentId is required'),
  body('role')
    .optional({ checkFalsy: false })
    .isString()
    .withMessage('role must be a string'),
];

const OPT = { checkFalsy: true };

const addPlanItemValidator = [
  body('title').trim().notEmpty().withMessage('title is required').isLength({ max: 512 }),
  body('kpiHead')
    .isIn(KPI_HEADS)
    .withMessage(`kpiHead must be one of: ${KPI_HEADS.join(', ')}`),
  body('assignedTo')
    .isIn(KPI_ASSIGNED_TO)
    .withMessage(`assignedTo must be one of: ${KPI_ASSIGNED_TO.join(', ')}`),
  body('category').optional(OPT).isIn(KPI_CATEGORIES).withMessage(`category must be one of: ${KPI_CATEGORIES.join(', ')}`),
  body('unit').optional(OPT).isIn(KPI_UNITS).withMessage(`unit must be one of: ${KPI_UNITS.join(', ')}`),
  body('monthlyWeightage')
    .optional(OPT)
    .isFloat({ min: 0, max: 100 })
    .withMessage('monthlyWeightage must be between 0 and 100'),
  body('targetValue').optional(OPT).isFloat().withMessage('targetValue must be a number'),
  body('thresholdValue').optional(OPT).isFloat().withMessage('thresholdValue must be a number'),
  body('stretchTarget').optional(OPT).isFloat().withMessage('stretchTarget must be a number'),
];

const updatePlanItemValidator = [
  body('title').optional(OPT).trim().notEmpty().isLength({ max: 512 }),
  body('kpiHead').optional(OPT).isIn(KPI_HEADS),
  body('assignedTo').optional(OPT).isIn(KPI_ASSIGNED_TO),
  body('category').optional(OPT).isIn(KPI_CATEGORIES),
  body('unit').optional(OPT).isIn(KPI_UNITS),
  body('monthlyWeightage').optional(OPT).isFloat({ min: 0, max: 100 }),
  body('targetValue').optional(OPT).isFloat(),
  body('thresholdValue').optional(OPT).isFloat(),
  body('stretchTarget').optional(OPT).isFloat(),
];

const updatePlanStatusValidator = [
  body('status')
    .isIn(Object.values(KPI_PLAN_STATUS))
    .withMessage(`status must be one of: ${Object.values(KPI_PLAN_STATUS).join(', ')}`),
];

module.exports = {
  createPlanValidator,
  addPlanItemValidator,
  updatePlanItemValidator,
  updatePlanStatusValidator,
};
