const { ValidationError, UniqueConstraintError } = require('sequelize');
const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, _next) => {
  if (err instanceof ValidationError) {
    const details = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      error: { message: 'Validation failed', details },
    });
  }

  if (err instanceof UniqueConstraintError) {
    const field = err.errors?.[0]?.path || 'field';
    return res.status(409).json({
      success: false,
      error: { message: `Duplicate value for ${field}` },
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      success: false,
      error: { message: 'Invalid reference (foreign key constraint)' },
    });
  }

  if (
    err.name === 'SequelizeConnectionError' ||
    err.name === 'SequelizeConnectionRefusedError' ||
    err.name === 'SequelizeHostNotReachableError' ||
    err.name === 'SequelizeAccessDeniedError'
  ) {
    return res.status(503).json({
      success: false,
      error: { message: 'Database unavailable. Please try again shortly.' },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message },
    });
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    error: { message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' },
  });
};

module.exports = { errorHandler };
