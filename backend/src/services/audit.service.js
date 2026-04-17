const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const { Op } = require('sequelize');

const getLogs = async (query = {}) => {
  const where = {};
  if (query.entityType) where.entityType = query.entityType;
  if (query.entityId) where.entityId = query.entityId;
  if (query.action) where.action = query.action;
  if (query.changedBy) where.changedById = query.changedBy;

  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt[Op.gte] = new Date(query.from);
    if (query.to) where.createdAt[Op.lte] = new Date(query.to);
  }

  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;

  const total = await AuditLog.count({ where });
  const logs = await AuditLog.findAll({
    where,
    include: [{ model: User, as: 'changedBy', attributes: ['id', 'name', 'employeeCode'] }],
    order: [['createdAt', 'DESC']],
    offset: (page - 1) * limit,
    limit,
  });

  return {
    logs,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
};

module.exports = { getLogs };
