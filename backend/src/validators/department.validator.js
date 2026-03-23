const { body } = require('express-validator');

const createDepartmentValidator = [
  body('code').notEmpty().withMessage('Department code is required').trim(),
  body('name').notEmpty().withMessage('Department name is required').trim(),
];

const updateDepartmentValidator = [
  body('code').optional().notEmpty().withMessage('Code cannot be empty').trim(),
  body('name').optional().notEmpty().withMessage('Name cannot be empty').trim(),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

module.exports = { createDepartmentValidator, updateDepartmentValidator };
