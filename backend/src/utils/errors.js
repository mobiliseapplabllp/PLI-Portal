class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

/** 409 raised by the capacity engine; carries the engine result for the API body. */
class AllocationConflictError extends ConflictError {
  constructor(result, capacity) {
    super(result.message || 'Allocation exceeds capacity');
    this.conflict = {
      overDays:  result.overDays,
      ranges:    result.ranges,
      peak:      result.peak,
      remaining: result.remaining,
      capacity,
    };
  }
}

module.exports = { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError, AllocationConflictError };
