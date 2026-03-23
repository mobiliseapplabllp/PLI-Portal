const AuditLog = require('../models/AuditLog');

/**
 * Create an audit log entry
 */
const createAuditLog = async ({ entityType, entityId, action, changedBy, oldValue, newValue, ipAddress }) => {
  try {
    await AuditLog.create({
      entityType,
      entityId,
      action,
      changedBy,
      oldValue,
      newValue,
      ipAddress,
    });
  } catch (error) {
    // Don't throw — audit failures should not break the main flow
    console.error('Audit log error:', error.message);
  }
};

module.exports = { createAuditLog };
