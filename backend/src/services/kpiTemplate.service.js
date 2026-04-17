const { Op } = require('sequelize');
const KpiTemplate = require('../models/KpiTemplate');
const User = require('../models/User');
const { NotFoundError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const getTemplates = async (query = {}) => {
  const where = {};
  if (query.search) {
    where.name = { [Op.like]: `%${query.search}%` };
  }
  if (query.category) {
    where.category = query.category;
  }
  if (query.includeInactive !== 'true') {
    where.isActive = true;
  }

  return KpiTemplate.findAll({
    where,
    include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }],
    order: [
      ['category', 'ASC'],
      ['name', 'ASC'],
    ],
  });
};

const createTemplate = async (data, userId) => {
  const template = await KpiTemplate.create({ ...data, createdById: userId });

  await createAuditLog({
    entityType: 'kpi_template',
    entityId: template.id,
    action: 'created',
    changedBy: userId,
    newValue: { name: data.name, category: data.category },
  });

  return template;
};

const updateTemplate = async (id, data) => {
  const template = await KpiTemplate.findByPk(id);
  if (!template) throw new NotFoundError('KPI Template');

  const oldValue = { name: template.name, category: template.category };
  const patch = { ...data };
  delete patch.updatedBy;
  Object.assign(template, patch);
  await template.save();

  await createAuditLog({
    entityType: 'kpi_template',
    entityId: template.id,
    action: 'updated',
    changedBy: data.updatedBy || template.createdById,
    oldValue,
    newValue: data,
  });

  return template;
};

const deleteTemplate = async (id) => {
  const template = await KpiTemplate.findByPk(id);
  if (!template) throw new NotFoundError('KPI Template');

  template.isActive = false;
  await template.save();

  await createAuditLog({
    entityType: 'kpi_template',
    entityId: template.id,
    action: 'deleted',
    changedBy: template.createdById,
    oldValue: { isActive: true },
    newValue: { isActive: false },
  });

  return template;
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate };
