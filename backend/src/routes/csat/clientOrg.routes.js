const router = require('express').Router();
const ctrl = require('../../controllers/clientOrg.controller');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createClientOrgValidator, updateClientOrgValidator,
  createClientEmployeeValidator, updateClientEmployeeValidator,
} = require('../../validators/csat.validator');

router.use(authenticate);

const ADMIN_ONLY = authorize('admin');
const CSAT_SENDERS = authorize('admin', 'manager', 'senior_manager');

// ── Client Organisations ──────────────────────────────────────────────────────
router.get('/',      CSAT_SENDERS, listOrgs_);
router.post('/',     ADMIN_ONLY, createClientOrgValidator, validate, createOrg_);
router.get('/:id',   CSAT_SENDERS, getOrg_);
router.put('/:id',   ADMIN_ONLY, updateClientOrgValidator, validate, updateOrg_);
router.delete('/:id', ADMIN_ONLY, deleteOrg_);

// ── Client Employees ──────────────────────────────────────────────────────────
router.get('/:id/employees',            CSAT_SENDERS, listEmployees_);
router.post('/:id/employees',           ADMIN_ONLY, createClientEmployeeValidator, validate, createEmployee_);
router.put('/:id/employees/:empId',     ADMIN_ONLY, updateClientEmployeeValidator, validate, updateEmployee_);
router.delete('/:id/employees/:empId',  ADMIN_ONLY, deleteEmployee_);

// Aliases to avoid name collision with Express router variable
function listOrgs_(req, res, next)      { ctrl.listOrgs(req, res, next); }
function getOrg_(req, res, next)        { ctrl.getOrg(req, res, next); }
function createOrg_(req, res, next)     { ctrl.createOrg(req, res, next); }
function updateOrg_(req, res, next)     { ctrl.updateOrg(req, res, next); }
function deleteOrg_(req, res, next)     { ctrl.deleteOrg(req, res, next); }
function listEmployees_(req, res, next)   { ctrl.listEmployees(req, res, next); }
function createEmployee_(req, res, next)  { ctrl.createEmployee(req, res, next); }
function updateEmployee_(req, res, next)  { ctrl.updateEmployee(req, res, next); }
function deleteEmployee_(req, res, next)  { ctrl.deleteEmployee(req, res, next); }

module.exports = router;
