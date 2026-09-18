'use strict';

/**
 * @module controllers/helpdesk/pmProjectList
 * GET /helpdesk/pm-projects — the ONE project list for ticket creation.
 *
 * Tickets may be raised against any PM project, so this is a read-only,
 * unfiltered view of pm_projects for helpdesk users (the PM module's own
 * GET /pm/projects hides projects the caller is not a member of, which is the
 * right rule for delivery work but not for raising a ticket). Returns only
 * display fields — no financials, no members.
 *
 *   ?includeClosed=1   also return completed / cancelled / closed projects
 *   ?search=text       name contains text
 */

const { Op }  = require('sequelize');
const Project = require('../../models/pm/Project');
const User    = require('../../models/User');
const { sendSuccess } = require('../../utils/response');

const CLOSED = ['completed', 'cancelled', 'closed'];

const listPmProjects = async (req, res, next) => {
  try {
    const where = {};
    if (!['1', 'true'].includes(String(req.query.includeClosed || ''))) {
      where.status = { [Op.notIn]: CLOSED };
    }
    if (req.query.search) where.name = { [Op.like]: `%${String(req.query.search).trim()}%` };

    const rows = await Project.findAll({
      where,
      attributes: ['id', 'name', 'status', 'projectType', 'clientName', 'managerId', 'startDate', 'endDate'],
      include: [{ model: User, as: 'projectManager', attributes: ['id', 'name'], required: false }],
      order: [['name', 'ASC']],
    });

    const data = rows.map((p) => {
      const r = p.get({ plain: true });
      return {
        id: r.id, name: r.name, status: r.status, projectType: r.projectType,
        clientName: r.clientName ?? null,
        managerId: r.managerId ?? null,
        managerName: r.projectManager?.name ?? null,
        startDate: r.startDate ?? null, endDate: r.endDate ?? null,
        isClosed: CLOSED.includes(String(r.status || '').toLowerCase()),
      };
    });
    return sendSuccess(res, data, 'Projects fetched');
  } catch (err) {
    next(err);
  }
};

module.exports = { listPmProjects };
