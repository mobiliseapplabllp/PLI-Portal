const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const ClientOrganisation = require('../models/csat/ClientOrganisation');
const ClientEmployee = require('../models/csat/ClientEmployee');
const User = require('../models/User');
const { NotFoundError, ConflictError } = require('../utils/errors');
const { createAuditLog } = require('../middleware/auditLogger');

// ── Client Organisations ──────────────────────────────────────────────────────

const listOrgs = async (query = {}) => {
  const { page = 1, limit = 20, search, isActive } = query;
  const where = {};
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (search) where.name = { [Op.like]: `%${search}%` };

  const total = await ClientOrganisation.count({ where });
  const orgs = await ClientOrganisation.findAll({
    where,
    include: [
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'employeeCode'] },
      { model: User, as: 'managedBy', attributes: ['id', 'name', 'employeeCode'], required: false },
    ],
    order: [['name', 'ASC']],
    offset: (page - 1) * limit,
    limit: Number(limit),
  });

  return {
    orgs,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  };
};

const getOrgById = async (id) => {
  const org = await ClientOrganisation.findByPk(id, {
    include: [
      { model: User, as: 'createdBy', attributes: ['id', 'name', 'employeeCode'] },
      { model: User, as: 'managedBy', attributes: ['id', 'name', 'employeeCode'], required: false },
    ],
  });
  if (!org) throw new NotFoundError('Client Organisation');
  return org;
};

const createOrg = async (data, createdBy) => {
  const org = await ClientOrganisation.create({ ...data, id: uuidv4(), createdById: createdBy });
  await createAuditLog({
    entityType: 'client_organisation', entityId: org.id,
    action: 'created', changedBy: createdBy,
    newValue: { name: org.name },
  });
  return org;
};

const updateOrg = async (id, data, updatedBy) => {
  const org = await ClientOrganisation.findByPk(id);
  if (!org) throw new NotFoundError('Client Organisation');
  const oldValue = { name: org.name, isActive: org.isActive };
  Object.assign(org, data);
  await org.save();
  await createAuditLog({
    entityType: 'client_organisation', entityId: org.id,
    action: 'updated', changedBy: updatedBy, oldValue, newValue: data,
  });
  return org;
};

// Soft-delete
const deleteOrg = async (id, deletedBy) => {
  const org = await ClientOrganisation.findByPk(id);
  if (!org) throw new NotFoundError('Client Organisation');
  org.isActive = false;
  await org.save();
  await createAuditLog({
    entityType: 'client_organisation', entityId: org.id,
    action: 'deleted', changedBy: deletedBy,
    oldValue: { isActive: true }, newValue: { isActive: false },
  });
};

// ── Client Employees ──────────────────────────────────────────────────────────

const listEmployees = async (orgId, query = {}) => {
  const org = await ClientOrganisation.findByPk(orgId);
  if (!org) throw new NotFoundError('Client Organisation');

  const { page = 1, limit = 50, search, isActive } = query;
  const where = { clientOrganisationId: orgId };
  if (isActive !== undefined) where.isActive = isActive === 'true';
  if (search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { email: { [Op.like]: `%${search}%` } },
    ];
  }

  const total = await ClientEmployee.count({ where });
  const employees = await ClientEmployee.findAll({
    where,
    order: [['name', 'ASC']],
    offset: (page - 1) * limit,
    limit: Number(limit),
  });

  return {
    employees,
    pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) },
  };
};

const createEmployee = async (orgId, data, createdBy) => {
  const org = await ClientOrganisation.findByPk(orgId);
  if (!org) throw new NotFoundError('Client Organisation');

  const existing = await ClientEmployee.findOne({
    where: { clientOrganisationId: orgId, email: data.email.toLowerCase() },
  });
  if (existing) throw new ConflictError('An employee with this email already exists in this organisation');

  const employee = await ClientEmployee.create({
    ...data,
    id: uuidv4(),
    clientOrganisationId: orgId,
    email: data.email.toLowerCase(),
  });

  await createAuditLog({
    entityType: 'client_employee', entityId: employee.id,
    action: 'created', changedBy: createdBy,
    newValue: { name: employee.name, email: employee.email, orgId },
  });

  return employee;
};

const updateEmployee = async (orgId, empId, data, updatedBy) => {
  const employee = await ClientEmployee.findOne({
    where: { id: empId, clientOrganisationId: orgId },
  });
  if (!employee) throw new NotFoundError('Client Employee');

  if (data.email && data.email.toLowerCase() !== employee.email) {
    const duplicate = await ClientEmployee.findOne({
      where: {
        clientOrganisationId: orgId,
        email: data.email.toLowerCase(),
        id: { [Op.ne]: empId },
      },
    });
    if (duplicate) throw new ConflictError('An employee with this email already exists in this organisation');
    data.email = data.email.toLowerCase();
  }

  const oldValue = { name: employee.name, email: employee.email, isActive: employee.isActive };
  Object.assign(employee, data);
  await employee.save();

  await createAuditLog({
    entityType: 'client_employee', entityId: employee.id,
    action: 'updated', changedBy: updatedBy, oldValue, newValue: data,
  });

  return employee;
};

const deleteEmployee = async (orgId, empId, deletedBy) => {
  const employee = await ClientEmployee.findOne({
    where: { id: empId, clientOrganisationId: orgId },
  });
  if (!employee) throw new NotFoundError('Client Employee');
  employee.isActive = false;
  await employee.save();
  await createAuditLog({
    entityType: 'client_employee', entityId: employee.id,
    action: 'deleted', changedBy: deletedBy,
    oldValue: { isActive: true }, newValue: { isActive: false },
  });
};

module.exports = {
  listOrgs, getOrgById, createOrg, updateOrg, deleteOrg,
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
};
