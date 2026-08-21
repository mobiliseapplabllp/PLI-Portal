const { body } = require('express-validator');
const { OTP_CONFIG } = require('../config/constants');

// Authentication is email-OTP only — no password validators remain.
const otpRequestValidator = [
  body('identifier')
    .notEmpty().withMessage('Email or Employee ID is required')
    .isLength({ max: 255 }).withMessage('Invalid identifier')
    .trim(),
];

const otpVerifyValidator = [
  body('identifier')
    .notEmpty().withMessage('Email or Employee ID is required')
    .isLength({ max: 255 }).withMessage('Invalid identifier')
    .trim(),
  body('code')
    .trim()
    .matches(new RegExp(`^\\d{${OTP_CONFIG.LENGTH}}$`))
    .withMessage(`Enter the ${OTP_CONFIG.LENGTH}-digit code`),
];

module.exports = { otpRequestValidator, otpVerifyValidator };
