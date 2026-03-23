const KpiItem = require('../models/KpiItem');
const KpiAssignment = require('../models/KpiAssignment');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { KPI_STATUS } = require('../config/constants');
const { createAuditLog } = require('../middleware/auditLogger');

const createItem = async (data, user) => {
  const assignment = await KpiAssignment.findById(data.kpiAssignment);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  // Can only add items in draft or assigned status
  if (![KPI_STATUS.DRAFT, KPI_STATUS.ASSIGNED].includes(assignment.status)) {
    throw new ValidationError('Cannot add items after submission');
  }

  const item = await KpiItem.create(data);

  // Update total weightage
  const items = await KpiItem.find({ kpiAssignment: assignment._id });
  assignment.totalWeightage = items.reduce((sum, i) => sum + i.weightage, 0);
  await assignment.save();

  await createAuditLog({
    entityType: 'kpi_item',
    entityId: item._id,
    action: 'created',
    changedBy: user._id,
    newValue: { title: item.title, weightage: item.weightage },
  });

  return item;
};

const updateItem = async (id, data, user) => {
  const item = await KpiItem.findById(id);
  if (!item) throw new NotFoundError('KPI Item');

  const assignment = await KpiAssignment.findById(item.kpiAssignment);
  if (assignment && assignment.isLocked) {
    throw new ValidationError('Cannot edit items in a locked assignment');
  }

  const oldValue = { title: item.title, weightage: item.weightage, targetValue: item.targetValue };
  Object.assign(item, data);
  await item.save();

  // Recalculate total weightage
  if (data.weightage !== undefined && assignment) {
    const items = await KpiItem.find({ kpiAssignment: assignment._id });
    assignment.totalWeightage = items.reduce((sum, i) => sum + i.weightage, 0);
    await assignment.save();
  }

  await createAuditLog({
    entityType: 'kpi_item',
    entityId: item._id,
    action: 'updated',
    changedBy: user._id,
    oldValue,
    newValue: data,
  });

  return item;
};

const deleteItem = async (id, user) => {
  const item = await KpiItem.findById(id);
  if (!item) throw new NotFoundError('KPI Item');

  const assignment = await KpiAssignment.findById(item.kpiAssignment);
  if (assignment && assignment.status !== KPI_STATUS.DRAFT) {
    throw new ValidationError('Can only delete items in draft status');
  }

  await item.deleteOne();

  // Recalculate total weightage
  if (assignment) {
    const items = await KpiItem.find({ kpiAssignment: assignment._id });
    assignment.totalWeightage = items.reduce((sum, i) => sum + i.weightage, 0);
    await assignment.save();
  }

  await createAuditLog({
    entityType: 'kpi_item',
    entityId: item._id,
    action: 'deleted',
    changedBy: user._id,
  });

  return true;
};

module.exports = { createItem, updateItem, deleteItem };
