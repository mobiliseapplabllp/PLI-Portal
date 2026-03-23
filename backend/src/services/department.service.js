const Department = require('../models/Department');
const { NotFoundError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

const getDepartments = async (query = {}) => {
  const filter = {};
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';

  return Department.find(filter).sort({ name: 1 });
};

const createDepartment = async (data, createdBy) => {
  const dept = await Department.create(data);

  await createAuditLog({
    entityType: 'department',
    entityId: dept._id,
    action: 'created',
    changedBy: createdBy,
    newValue: data,
  });

  return dept;
};

const updateDepartment = async (id, data, updatedBy) => {
  const dept = await Department.findById(id);
  if (!dept) throw new NotFoundError('Department');

  const oldValue = { code: dept.code, name: dept.name, isActive: dept.isActive };
  Object.assign(dept, data);
  await dept.save();

  await createAuditLog({
    entityType: 'department',
    entityId: dept._id,
    action: 'updated',
    changedBy: updatedBy,
    oldValue,
    newValue: data,
  });

  return dept;
};

module.exports = { getDepartments, createDepartment, updateDepartment };
