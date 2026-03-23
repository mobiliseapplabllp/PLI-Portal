const { body } = require('express-validator');
const { KPI_CATEGORIES, KPI_UNITS } = require('../config/constants');

const createItemValidator = [
  body('kpiAssignment').isMongoId().withMessage('Valid assignment ID required'),
  body('title').notEmpty().withMessage('Title is required').trim(),
  body('description').optional().trim(),
  body('category').optional().isIn(KPI_CATEGORIES).withMessage('Invalid category'),
  body('unit').optional().isIn(KPI_UNITS).withMessage('Invalid unit'),
  body('weightage').isInt({ min: 1, max: 100 }).withMessage('Weightage must be 1-100'),
  body('targetValue').isNumeric().withMessage('Target value is required'),
  body('thresholdValue').optional().isNumeric().withMessage('Must be numeric'),
  body('stretchTarget').optional().isNumeric().withMessage('Must be numeric'),
  body('remarks').optional().trim(),
];

const updateItemValidator = [
  body('title').optional().notEmpty().withMessage('Title cannot be empty').trim(),
  body('description').optional().trim(),
  body('category').optional().isIn(KPI_CATEGORIES).withMessage('Invalid category'),
  body('unit').optional().isIn(KPI_UNITS).withMessage('Invalid unit'),
  body('weightage').optional().isInt({ min: 1, max: 100 }).withMessage('Weightage must be 1-100'),
  body('targetValue').optional().isNumeric().withMessage('Must be numeric'),
  body('thresholdValue').optional().isNumeric().withMessage('Must be numeric'),
  body('stretchTarget').optional().isNumeric().withMessage('Must be numeric'),
  body('remarks').optional().trim(),
];

module.exports = { createItemValidator, updateItemValidator };
