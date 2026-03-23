const { AppError } = require('../utils/errors');

const errorHandler = (err, req, res, _next) => {
  // Mongoose validation error
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      error: { message: 'Validation failed', details },
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      error: { message: `Duplicate value for ${field}` },
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: { message: `Invalid ${err.path}: ${err.value}` },
    });
  }

  // Our custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message },
    });
  }

  // Unknown error
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    error: { message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' },
  });
};

module.exports = { errorHandler };
