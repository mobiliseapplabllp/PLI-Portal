const AuditLog = require('../models/AuditLog');

const getLogs = async (query = {}) => {
  const filter = {};
  if (query.entityType) filter.entityType = query.entityType;
  if (query.entityId) filter.entityId = query.entityId;
  if (query.action) filter.action = query.action;
  if (query.changedBy) filter.changedBy = query.changedBy;

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;

  const total = await AuditLog.countDocuments(filter);
  const logs = await AuditLog.find(filter)
    .populate('changedBy', 'name employeeCode')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return {
    logs,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

module.exports = { getLogs };
