const KpiItem = require('../models/KpiItem');
const KpiAssignment = require('../models/KpiAssignment');
const User = require('../models/User');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors');
const { KPI_STATUS } = require('../config/constants');
const { createAuditLog } = require('../middleware/auditLogger');

const assertSalesDeptItemAccess = async (assignment, user) => {
  if (user.role !== 'sales_director') return;
  const employee = await User.findByPk(assignment.employeeId, { attributes: ['departmentId'] });
  if (!employee || String(employee.departmentId) !== String(user.departmentId))
    throw new ForbiddenError('Access denied — you can only manage KPI items for your own department.');
};

const createItem = async (data, user) => {
  const assignmentId = data.kpiAssignment || data.kpiAssignmentId;
  const assignment = await KpiAssignment.findByPk(assignmentId);
  if (!assignment) throw new NotFoundError('KPI Assignment');

  await assertSalesDeptItemAccess(assignment, user);

  if (![KPI_STATUS.DRAFT, KPI_STATUS.ASSIGNED].includes(assignment.status)) {
    throw new ValidationError('Cannot add items after submission');
  }

  const { kpiAssignment, ...rest } = data;
  const item = await KpiItem.create({
    ...rest,
    kpiAssignmentId: assignmentId,
  });

  const items = await KpiItem.findAll({ where: { kpiAssignmentId: assignment.id } });
  assignment.totalWeightage = items.reduce((sum, i) => sum + Number(i.weightage), 0);
  await assignment.save();

  await createAuditLog({
    entityType: 'kpi_item',
    entityId: item.id,
    action: 'created',
    changedBy: user._id,
    newValue: { title: item.title, weightage: item.weightage },
  });

  return item;
};

const updateItem = async (id, data, user) => {
  const item = await KpiItem.findByPk(id);
  if (!item) throw new NotFoundError('KPI Item');

  const assignment = await KpiAssignment.findByPk(item.kpiAssignmentId);
  if (assignment) await assertSalesDeptItemAccess(assignment, user);
  if (assignment && assignment.isLocked) {
    throw new ValidationError('Cannot edit items in a locked assignment');
  }

  const oldValue = { title: item.title, weightage: item.weightage, targetValue: item.targetValue };
  Object.assign(item, data);
  await item.save();

  if (data.weightage !== undefined && assignment) {
    const items = await KpiItem.findAll({ where: { kpiAssignmentId: assignment.id } });
    assignment.totalWeightage = items.reduce((sum, i) => sum + Number(i.weightage), 0);
    await assignment.save();
  }

  await createAuditLog({
    entityType: 'kpi_item',
    entityId: item.id,
    action: 'updated',
    changedBy: user._id,
    oldValue,
    newValue: data,
  });

  return item;
};

const deleteItem = async (id, user) => {
  const item = await KpiItem.findByPk(id);
  if (!item) throw new NotFoundError('KPI Item');

  const assignment = await KpiAssignment.findByPk(item.kpiAssignmentId);
  if (assignment) await assertSalesDeptItemAccess(assignment, user);
  if (assignment && assignment.status !== KPI_STATUS.DRAFT) {
    throw new ValidationError('Can only delete items in draft status');
  }

  await item.destroy();

  if (assignment) {
    const items = await KpiItem.findAll({ where: { kpiAssignmentId: assignment.id } });
    assignment.totalWeightage = items.reduce((sum, i) => sum + Number(i.weightage), 0);
    await assignment.save();
  }

  await createAuditLog({
    entityType: 'kpi_item',
    entityId: id,
    action: 'deleted',
    changedBy: user._id,
  });

  return true;
};

module.exports = { createItem, updateItem, deleteItem };
