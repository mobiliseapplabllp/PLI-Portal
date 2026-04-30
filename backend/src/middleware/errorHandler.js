const { ValidationError, UniqueConstraintError } = require('sequelize');
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  const label = `${req.method} ${req.url}`;
  // UniqueConstraintError MUST be checked before ValidationError —
  // in Sequelize v6, UniqueConstraintError extends ValidationError, so the
  // ValidationError branch would otherwise catch it and leak raw index names.
  if (err instanceof UniqueConstraintError) {
    const sqlMsg = err.parent?.sqlMessage || err.message || '';
    const isKpiPlanDuplicate =
      sqlMsg.includes('kpi_plans') ||
      sqlMsg.includes('unique_dept') ||
      sqlMsg.includes('unique_team') ||
      (err.errors?.[0]?.path && ['financialYear', 'departmentId', 'role'].includes(err.errors[0].path));
    const message = isKpiPlanDuplicate
      ? 'A KPI plan already exists for this Department, Financial Year, and Role combination. Use Edit KPI to modify it.'
      : 'A record with this value already exists.';
    logger.warn(`[409 Duplicate] ${label} — ${message}`);
    return res.status(409).json({ success: false, error: { message, duplicate: true } });
  }

  if (err instanceof ValidationError) {
    const details = err.errors.map((e) => ({ field: e.path, message: e.message }));
    logger.warn(`[400 Validation] ${label} — ${details.map((d) => `${d.field}: ${d.message}`).join(', ')}`);
    return res.status(400).json({
      success: false,
      error: { message: 'Validation failed', details },
    });
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    logger.warn(`[400 FK] ${label} — ${err.message}`);
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
    logger.error(`[503 DB] ${label} — ${err.message}`);
    return res.status(503).json({
      success: false,
      error: { message: 'Database unavailable. Please try again shortly.' },
    });
  }

  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    logger[level](`[${err.statusCode} AppError] ${label} — ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message },
    });
  }

  logger.error(`[500 Unhandled] ${label}`, err);
  return res.status(500).json({
    success: false,
    error: { message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' },
  });
};

module.exports = { errorHandler };
