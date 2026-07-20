const clientOrgService = require('../services/clientOrg.service');
const { sendSuccess, sendPaginated } = require('../utils/response');

// ── Client Organisations ──────────────────────────────────────────────────────

const listOrgs = async (req, res, next) => {
  try {
    const { orgs, pagination } = await clientOrgService.listOrgs(req.query);
    sendPaginated(res, orgs, pagination);
  } catch (err) { next(err); }
};

const getOrg = async (req, res, next) => {
  try {
    const org = await clientOrgService.getOrgById(req.params.id);
    sendSuccess(res, org);
  } catch (err) { next(err); }
};

const createOrg = async (req, res, next) => {
  try {
    const org = await clientOrgService.createOrg(req.body, req.user._id);
    sendSuccess(res, org, 'Client organisation created', 201);
  } catch (err) { next(err); }
};

const updateOrg = async (req, res, next) => {
  try {
    const org = await clientOrgService.updateOrg(req.params.id, req.body, req.user._id);
    sendSuccess(res, org, 'Client organisation updated');
  } catch (err) { next(err); }
};

const deleteOrg = async (req, res, next) => {
  try {
    await clientOrgService.deleteOrg(req.params.id, req.user._id);
    sendSuccess(res, null, 'Client organisation deactivated');
  } catch (err) { next(err); }
};

// ── Client Employees ──────────────────────────────────────────────────────────

const listEmployees = async (req, res, next) => {
  try {
    const { employees, pagination } = await clientOrgService.listEmployees(req.params.id, req.query);
    sendPaginated(res, employees, pagination);
  } catch (err) { next(err); }
};

const createEmployee = async (req, res, next) => {
  try {
    const employee = await clientOrgService.createEmployee(req.params.id, req.body, req.user._id);
    sendSuccess(res, employee, 'Client employee created', 201);
  } catch (err) { next(err); }
};

const updateEmployee = async (req, res, next) => {
  try {
    const employee = await clientOrgService.updateEmployee(
      req.params.id, req.params.empId, req.body, req.user._id
    );
    sendSuccess(res, employee, 'Client employee updated');
  } catch (err) { next(err); }
};

const deleteEmployee = async (req, res, next) => {
  try {
    await clientOrgService.deleteEmployee(req.params.id, req.params.empId, req.user._id);
    sendSuccess(res, null, 'Client employee deactivated');
  } catch (err) { next(err); }
};

module.exports = {
  listOrgs, getOrg, createOrg, updateOrg, deleteOrg,
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
};
