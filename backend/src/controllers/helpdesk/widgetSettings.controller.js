'use strict';

/**
 * @module controllers/helpdesk/widgetSettings
 * Public-widget tokens on the COMMON project list.
 *
 * A widget token lets outside customers raise tickets against a project without
 * logging in. The token lives on an hd_projects row that is linked to the PM
 * project (hd_projects.pm_project_id) — that row is a token record, not a
 * second project. Nothing here creates or edits PM projects.
 *
 *   GET  /helpdesk/widget-settings                     all PM projects + widget state
 *   POST /helpdesk/widget-settings/:pmProjectId/enable      create/reactivate token
 *   POST /helpdesk/widget-settings/:pmProjectId/regenerate  new token
 *   POST /helpdesk/widget-settings/:pmProjectId/disable     stop accepting (row + token kept)
 */

const crypto    = require('crypto');
const { Op }    = require('sequelize');
const sequelize = require('../../config/database');
const Project   = require('../../models/pm/Project');
const User      = require('../../models/User');
const { HdProject } = require('../../models/helpdesk');
const { sendSuccess } = require('../../utils/response');

const CLOSED = ['completed', 'cancelled', 'closed'];
const fail = (res, message, status = 400) => res.status(status).json({ success: false, message, error: { message } });

const canManage = (hdUser) => hdUser.isAdmin || !!hdUser.permissions?.canManageProjects;

/** hd_projects token row for a PM project (the lowest id if several). */
const tokenRowFor = (pmProjectId) => HdProject.findOne({
  where: { pmProjectId }, order: [['id', 'ASC']],
});

const shape = (pm, row) => ({
  id: pm.id, name: pm.name, status: pm.status,
  clientName: pm.clientName ?? null,
  managerName: pm.projectManager?.name ?? null,
  isClosed: CLOSED.includes(String(pm.status || '').toLowerCase()),
  // Enabled = token row exists and is Active (the widget refuses non-Active rows).
  widgetEnabled: Boolean(row && row.publicToken && row.status === 'Active'),
  publicToken: row?.publicToken ?? null,
  tokenRowId: row?.id ?? null,
});

const listWidgetSettings = async (req, res, next) => {
  try {
    const projects = await Project.findAll({
      attributes: ['id', 'name', 'status', 'clientName'],
      include: [{ model: User, as: 'projectManager', attributes: ['id', 'name'], required: false }],
      order: [['name', 'ASC']],
    });
    const rows = await HdProject.findAll({
      where: { pmProjectId: { [Op.in]: projects.map((p) => p.id) } },
      attributes: ['id', 'pmProjectId', 'publicToken', 'status'],
      order: [['id', 'ASC']],
    });
    const byPm = new Map();
    for (const r of rows) if (!byPm.has(r.pmProjectId)) byPm.set(r.pmProjectId, r);
    const data = projects.map((p) => shape(p.get({ plain: true }), byPm.get(p.id) || null));
    return sendSuccess(res, data, 'Widget settings fetched');
  } catch (err) {
    next(err);
  }
};

/** Resolve the PM project or answer 404. */
async function loadPm(req, res) {
  const pm = await Project.findByPk(String(req.params.pmProjectId), {
    attributes: ['id', 'name', 'status', 'description', 'managerId', 'clientName'],
    include: [{ model: User, as: 'projectManager', attributes: ['id', 'name'], required: false }],
  });
  if (!pm) { fail(res, 'Project not found', 404); return null; }
  return pm;
}

const enableWidget = async (req, res, next) => {
  try {
    if (!canManage(req.hdUser)) return fail(res, 'Insufficient permissions', 403);
    const pm = await loadPm(req, res);
    if (!pm) return;

    const row = await sequelize.transaction(async (transaction) => {
      let r = await tokenRowFor(pm.id);
      if (!r) {
        r = await HdProject.create({
          name: pm.name, description: pm.description ?? null,
          managerId: pm.managerId ?? null, status: 'Active',
          pmProjectId: pm.id, publicToken: crypto.randomUUID(),
        }, { transaction });
      } else if (r.status !== 'Active') {
        r.status = 'Active';                       // re-enable: same token keeps working
        await r.save({ transaction });
      }
      return r;
    });
    return sendSuccess(res, shape(pm.get({ plain: true }), row), 'Widget enabled');
  } catch (err) {
    next(err);
  }
};

const regenerateWidgetToken = async (req, res, next) => {
  try {
    if (!canManage(req.hdUser)) return fail(res, 'Insufficient permissions', 403);
    const pm = await loadPm(req, res);
    if (!pm) return;
    const row = await tokenRowFor(pm.id);
    if (!row) return fail(res, 'Widget is not enabled for this project');
    row.publicToken = crypto.randomUUID();     // old URLs stop working immediately
    await row.save();
    return sendSuccess(res, shape(pm.get({ plain: true }), row), 'Widget token regenerated');
  } catch (err) {
    next(err);
  }
};

const disableWidget = async (req, res, next) => {
  try {
    if (!canManage(req.hdUser)) return fail(res, 'Insufficient permissions', 403);
    const pm = await loadPm(req, res);
    if (!pm) return;
    const row = await tokenRowFor(pm.id);
    // public_token is NOT NULL/unique — disabling flips the row to Inactive, which
    // the widget rejects with "not accepting submissions". Token history is kept.
    if (row && row.status === 'Active') { row.status = 'Inactive'; await row.save(); }
    return sendSuccess(res, shape(pm.get({ plain: true }), row), 'Widget disabled');
  } catch (err) {
    next(err);
  }
};

module.exports = { listWidgetSettings, enableWidget, regenerateWidgetToken, disableWidget };
