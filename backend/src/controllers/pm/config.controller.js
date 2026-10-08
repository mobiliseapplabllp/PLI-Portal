/**
 * PM Configuration Controller
 * Manages: Project Types, Project Statuses, Milestone Templates
 */
const { sendSuccess } = require('../../utils/response');
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
    if (!name) return res.status(400).json({ message: 'name is required' });
    const existing = await PmProjectType.findOne({ where: { name } });
    if (existing) return res.status(409).json({ message: `Project type "${name}" already exists` });
    const maxOrder = await PmProjectType.max('sortOrder') || 0;
    const type = await PmProjectType.create({ name, sortOrder: sortOrder ?? maxOrder + 1 });
    sendSuccess(res, type, 'Project type created', 201);
  } catch (e) { next(e); }
};

const updateProjectType = async (req, res, next) => {
  try {
    const type = await PmProjectType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ message: 'Project type not found' });
    const { name, isActive, sortOrder } = req.body;
    const oldName = type.name;
    const renaming = name !== undefined && String(name) !== String(oldName);
    if (renaming) {
      const clash = await PmProjectType.findOne({ where: { name } });
      if (clash && String(clash.id) !== String(type.id)) {
        return res.status(409).json({ message: `Project type "${name}" already exists` });
      }
      type.name = name;
    }
    if (isActive !== undefined) type.isActive = isActive;
    if (sortOrder !== undefined) type.sortOrder = sortOrder;

    // A rename must carry the NAME copy on every row that still stores it (the
    // templates' and projects' projectType strings) — atomically with the rename,
    // keyed by the FK so it can never miss a row or hit the wrong type. Before
    // this, renaming a type silently orphaned all of its milestone templates.
    const sequelize = require('../../config/database');
    await sequelize.transaction(async (t) => {
      await type.save({ transaction: t });
      if (renaming) {
        await PmMilestoneTemplate.update(
          { projectType: name },
          { where: { projectTypeId: type.id }, transaction: t },
        );
        const Project = require('../../models/pm/Project');
        await Project.update(
          { projectType: name },
          { where: { projectType: oldName }, transaction: t },
        );
      }
    });
    sendSuccess(res, type, 'Project type updated');
  } catch (e) { next(e); }
};

const deleteProjectType = async (req, res, next) => {
  try {
    const type = await PmProjectType.findByPk(req.params.id);
    if (!type) return res.status(404).json({ message: 'Project type not found' });
    // Check if in use
    const Project = require('../../models/pm/Project');
    const count = await Project.count({ where: { projectType: type.name } });
    if (count > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${count} project(s) use this type. Disable it instead.`,
      });
    }
    // The FK (migration 052) is ON DELETE RESTRICT — say so up front rather than
    // letting the database refuse with a constraint error.
    const tplCount = await PmMilestoneTemplate.count({ where: { projectTypeId: type.id } });
    if (tplCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${tplCount} milestone template(s) belong to this type. Delete them (or copy them to another type) first, or disable the type instead.`,
      });
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
    if (!name) return res.status(400).json({ message: 'name is required' });
    if (!forProject && !forMilestone && !forSubMilestone) {
      return res.status(400).json({ message: 'At least one scope (project, milestone, or sub-milestone) must be selected.' });
    }
    const existing = await PmStatus.findOne({ where: { name } });
    if (existing) return res.status(409).json({ message: `Status "${name}" already exists` });
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
    if (!status) return res.status(404).json({ message: 'Status not found' });
    const { name, color, isActive, sortOrder, forProject, forMilestone, forSubMilestone } = req.body;
    // Determine effective scope values after applying incoming changes
    const effectiveForProject      = forProject      !== undefined ? forProject      : status.forProject;
    const effectiveForMilestone    = forMilestone    !== undefined ? forMilestone    : status.forMilestone;
    const effectiveForSubMilestone = forSubMilestone !== undefined ? forSubMilestone : status.forSubMilestone;
    if (!effectiveForProject && !effectiveForMilestone && !effectiveForSubMilestone) {
      return res.status(400).json({ message: 'At least one scope (project, milestone, or sub-milestone) must be selected.' });
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
    if (!status) return res.status(404).json({ message: 'Status not found' });
    if (status.isSystem) return res.status(403).json({ message: 'System status cannot be deleted' });
    await status.destroy();
    sendSuccess(res, null, 'Status deleted');
  } catch (e) { next(e); }
};

// ── Milestone Templates ───────────────────────────────────────────────────────

const getMilestoneTemplates = async (req, res, next) => {
  try {
    const where = {};
    // Filter by the FK, not the display-copy name string — a type's name can be
    // renamed at any time (migration 052), so the id is the only stable key.
    if (req.query.projectTypeId) where.projectTypeId = req.query.projectTypeId;
    else if (req.query.projectType) where.projectType = req.query.projectType;
    if (req.query.activeOnly !== 'false') where.isActive = true;
    const templates = await PmMilestoneTemplate.findAll({
      where,
      order: [['projectType', 'ASC'], ['sortOrder', 'ASC']],
    });
    // Group by projectTypeId for convenience — grouping by name would merge two
    // types that happen to share a display string.
    const grouped = {};
    templates.forEach(t => {
      const key = t.projectTypeId ?? t.projectType;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });
    sendSuccess(res, { templates, grouped });
  } catch (e) { next(e); }
};

const createMilestoneTemplate = async (req, res, next) => {
  try {
    const { projectType, name, minPct, maxPct, sortOrder } = req.body;
    if (!projectType || !name) return res.status(400).json({ message: 'projectType and name are required' });
    if (Number(minPct) < 0 || Number(maxPct) > 100 || Number(minPct) > Number(maxPct)) {
      return res.status(400).json({ message: 'Invalid percentage range' });
    }
    // Resolve the real reference up front — a template must belong to a type that
    // exists, and it is the id (not the name) the rename cascade is keyed by.
    const typeRow = await PmProjectType.findOne({ where: { name: projectType } });
    if (!typeRow) return res.status(400).json({ message: `Unknown project type "${projectType}"` });
    const maxOrder = await PmMilestoneTemplate.max('sortOrder', { where: { projectType } }) || 0;
    const tmpl = await PmMilestoneTemplate.create({
      projectType, projectTypeId: typeRow.id, name,
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
    if (!tmpl) return res.status(404).json({ message: 'Template not found' });
    const { name, minPct, maxPct, sortOrder, isActive } = req.body;
    if (name !== undefined) tmpl.name = name;
    if (minPct !== undefined) tmpl.minPct = Number(minPct);
    if (maxPct !== undefined) tmpl.maxPct = Number(maxPct);
    if (sortOrder !== undefined) tmpl.sortOrder = sortOrder;
    if (isActive !== undefined) tmpl.isActive = isActive;
    if (Number(tmpl.minPct) > Number(tmpl.maxPct)) {
      return res.status(400).json({ message: 'minPct cannot exceed maxPct' });
    }
    await tmpl.save();
    sendSuccess(res, tmpl, 'Milestone template updated');
  } catch (e) { next(e); }
};

const deleteMilestoneTemplate = async (req, res, next) => {
  try {
    const tmpl = await PmMilestoneTemplate.findByPk(req.params.id);
    if (!tmpl) return res.status(404).json({ message: 'Template not found' });
    await tmpl.destroy();
    sendSuccess(res, null, 'Milestone template deleted');
  } catch (e) { next(e); }
};

// Validate that a project type's templates can sum to 100%
const validateTemplateRanges = async (req, res, next) => {
  try {
    const { projectType } = req.params;
    // Resolve the name to its current type row and filter by id — filtering by the
    // name string would pull in another type's rows if a name is ever reused.
    const typeRow = await PmProjectType.findOne({ where: { name: projectType } });
    const where = typeRow ? { projectTypeId: typeRow.id, isActive: true } : { projectType, isActive: true };
    const templates = await PmMilestoneTemplate.findAll({
      where,
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
      return res.status(400).json({ success: false, message: 'items array required' });
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
    if (!name || !name.trim()) return res.status(400).json({ message: 'Organisation name is required' });
    const existing = await ClientOrganisation.findOne({ where: { name: name.trim() } });
    if (existing) return res.status(409).json({ message: `Organisation "${name.trim()}" already exists` });
    const org = await ClientOrganisation.create({ name: name.trim() });
    sendSuccess(res, org, 'Client organisation created', 201);
  } catch (e) { next(e); }
};

const deletePmClientOrg = async (req, res, next) => {
  try {
    const ClientOrganisation = require('../../models/csat/ClientOrganisation');
    const org = await ClientOrganisation.findByPk(req.params.id);
    if (!org) return res.status(404).json({ message: 'Organisation not found' });
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
    if (!name?.trim()) return res.status(400).json({ message: 'name is required' });
    const existing = await PmMemberRole.findOne({ where: { name: name.trim() } });
    if (existing) return res.status(409).json({ message: `Role "${name.trim()}" already exists` });
    const maxOrder = await PmMemberRole.max('sortOrder') || 0;
    const role = await PmMemberRole.create({ name: name.trim(), sortOrder: sortOrder ?? maxOrder + 1 });
    sendSuccess(res, role, 'Member role created', 201);
  } catch (e) { next(e); }
};

const updateMemberRole = async (req, res, next) => {
  try {
    const role = await PmMemberRole.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Member role not found' });
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
    if (!role) return res.status(404).json({ message: 'Member role not found' });
    await role.destroy();
    sendSuccess(res, null, 'Member role deleted');
  } catch (e) { next(e); }
};

/**
 * POST /pm/config/milestone-templates/copy   { fromType, toType }
 * Make toType's milestone template an exact copy of fromType's (names, order,
 * min/max %). toType's current rows are REPLACED, in one transaction. Only
 * projects created afterwards use it — existing projects are untouched, because
 * createDefaultMilestones copies template rows at project creation and keeps no link.
 */
const copyMilestoneTemplates = async (req, res, next) => {
  try {
    const fromType = String(req.body?.fromType || '').trim();
    const toType   = String(req.body?.toType   || '').trim();
    const bad = (message) => res.status(400).json({ success: false, message, error: { message } });
    if (!fromType || !toType) return bad('Choose both a source and a target project type');
    if (fromType === toType)  return bad('Source and target project type must be different');

    const source = await PmMilestoneTemplate.findAll({
      where: { projectType: fromType, isActive: true }, order: [['sortOrder', 'ASC'], ['id', 'ASC']], raw: true,
    });
    if (source.length === 0) return bad(`"${fromType}" has no milestone template to copy`);

    const toTypeRow = await PmProjectType.findOne({ where: { name: toType } });
    if (!toTypeRow) return bad(`Unknown project type "${toType}"`);

    const sequelize = require('../../config/database');   // the instance — never destructure
    let replaced = 0;
    await sequelize.transaction(async (t) => {
      replaced = await PmMilestoneTemplate.destroy({ where: { projectType: toType }, transaction: t });
      await PmMilestoneTemplate.bulkCreate(source.map((s, i) => ({
        projectType: toType, projectTypeId: toTypeRow.id, name: s.name, minPct: s.minPct, maxPct: s.maxPct,
        sortOrder: s.sortOrder ?? i + 1, isActive: true,
      })), { transaction: t });
    });
    sendSuccess(res, { fromType, toType, copied: source.length, replaced },
      `Copied ${source.length} milestone(s) from ${fromType} to ${toType}`);
  } catch (e) { next(e); }
};

module.exports = {
  copyMilestoneTemplates,
  getProjectTypes, createProjectType, updateProjectType, deleteProjectType,
  getStatuses, getAllStatuses, createStatus, updateStatus, deleteStatus,
  getMilestoneTemplates, createMilestoneTemplate, updateMilestoneTemplate, deleteMilestoneTemplate,
  validateTemplateRanges, reorderMilestoneTemplates,
  getPmClientOrgs, createPmClientOrg, deletePmClientOrg,
  getMemberRoles, createMemberRole, updateMemberRole, deleteMemberRole,
};
