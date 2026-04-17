const { body } = require('express-validator');
const { ROLES } = require('../config/constants');

const createUserValidator = [
  body('employeeCode').notEmpty().withMessage('Employee code is required').trim(),
  body('name').notEmpty().withMessage('Name is required').trim(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(Object.values(ROLES)).withMessage('Invalid role'),
  body('phone').optional().trim(),
  body('department').optional().isUUID().withMessage('Invalid department ID'),
  body('designation').optional().trim(),
  body('joiningDate').optional().isISO8601().withMessage('Invalid date format'),
  body('manager').optional().isUUID().withMessage('Invalid manager ID'),
  body('kpiReviewApplicable').optional().isBoolean().withMessage('Must be boolean'),
];

const updateUserValidator = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role').optional().isIn(Object.values(ROLES)).withMessage('Invalid role'),
  body('phone').optional().trim(),
  body('department').optional().isUUID().withMessage('Invalid department ID'),
  body('designation').optional().trim(),
  body('joiningDate').optional().isISO8601().withMessage('Invalid date format'),
  body('manager').optional(),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  body('kpiReviewApplicable').optional().isBoolean().withMessage('Must be boolean'),
];

module.exports = { createUserValidator, updateUserValidator };
