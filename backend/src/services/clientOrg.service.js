const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const ClientOrganisation = require('../models/csat/ClientOrganisation');
const ClientEmployee = require('../models/csat/ClientEmployee');
const User = require('../models/User');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
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

// ── Excel import (client organisations only) ─────────────────────────────────
// Template columns: A Name* · B Industry · C Description · D Managed By (user email)

const IMPORT_MAX_ROWS = 1000;

/** ExcelJS cell value → trimmed text (handles hyperlinks, rich text, formulas). */
const cellText = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text != null) return String(v.text).trim();                           // hyperlink (emails!)
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim();
    if (v.result != null) return String(v.result).trim();                       // formula
  }
  return String(v).trim();
};

/**
 * Validate import rows against the rules the Add form enforces plus import-only
 * ones: name required (≤255), industry ≤100, no duplicate name in the file, no
 * name that already exists (active or deactivated), Managed By must be an active
 * user's email. Names compare case- and space-insensitively.
 */
async function checkOrgRows(input) {
  const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const existing = await ClientOrganisation.findAll({ attributes: ['name', 'isActive'], raw: true });
  const existingByName = new Map(existing.map((o) => [norm(o.name), o]));

  const emails = [...new Set(input.map((r) => String(r.managedByEmail || '').trim().toLowerCase()).filter(Boolean))];
  const users = emails.length
    ? await User.findAll({ where: { email: { [Op.in]: emails }, isActive: true }, attributes: ['id', 'name', 'email'], raw: true })
    : [];
  const userByEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u]));

  const seen = new Map();   // normalised name → first row number
  const rows = input.map((r) => {
    const name = String(r.name || '').trim().replace(/\s+/g, ' ');
    const industry = String(r.industry || '').trim();
    const description = String(r.description || '').trim();
    const managedByEmail = String(r.managedByEmail || '').trim().toLowerCase();
    const errors = [];

    if (!name) errors.push('Name is required');
    else if (name.length > 255) errors.push('Name is longer than 255 characters');
    if (industry.length > 100) errors.push('Industry is longer than 100 characters');

    const key = norm(name);
    if (name) {
      const ex = existingByName.get(key);
      if (ex) errors.push(ex.isActive ? 'An organisation with this name already exists' : 'A deactivated organisation with this name already exists');
      if (seen.has(key)) errors.push(`Duplicate of row ${seen.get(key)} in this file`);
      else seen.set(key, r.rowNumber);
    }

    let managedBy = null;
    if (managedByEmail) {
      managedBy = userByEmail.get(managedByEmail) || null;
      if (!managedBy) errors.push(`No active user with email ${managedByEmail}`);
    }

    return {
      rowNumber: r.rowNumber, name, industry, description, managedByEmail,
      managedById: managedBy?.id || null, managedByName: managedBy?.name || null,
      errors, valid: errors.length === 0,
    };
  });

  const validCount = rows.filter((r) => r.valid).length;
  return { rows, totalRows: rows.length, validCount, errorCount: rows.length - validCount };
}

/** Parse the uploaded workbook and validate it — nothing is written. */
const validateOrgImport = async (buffer) => {
  if (!buffer) throw new ValidationError('Choose an Excel file (.xlsx) to upload');
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch { throw new ValidationError('The file is not a valid Excel workbook (.xlsx)'); }
  const ws = wb.worksheets[0];
  if (!ws) throw new ValidationError('No worksheet found in the file');

  const input = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;                                        // header
    const [, a, b, c, d] = row.values;
    const r = { rowNumber, name: cellText(a), industry: cellText(b), description: cellText(c), managedByEmail: cellText(d) };
    if (!r.name && !r.industry && !r.description && !r.managedByEmail) return;   // blank line
    input.push(r);
  });
  if (input.length === 0) throw new ValidationError('The file has no data rows under the header');
  if (input.length > IMPORT_MAX_ROWS) throw new ValidationError(`The file has ${input.length} rows — the limit is ${IMPORT_MAX_ROWS}. Split it into smaller files.`);
  return checkOrgRows(input);
};

/**
 * Create the valid rows. The client's validation is NOT trusted — rows are
 * re-checked here, and all inserts happen in one transaction.
 */
const commitOrgImport = async (rows, createdBy) => {
  if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError('No rows to import');
  if (rows.length > IMPORT_MAX_ROWS) throw new ValidationError(`At most ${IMPORT_MAX_ROWS} rows can be imported at once`);
  const checked = await checkOrgRows(rows.map((r) => ({
    rowNumber: r.rowNumber, name: r.name, industry: r.industry, description: r.description, managedByEmail: r.managedByEmail,
  })));
  const good = checked.rows.filter((r) => r.valid);

  const sequelize = require('../config/database');   // the instance — never destructure
  const created = [];
  await sequelize.transaction(async (t) => {
    for (const r of good) {
      const org = await ClientOrganisation.create({
        id: uuidv4(), name: r.name, industry: r.industry || null, description: r.description || null,
        managedById: r.managedById, createdById: createdBy,
      }, { transaction: t });
      created.push(org);
    }
  });
  for (const org of created) {
    await createAuditLog({
      entityType: 'client_organisation', entityId: org.id,
      action: 'created', changedBy: createdBy, newValue: { name: org.name, source: 'excel_import' },
    });
  }
  return {
    inserted: created.length,
    skipped: checked.rows.length - created.length,
    errors: checked.rows.filter((r) => !r.valid).map((r) => ({ row: r.rowNumber, name: r.name, errors: r.errors })),
  };
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
  validateOrgImport, commitOrgImport,
};
