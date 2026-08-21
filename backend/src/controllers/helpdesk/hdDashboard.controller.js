'use strict';

/**
 * @module controllers/helpdesk/hdDashboard
 * Aggregate statistics for the helpdesk dashboard.
 */

const { Op, fn, col, literal } = require('sequelize');
const sequelize  = require('../../config/database');
const { HdTicket, HdGroup } = require('../../models/helpdesk');
const { sendSuccess }        = require('../../utils/response');

const { TICKET_STATUS } = HdTicket;

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/dashboard/stats
 * Return aggregate ticket counts: total, open, inProgress, pending, resolved, closed, slaBreached.
 * @type {import('express').RequestHandler}
 */
const getStats = async (req, res, next) => {
  try {
    const [total, open, inProgress, pending, resolved, closed, slaBreached] = await Promise.all([
      HdTicket.count(),
      HdTicket.count({ where: { status: TICKET_STATUS.OPEN } }),
      HdTicket.count({ where: { status: TICKET_STATUS.IN_PROGRESS } }),
      HdTicket.count({ where: { status: TICKET_STATUS.PENDING } }),
      HdTicket.count({ where: { status: TICKET_STATUS.RESOLVED } }),
      HdTicket.count({ where: { status: TICKET_STATUS.CLOSED } }),
      HdTicket.count({ where: { slaBreached: true } }),
    ]);

    return sendSuccess(res, { total, open, inProgress, pending, resolved, closed, slaBreached }, 'Stats fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/dashboard/by-status
 * Count tickets grouped by status.
 * @type {import('express').RequestHandler}
 */
const getByStatus = async (req, res, next) => {
  try {
    const rows = await HdTicket.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group:      ['status'],
      raw:        true,
    });
    return sendSuccess(res, rows, 'By-status fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/dashboard/by-priority
 * Count tickets grouped by priority.
 * @type {import('express').RequestHandler}
 */
const getByPriority = async (req, res, next) => {
  try {
    const rows = await HdTicket.findAll({
      attributes: ['priority', [fn('COUNT', col('id')), 'count']],
      group:      ['priority'],
      raw:        true,
    });
    return sendSuccess(res, rows, 'By-priority fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/dashboard/by-group
 * Count tickets grouped by group_id, including group name.
 * @type {import('express').RequestHandler}
 */
const getByGroup = async (req, res, next) => {
  try {
    // Use raw SQL to avoid MySQL ONLY_FULL_GROUP_BY issues with Sequelize includes
    const [rows] = await sequelize.query(`
      SELECT
        g.name  AS groupName,
        g.id    AS groupId,
        COUNT(t.id) AS count
      FROM hd_tickets t
      LEFT JOIN hd_groups g ON g.id = t.group_id
      GROUP BY g.id, g.name
      ORDER BY count DESC
      LIMIT 50
    `);
    return sendSuccess(res, rows, 'By-group fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/dashboard/monthly-trend
 * Count tickets by month for the last 6 months.
 * @type {import('express').RequestHandler}
 */
const getMonthlyTrend = async (req, res, next) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const rows = await HdTicket.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('created_at'), '%Y-%m'), 'month'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { created_at: { [Op.gte]: sixMonthsAgo } },
      group: [literal("DATE_FORMAT(created_at, '%Y-%m')")],
      order: [[literal("DATE_FORMAT(created_at, '%Y-%m')"), 'ASC']],
      raw:   true,
    });

    return sendSuccess(res, rows, 'Monthly trend fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/dashboard/agent-stats
 * Per-agent ticket counts (total + pending), top 20 by volume.
 * @type {import('express').RequestHandler}
 */
const getAgentStats = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        u.name AS agentName,
        u.id   AS agentId,
        COUNT(t.id)                                       AS total,
        SUM(CASE WHEN t.status NOT IN ('closed','resolved') THEN 1 ELSE 0 END) AS pending
      FROM hd_tickets t
      JOIN users u ON u.id = t.assignee_id
      WHERE t.assignee_id IS NOT NULL
      GROUP BY u.id, u.name
      ORDER BY total DESC
      LIMIT 20
    `);
    return sendSuccess(res, rows, 'Agent stats fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/raised-by-team
 * Per-team ticket counts based on the raised_by_team field.
 * @type {import('express').RequestHandler}
 */
const getRaisedByTeam = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        COALESCE(raised_by_team, 'Unknown') AS team,
        COUNT(*) AS count
      FROM hd_tickets
      GROUP BY raised_by_team
      ORDER BY count DESC
      LIMIT 20
    `);
    return sendSuccess(res, rows, 'Raised by team fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/project-stats
 * Per-project ticket counts (total + pending), top 20 by volume.
 * @type {import('express').RequestHandler}
 */
const getProjectStats = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        p.name AS projectName,
        COUNT(t.id) AS total,
        SUM(CASE WHEN t.status NOT IN ('closed','resolved') THEN 1 ELSE 0 END) AS pending
      FROM hd_tickets t
      JOIN hd_projects p ON p.id = t.project_id
      WHERE t.project_id IS NOT NULL
      GROUP BY p.id, p.name
      ORDER BY total DESC
      LIMIT 20
    `);
    return sendSuccess(res, rows, 'Project stats fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/my-stats
 * Ticket counts for the currently authenticated helpdesk user.
 * @type {import('express').RequestHandler}
 */
const getMyStats = async (req, res, next) => {
  try {
    const userId = req.hdUser.id;
    const [rows] = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status IN ('in-progress','pending') THEN 1 ELSE 0 END) AS inProgress,
        SUM(CASE WHEN status IN ('closed','resolved') THEN 1 ELSE 0 END) AS closed
      FROM hd_tickets
      WHERE assignee_id = ?
    `, { replacements: [userId] });
    return sendSuccess(res, rows[0] || { total: 0, open: 0, inProgress: 0, closed: 0 }, 'My stats fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/unassigned-count
 * Count of unassigned tickets vs. total.
 * @type {import('express').RequestHandler}
 */
const getUnassignedCount = async (req, res, next) => {
  try {
    const count = await HdTicket.count({ where: { assigneeId: null } });
    const total = await HdTicket.count();
    return sendSuccess(res, { count, total }, 'Unassigned count fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/sla-stats
 * Count of SLA-breached tickets vs. total.
 * @type {import('express').RequestHandler}
 */
const getSlaStats = async (req, res, next) => {
  try {
    const breached = await HdTicket.count({ where: { slaBreached: true } });
    const total    = await HdTicket.count();
    return sendSuccess(res, { breached, total }, 'SLA stats fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/weekly-trend
 * Daily received vs. completed ticket counts for the last 7 days.
 * @type {import('express').RequestHandler}
 */
const getWeeklyTrend = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS received,
        SUM(CASE WHEN status IN ('closed','resolved') THEN 1 ELSE 0 END) AS completed
      FROM hd_tickets
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    return sendSuccess(res, rows, 'Weekly trend fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/mode-stats
 * Ticket counts broken down by the mode field.
 * @type {import('express').RequestHandler}
 */
const getModeStats = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        COALESCE(mode, 'Unknown') AS mode,
        COUNT(*) AS count
      FROM hd_tickets
      GROUP BY mode
      ORDER BY count DESC
    `);
    return sendSuccess(res, rows, 'Mode stats fetched');
  } catch (err) { next(err); }
};

module.exports = {
  getStats,
  getByStatus,
  getByPriority,
  getByGroup,
  getMonthlyTrend,
  getAgentStats,
  getRaisedByTeam,
  getProjectStats,
  getMyStats,
  getUnassignedCount,
  getSlaStats,
  getWeeklyTrend,
  getModeStats,
};
