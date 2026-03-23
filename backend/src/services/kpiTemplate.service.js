const KpiTemplate = require('../models/KpiTemplate');
const { NotFoundError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const getTemplates = async (query = {}) => {
  const filter = { isActive: true };

  if (query.search) {
    filter.name = { $regex: query.search, $options: 'i' };
  }
  if (query.category) {
    filter.category = query.category;
  }
  if (query.includeInactive === 'true') {
    delete filter.isActive;
  }

  return KpiTemplate.find(filter)
    .populate('createdBy', 'name')
    .sort({ category: 1, name: 1 });
};

const createTemplate = async (data, userId) => {
  data.createdBy = userId;
  const template = await KpiTemplate.create(data);

  await createAuditLog({
    entityType: 'kpi_template',
    entityId: template._id,
    action: 'created',
    changedBy: userId,
    newValue: { name: data.name, category: data.category },
  });

  return template;
};

const updateTemplate = async (id, data) => {
  const template = await KpiTemplate.findById(id);
  if (!template) throw new NotFoundError('KPI Template');

  const oldValue = { name: template.name, category: template.category };
  Object.assign(template, data);
  await template.save();

  await createAuditLog({
    entityType: 'kpi_template',
    entityId: template._id,
    action: 'updated',
    changedBy: data.updatedBy || template.createdBy,
    oldValue,
    newValue: data,
  });

  return template;
};

const deleteTemplate = async (id) => {
  const template = await KpiTemplate.findById(id);
  if (!template) throw new NotFoundError('KPI Template');

  template.isActive = false;
  await template.save();

  await createAuditLog({
    entityType: 'kpi_template',
    entityId: template._id,
    action: 'deleted',
    changedBy: template.createdBy,
    oldValue: { isActive: true },
    newValue: { isActive: false },
  });

  return template;
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate };
