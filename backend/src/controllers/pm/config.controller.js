/**
 * PM Configuration Controller
 * Manages: Project Types, Project Statuses, Milestone Templates
 */
const { sendSuccess, sendError } = require('../../utils/response');
const PmProjectType       = require('../../models/pm/PmProjectType');
const PmStatus            = require('../../models/pm/PmStatus');
const PmMilestoneTemplate = require('../../models/pm/PmMilestoneTemplate');

// ── Project Types ─────────────────────────────────────────────────────────────

const getProjectTypes = async (req, res, next) => {
  try {
    const types = await PmProjectType.findAll({ order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
    sendSuccess(res, types);
  } catch (e) { next(e); }
};

const createProjectType = async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name) return sendError(res, 'name is required', 400);
    const existing = await PmProjectType.findOne({ where: { name } });
    if (existing) return sendError(res, `Project type "${name}" already exists`, 409);
    const maxOrder = await PmProjectType.max('sortOrder') || 0;
    const type = await PmProjectType.create({ name, sortOrder: sortOrder ?? maxOrder + 1 });
    sendSuccess(res, type, 'Project type created', 201);
  } catch (e) { next(e); }
};

const updateProjectType = async (req, res, next) => {
  try {
    const type = await PmProjectType.findByPk(req.params.id);
    if (!type) return sendError(res, 'Project type not found', 404);
    const { name, isActive, sortOrder } = req.body;
    if (name !== undefined) type.name = name;
    if (isActive !== undefined) type.isActive = isActive;
    if (sortOrder !== undefined) type.sortOrder = sortOrder;
    await type.save();
    sendSuccess(res, type, 'Project type updated');
  } catch (e) { next(e); }
};

const deleteProjectType = async (req, res, next) => {
  try {
    const type = await PmProjectType.findByPk(req.params.id);
    if (!type) return sendError(res, 'Project type not found', 404);
    // Check if in use
    const Project = require('../../models/pm/Project');
    const count = await Project.count({ where: { projectType: type.name } });
    if (count > 0) {
      return sendError(res, `Cannot delete: ${count} project(s) use this type. Disable it instead.`, 409);
    }
    await type.destroy();
    sendSuccess(res, null, 'Project type deleted');
  } catch (e) { next(e); }
};

// ── Project Statuses ──────────────────────────────────────────────────────────

const getStatuses = async (req, res, next) => {
  try {
    const where = { isActive: true };
    if (req.query.scope === 'project')       where.forProject      = true;
    if (req.query.scope === 'milestone')     where.forMilestone    = true;
    if (req.query.scope === 'sub_milestone') where.forSubMilestone = true;
    const statuses = await PmStatus.findAll({ where, order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
    sendSuccess(res, statuses);
  } catch (e) { next(e); }
};

const getAllStatuses = async (req, res, next) => {
  try {
    const statuses = await PmStatus.findAll({ order: [['sortOrder', 'ASC'], ['name', 'ASC']] });
    sendSuccess(res, statuses);
  } catch (e) { next(e); }
};

const createStatus = async (req, res, next) => {
  try {
    const { name, color, sortOrder, forProject, forMilestone, forSubMilestone } = req.body;
    if (!name) return sendError(res, 'name is required', 400);
    if (!forProject && !forMilestone && !forSubMilestone) {
      return sendError(res, 'At least one scope (project, milestone, or sub-milestone) must be selected.', 400);
    }
    const existing = await PmStatus.findOne({ where: { name } });
    if (existing) return sendError(res, `Status "${name}" already exists`, 409);
    const maxOrder = await PmStatus.max('sortOrder') || 0;
    const status = await PmStatus.create({
      name,
      color: color || '#6B7280',
      sortOrder: sortOrder ?? maxOrder + 1,
      forProject:      forProject      ?? true,
      forMilestone:    forMilestone    ?? true,
      forSubMilestone: forSubMilestone ?? false,
    });
    sendSuccess(res, status, 'Status created', 201);
  } catch (e) { next(e); }
};

const updateStatus = async (req, res, next) => {
  try {
    const status = await PmStatus.findByPk(req.params.id);
    if (!status) return sendError(res, 'Status not found', 404);
    const { name, color, isActive, sortOrder, forProject, forMilestone, forSubMilestone } = req.body;
    // Determine effective scope values after applying incoming changes
    const effectiveForProject      = forProject      !== undefined ? forProject      : status.forProject;
    const effectiveForMilestone    = forMilestone    !== undefined ? forMilestone    : status.forMilestone;
    const effectiveForSubMilestone = forSubMilestone !== undefined ? forSubMilestone : status.forSubMilestone;
    if (!effectiveForProject && !effectiveForMilestone && !effectiveForSubMilestone) {
      return sendError(res, 'At least one scope (project, milestone, or sub-milestone) must be selected.', 400);
    }
    if (name !== undefined)           status.name           = name;
    if (color !== undefined)          status.color          = color;
    if (isActive !== undefined)       status.isActive       = isActive;
    if (sortOrder !== undefined)      status.sortOrder      = sortOrder;
    if (forProject !== undefined)      status.forProject      = forProject;
    if (forMilestone !== undefined)    status.forMilestone    = forMilestone;
    if (forSubMilestone !== undefined) status.forSubMilestone = forSubMilestone;
    await status.save();
    sendSuccess(res, status, 'Status updated');
  } catch (e) { next(e); }
};

const deleteStatus = async (req, res, next) => {
  try {
    const status = await PmStatus.findByPk(req.params.id);
    if (!status) return sendError(res, 'Status not found', 404);
    if (status.isSystem) return sendError(res, 'System status cannot be deleted', 403);
    await status.destroy();
    sendSuccess(res, null, 'Status deleted');
  } catch (e) { next(e); }
};

// ── Milestone Templates ───────────────────────────────────────────────────────

const getMilestoneTemplates = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.projectType) where.projectType = req.query.projectType;
    if (req.query.activeOnly !== 'false') where.isActive = true;
    const templates = await PmMilestoneTemplate.findAll({
      where,
      order: [['projectType', 'ASC'], ['sortOrder', 'ASC']],
    });
    // Group by projectType for convenience
    const grouped = {};
    templates.forEach(t => {
      if (!grouped[t.projectType]) grouped[t.projectType] = [];
      grouped[t.projectType].push(t);
    });
    sendSuccess(res, { templates, grouped });
  } catch (e) { next(e); }
};

const createMilestoneTemplate = async (req, res, next) => {
  try {
    const { projectType, name, minPct, maxPct, sortOrder } = req.body;
    if (!projectType || !name) return sendError(res, 'projectType and name are required', 400);
    if (Number(minPct) < 0 || Number(maxPct) > 100 || Number(minPct) > Number(maxPct)) {
      return sendError(res, 'Invalid percentage range', 400);
    }
    const maxOrder = await PmMilestoneTemplate.max('sortOrder', { where: { projectType } }) || 0;
    const tmpl = await PmMilestoneTemplate.create({
      projectType, name,
      minPct: Number(minPct) || 0,
      maxPct: Number(maxPct) || 100,
      sortOrder: sortOrder ?? maxOrder + 1,
    });
    sendSuccess(res, tmpl, 'Milestone template created', 201);
  } catch (e) { next(e); }
};

const updateMilestoneTemplate = async (req, res, next) => {
  try {
    const tmpl = await PmMilestoneTemplate.findByPk(req.params.id);
    if (!tmpl) return sendError(res, 'Template not found', 404);
    const { name, minPct, maxPct, sortOrder, isActive } = req.body;
    if (name !== undefined) tmpl.name = name;
    if (minPct !== undefined) tmpl.minPct = Number(minPct);
    if (maxPct !== undefined) tmpl.maxPct = Number(maxPct);
    if (sortOrder !== undefined) tmpl.sortOrder = sortOrder;
    if (isActive !== undefined) tmpl.isActive = isActive;
    if (Number(tmpl.minPct) > Number(tmpl.maxPct)) {
      return sendError(res, 'minPct cannot exceed maxPct', 400);
    }
    await tmpl.save();
    sendSuccess(res, tmpl, 'Milestone template updated');
  } catch (e) { next(e); }
};

const deleteMilestoneTemplate = async (req, res, next) => {
  try {
    const tmpl = await PmMilestoneTemplate.findByPk(req.params.id);
    if (!tmpl) return sendError(res, 'Template not found', 404);
    await tmpl.destroy();
    sendSuccess(res, null, 'Milestone template deleted');
  } catch (e) { next(e); }
};

// Validate that a project type's templates can sum to 100%
const validateTemplateRanges = async (req, res, next) => {
  try {
    const { projectType } = req.params;
    const templates = await PmMilestoneTemplate.findAll({
      where: { projectType, isActive: true },
      order: [['sortOrder', 'ASC']],
    });
    const sumMin = templates.reduce((s, t) => s + Number(t.minPct), 0);
    const sumMax = templates.reduce((s, t) => s + Number(t.maxPct), 0);
    const valid  = sumMin <= 100 && sumMax >= 100;
    sendSuccess(res, {
      projectType,
      templates: templates.length,
      sumMin, sumMax,
      valid,
      message: valid
        ? `✅ Valid — PM can reach exactly 100% (min total: ${sumMin}%, max total: ${sumMax}%)`
        : `❌ Invalid — PM cannot reach 100% (min total: ${sumMin}%, max total: ${sumMax}%)`,
    });
  } catch (e) { next(e); }
};

// ── Reorder Milestone Templates ───────────────────────────────────────────────

const reorderMilestoneTemplates = async (req, res, next) => {
  try {
    const items = req.body; // [{ id, order }, ...]
    if (!Array.isArray(items) || items.length === 0) {
      return sendError(res, 'items array required', 400);
    }
    for (const item of items) {
      await PmMilestoneTemplate.update({ sortOrder: item.sortOrder ?? item.order }, { where: { id: item.id } });
    }
    sendSuccess(res, null, 'Templates reordered');
  } catch (e) { next(e); }
};

// ── PM Client Orgs ────────────────────────────────────────────────────────────

const getPmClientOrgs = async (req, res, next) => {
  try {
    const ClientOrganisation = require('../../models/csat/ClientOrganisation');
    const { Op } = require('sequelize');
    const { search } = req.query;
    const where = {};
    if (search) where.name = { [Op.like]: `%${search}%` };
    const orgs = await ClientOrganisation.findAll({
      where,
      order: [['name', 'ASC']],
      limit: 200,
    });
    sendSuccess(res, orgs);
  } catch (e) { next(e); }
};

const createPmClientOrg = async (req, res, next) => {
  try {
    const ClientOrganisation = require('../../models/csat/ClientOrganisation');
    const { name } = req.body;
    if (!name || !name.trim()) return sendError(res, 'Organisation name is required', 400);
    const existing = await ClientOrganisation.findOne({ where: { name: name.trim() } });
    if (existing) return sendError(res, `Organisation "${name.trim()}" already exists`, 409);
    const org = await ClientOrganisation.create({ name: name.trim() });
    sendSuccess(res, org, 'Client organisation created', 201);
  } catch (e) { next(e); }
};

const deletePmClientOrg = async (req, res, next) => {
  try {
    const ClientOrganisation = require('../../models/csat/ClientOrganisation');
    const org = await ClientOrganisation.findByPk(req.params.id);
    if (!org) return sendError(res, 'Organisation not found', 404);
    await org.destroy();
    sendSuccess(res, null, 'Client organisation deleted');
  } catch (e) { next(e); }
};

// ── PM Member Roles ───────────────────────────────────────────────────────────

const PmMemberRole = require('../../models/pm/PmMemberRole');

const getMemberRoles = async (req, res, next) => {
  try {
    const roles = await PmMemberRole.findAll({
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    sendSuccess(res, roles);
  } catch (e) { next(e); }
};

const createMemberRole = async (req, res, next) => {
  try {
    const { name, sortOrder } = req.body;
    if (!name?.trim()) return sendError(res, 'name is required', 400);
    const existing = await PmMemberRole.findOne({ where: { name: name.trim() } });
    if (existing) return sendError(res, `Role "${name.trim()}" already exists`, 409);
    const maxOrder = await PmMemberRole.max('sortOrder') || 0;
    const role = await PmMemberRole.create({ name: name.trim(), sortOrder: sortOrder ?? maxOrder + 1 });
    sendSuccess(res, role, 'Member role created', 201);
  } catch (e) { next(e); }
};

const updateMemberRole = async (req, res, next) => {
  try {
    const role = await PmMemberRole.findByPk(req.params.id);
    if (!role) return sendError(res, 'Member role not found', 404);
    const { name, isActive, sortOrder } = req.body;
    if (name      !== undefined) role.name      = name;
    if (isActive  !== undefined) role.isActive  = isActive;
    if (sortOrder !== undefined) role.sortOrder = sortOrder;
    await role.save();
    sendSuccess(res, role, 'Member role updated');
  } catch (e) { next(e); }
};

const deleteMemberRole = async (req, res, next) => {
  try {
    const role = await PmMemberRole.findByPk(req.params.id);
    if (!role) return sendError(res, 'Member role not found', 404);
    await role.destroy();
    sendSuccess(res, null, 'Member role deleted');
  } catch (e) { next(e); }
};

module.exports = {
  getProjectTypes, createProjectType, updateProjectType, deleteProjectType,
  getStatuses, getAllStatuses, createStatus, updateStatus, deleteStatus,
  getMilestoneTemplates, createMilestoneTemplate, updateMilestoneTemplate, deleteMilestoneTemplate,
  validateTemplateRanges, reorderMilestoneTemplates,
  getPmClientOrgs, createPmClientOrg, deletePmClientOrg,
  getMemberRoles, createMemberRole, updateMemberRole, deleteMemberRole,
};
