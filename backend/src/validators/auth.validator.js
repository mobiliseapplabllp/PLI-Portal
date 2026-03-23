const { body } = require('express-validator');

const loginValidator = [
  body('identifier').notEmpty().withMessage('Email or Employee ID is required').trim(),
  body('password').notEmpty().withMessage('Password is required'),
];

const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
];

module.exports = { loginValidator, changePasswordValidator };
