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

const sendError = (res, message = 'Server error', statusCode = 500, details = null) => {
  const response = {
    success: false,
    error: {
      message,
    },
  };
  if (details) response.error.details = details;
  return res.status(statusCode).json(response);
};

module.exports = { sendSuccess, sendPaginated, sendError };
