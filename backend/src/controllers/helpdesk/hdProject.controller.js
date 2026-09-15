'use strict';

/**
 * @module controllers/helpdesk/hdProject
 * CRUD for helpdesk projects, including public widget token management.
 *
 * ONE PROJECT MASTER (Option C): `pm_projects` is the master list. A helpdesk
 * project row is a *profile* of a PM project (group + public widget token)
 * linked through `hd_projects.pm_project_id`. This controller is the helpdesk
 * "second door": creating here creates the PM master first (as an
 * 'Operations' project) and then the profile. Name / description / status /
 * manager are read through from the master when linked; the hd columns are
 * kept as a cache so legacy consumers keep working.
 */

const crypto      = require('crypto');
const { Op }      = require('sequelize');
// config/database exports the Sequelize instance directly — do NOT destructure
const sequelize   = require('../../config/database');
const { HdProject, HdTicket, HdGroup, Project } = require('../../models/helpdesk');
const { sendSuccess, sendError } = require('../../utils/response');
const { NotFoundError, ForbiddenError } = require('../../utils/errors');

const GROUP_REQUIRED = 'Select a support group for this project';

/** 400 in the unified shape: top-level `message` + `error.message`. */
const badRequest = (res, message) => sendError(res, message, 400);

const PM_PROJECT_ATTRS = ['id', 'name', 'description', 'status', 'projectType', 'managerId', 'clientName'];
const PM_INCLUDE = [{ model: Project, as: 'pmProject', attributes: PM_PROJECT_ATTRS, required: false }];
const GROUP_INCLUDE = { model: HdGroup, as: 'group', attributes: ['id', 'name'], required: false };

/** Manager user of the master, when the PM associations are registered (models/associations). */
const managerInclude = () => (Project.associations && Project.associations.projectManager
  ? [{ association: 'projectManager', attributes: ['id', 'name', 'email'], required: false }]
  : []);

const blankGroup = (v) => v === undefined || v === null || v === '';

/**
 * One API item for a helpdesk profile. `master` (a pm_projects row) is the
 * source of name / description / status / manager / client when present;
 * `profile` supplies the helpdesk bits (id, group, token). `id` stays the
 * profile id so `_id` on the client is the value tickets reference.
 *
 * @param {object} profile plain hd_projects row (may carry `group`)
 * @param {object|null} master plain pm_projects row (may carry `projectManager`)
 */
function toItem(profile, master) {
  const { pmProject: _ignored, helpdeskProfile: _ignored2, ...p } = profile;
  const out = {
    ...p,
    group:     profile.group || null,
    linked:    Boolean(master),
    projectType: master ? master.projectType ?? null : null,
    pmProject: master ? {
      id: master.id, name: master.name, status: master.status,
      projectType: master.projectType ?? null, managerId: master.managerId ?? null,
    } : null,
  };
  if (master) {
    out.name        = master.name;
    out.description = master.description ?? null;
    // `status` stays the HELPDESK status (is this project accepting tickets —
    // the widget checks it). The PM lifecycle status is a different thing
    // ("Yet to Start", "In Progress"…) and is exposed separately.
    out.projectStatus = master.status;
    out.managerId   = master.managerId ?? profile.managerId ?? null;
    out.clientName  = master.clientName ?? null;
    out.manager     = master.projectManager
      ? { id: master.projectManager.id, name: master.projectManager.name, email: master.projectManager.email }
      : null;
  } else {
    out.clientName = null;
    out.manager    = null;
  }
  return out;
}

/** Item for a profile Model loaded with PM_INCLUDE (+ group). */
function toProfile(row) {
  const plain = row.get({ plain: true });
  return toItem(plain, plain.pmProject || null);
}

/** Reload one profile in the list item shape. */
const loadItem = async (id) => {
  const row = await HdProject.findByPk(id, {
    include: [
      { model: Project, as: 'pmProject', attributes: PM_PROJECT_ATTRS, required: false, include: managerInclude() },
      GROUP_INCLUDE,
    ],
  });
  return row ? toProfile(row) : null;
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/projects
 * MASTER-BACKED list: helpdesk-enabled pm_projects (joined to their helpdesk
 * profile) with name / description / status / manager / client from the
 * master and `linked: true`, followed by profiles that have no master
 * (legacy, `linked: false`, their own name). Items keep `_id` = profile id.
 * - ?groupId=N → only profiles of that group (CreateTicket requester scope)
 * Sorted by visible name.
 * @type {import('express').RequestHandler}
 */
const listProjects = async (req, res, next) => {
  try {
    const { groupId } = req.query;
    const profileWhere = {};
    if (groupId) profileWhere.groupId = parseInt(groupId, 10) || null;

    const masters = await Project.findAll({
      attributes: PM_PROJECT_ATTRS,
      include: [
        {
          model: HdProject, as: 'helpdeskProfile', required: true, where: profileWhere,
          include: [GROUP_INCLUDE],
        },
        ...managerInclude(),
      ],
    });
    const data = masters.map((m) => {
      const plain = m.get({ plain: true });
      return toItem(plain.helpdeskProfile, plain);
    });

    // Profiles not covered above: unlinked (pm_project_id NULL), or pointing at
    // a master that no longer exists / a second profile of the same master.
    const seen = data.map((d) => d.id);
    const rest = await HdProject.findAll({
      where: { ...profileWhere, ...(seen.length ? { id: { [Op.notIn]: seen } } : {}) },
      include: [
        { model: Project, as: 'pmProject', attributes: PM_PROJECT_ATTRS, required: false, include: managerInclude() },
        GROUP_INCLUDE,
      ],
    });
    for (const row of rest) data.push(toProfile(row));

    data.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return sendSuccess(res, data, 'Projects fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/projects/:id
 * Get a single project (profile id) in the same item shape as the list.
 * @type {import('express').RequestHandler}
 */
const getProject = async (req, res, next) => {
  try {
    const item = await loadItem(req.params.id);
    if (!item) return next(new NotFoundError('Project'));
    return sendSuccess(res, item, 'Project fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/projects
 * Create a project. Admin or canManageProjects only.
 *
 * Creates the PM master FIRST (pm_projects, projectType 'Operations',
 * Non-Billable) and then the helpdesk profile pointing at it — one
 * transaction. Goes straight to the model, NOT through
 * project.service.createProject: that would apply the PM creator-role gate
 * and the template-milestone bootstrap, neither of which applies to an
 * Operations project.
 * Auto-generates publicToken using crypto.randomUUID().
 * @type {import('express').RequestHandler}
 */
const createProject = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Insufficient permissions'));

    const { name, description, managerId, groupId, status } = req.body;
    if (!name || !name.trim()) return sendError(res, 'name is required', 400);
    // A helpdesk project must always be serviced by a group.
    if (blankGroup(groupId)) return badRequest(res, GROUP_REQUIRED);
    const gid = parseInt(groupId, 10);
    if (!Number.isInteger(gid) || !(await HdGroup.findByPk(gid, { attributes: ['id'] }))) {
      return badRequest(res, GROUP_REQUIRED);
    }

    const cleanName = name.trim();
    const manager   = managerId || req.hdUser.id;
    const hdStatus  = status || 'Active';

    const created = await sequelize.transaction(async (transaction) => {
      const master = await Project.create({
        name:        cleanName,
        description: description || null,
        managerId:   manager,
        status:      hdStatus,
        billingType: 'Non-Billable',
        projectType: 'Operations',
        createdById: req.hdUser.id,
      }, { transaction });

      const profile = await HdProject.create({
        pmProjectId: master.id,
        name:        cleanName,
        description: description || null,
        managerId:   manager,
        groupId:     gid,
        status:      hdStatus,
        publicToken: crypto.randomUUID(),
      }, { transaction });

      return profile.id;
    });

    return sendSuccess(res, await loadItem(created), 'Project created', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /helpdesk/projects/:id
 * Update a project. Admin or canManageProjects only.
 * When linked, name / description / status / managerId are written to the PM
 * master too (hd columns stay as a cache).
 * @type {import('express').RequestHandler}
 */
const updateProject = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Insufficient permissions'));

    const project = await HdProject.findByPk(req.params.id, { include: PM_INCLUDE });
    if (!project) return next(new NotFoundError('Project'));

    const { name, description, managerId, groupId, status } = req.body;
    // The group may be changed but never removed.
    let gid;
    if (groupId !== undefined) {
      if (blankGroup(groupId)) return badRequest(res, GROUP_REQUIRED);
      gid = parseInt(groupId, 10);
      if (!Number.isInteger(gid) || !(await HdGroup.findByPk(gid, { attributes: ['id'] }))) {
        return badRequest(res, GROUP_REQUIRED);
      }
    }
    const masterPatch = {};
    if (name        !== undefined) { project.name        = name.trim(); masterPatch.name        = name.trim(); }
    if (description !== undefined) { project.description = description; masterPatch.description = description; }
    if (managerId   !== undefined) { project.managerId   = managerId;   masterPatch.managerId   = managerId || null; }
    if (groupId     !== undefined) { project.groupId     = gid; }
    if (status      !== undefined) { project.status      = status; }

    await sequelize.transaction(async (transaction) => {
      // Helpdesk status only drives the PM lifecycle for Operations projects,
      // whose only door is the helpdesk. A delivery project's PM status is
      // owned by Project Management and must never be overwritten from here.
      if (status !== undefined && project.pmProjectId) {
        const master = await Project.findByPk(project.pmProjectId, { attributes: ['id', 'projectType'], transaction });
        if (master?.projectType === 'Operations') masterPatch.status = status;
      }
      await project.save({ transaction });
      if (project.pmProjectId && Object.keys(masterPatch).length) {
        await Project.update(masterPatch, { where: { id: project.pmProjectId }, transaction });
      }
    });

    return sendSuccess(res, await loadItem(project.id), 'Project updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /helpdesk/projects/:id
 * Delete the helpdesk *profile* — admin only. The PM master is never deleted
 * from here. 409 when tickets still reference the profile.
 * @type {import('express').RequestHandler}
 */
const deleteProject = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin)
      return next(new ForbiddenError('Admin access required'));

    const project = await HdProject.findByPk(req.params.id);
    if (!project) return next(new NotFoundError('Project'));

    const ticketCount = await HdTicket.count({ where: { projectId: project.id } });
    if (ticketCount > 0) {
      return sendError(res, 'Project has tickets; disable instead', 409);
    }

    await project.destroy();
    return sendSuccess(res, null, 'Project deleted');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /helpdesk/projects/:id/regenerate-token
 * Regenerate the public widget token. Admin or canManageProjects only.
 * @type {import('express').RequestHandler}
 */
const regenerateToken = async (req, res, next) => {
  try {
    if (!req.hdUser.isAdmin && !req.hdUser.permissions.canManageProjects)
      return next(new ForbiddenError('Insufficient permissions'));

    const project = await HdProject.findByPk(req.params.id);
    if (!project) return next(new NotFoundError('Project'));

    project.publicToken = crypto.randomUUID();
    await project.save();

    return sendSuccess(res, { publicToken: project.publicToken }, 'Public token regenerated');
  } catch (err) {
    next(err);
  }
};

module.exports = { listProjects, getProject, createProject, updateProject, deleteProject, regenerateToken };
