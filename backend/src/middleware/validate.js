const { validationResult } = require('express-validator');

/**
 * Middleware to check express-validator results
 * Place after validation chain in route definition
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        details: errors.array().map((e) => ({
          field: e.path,
          message: e.msg,
        })),
      },
    });
  }
  next();
};

module.exports = { validate };
