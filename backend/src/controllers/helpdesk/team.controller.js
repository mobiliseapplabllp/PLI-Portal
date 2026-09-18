'use strict';

/**
 * @module controllers/helpdesk/team
 * Read-only "team" endpoints. A team is a reporting manager + their active
 * direct reports (employee master) — NOT a helpdesk group.
 * Requires helpdeskAuth (applied by the parent router); any helpdesk user may read.
 */

const { sendSuccess } = require('../../utils/response');
const teamService = require('../../services/helpdesk/team.service');

/**
 * Same body as utils/response sendError() plus a top-level `message`,
 * so clients reading either `message` or `error.message` get the text.
 */
function fail(res, message, status) {
  return res.status(status).json({ success: false, message, error: { message } });
}

/**
 * GET /helpdesk/teams?departmentId=
 * → [{ id, name, email, designation, departmentName, memberCount }]
 * @type {import('express').RequestHandler}
 */
const listTeams = async (req, res, next) => {
  try {
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : null;
    const teams = await teamService.listTeams({ departmentId });
    return sendSuccess(res, teams, 'Teams fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/teams/:managerId/members
 * → { manager:{id,name,email}, members:[{ id, name, email, designation, role, isManager }] }
 * 404 when the manager is unknown or inactive.
 * @type {import('express').RequestHandler}
 */
const getTeamMembers = async (req, res, next) => {
  try {
    const team = await teamService.getTeamMembers(String(req.params.managerId));
    if (!team) return fail(res, 'Team manager not found', 404);
    return sendSuccess(res, team, 'Team members fetched');
  } catch (err) {
    next(err);
  }
};

module.exports = { listTeams, getTeamMembers };
