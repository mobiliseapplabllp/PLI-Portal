/**
 * Standardized API response helpers
 */
const { renameIdsForClient } = require('./renameIds');

const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  const payload = data !== undefined && data !== null ? renameIdsForClient(data) : data;
  return res.status(statusCode).json({
    success: true,
    message,
    data: payload,
  });
};

const sendPaginated = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data: renameIdsForClient(data),
    pagination,
  });
};

/**
 * Unified error body: { success:false, message, error:{ message, ...extra } }.
 * `message` is duplicated at the top level and under `error` because callers
 * read either path (PM pages: data.message; helpdesk/KPI thunks: data.error.message).
 *
 * @param details  optional → error.details
 * @param extra    optional extra fields kept for existing readers: every key except
 *                 `error` goes at the top level (e.g. { conflict }); `extra.error`
 *                 is merged into the error object (e.g. { error: { code } }).
 *                 success / message / error.message cannot be overridden.
 */
const sendError = (res, message = 'Server error', statusCode = 500, details = null, extra = null) => {
  const response = {
    success: false,
    message,
    error: {
      message,
    },
  };
  if (details) response.error.details = details;
  if (extra) {
    const { error: errorExtra, success: _s, message: _m, ...top } = extra;
    Object.assign(response, top);
    if (errorExtra && typeof errorExtra === 'object') {
      Object.assign(response.error, errorExtra, { message });
    }
  }
  return res.status(statusCode).json(response);
};

module.exports = { sendSuccess, sendPaginated, sendError };
