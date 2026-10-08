'use strict';

/**
 * @module controllers/helpdesk/hdDashboard
 * Aggregate statistics for the helpdesk dashboard.
 */

const { Op, fn, col, literal } = require('sequelize');
const sequelize  = require('../../config/database');
const { HdTicket, HdGroup } = require('../../models/helpdesk');
const { sendSuccess }        = require('../../utils/response');
const statusResolver         = require('../../services/helpdesk/statusResolver.service');
const HdOption                = require('../../models/helpdesk/HdOption');

/** { open, inProgress, pending, resolved, closed } -> current statusId, resolved by
 * built-in key so a rename in HD Settings never breaks these counts/filters. */
async function getBuiltInStatusIds() {
  const opts = await HdOption.findAll({
    where: { type: 'status', builtInKey: ['open', 'in-progress', 'pending', 'resolved', 'closed'] },
  });
  const byKey = Object.fromEntries(opts.map(o => [o.builtInKey, o.id]));
  return {
    open:       byKey['open'],
    inProgress: byKey['in-progress'],
    pending:    byKey['pending'],
    resolved:   byKey['resolved'],
    closed:     byKey['closed'],
  };
}

/**
 * Visibility — the dashboard counts exactly what the ticket list shows the caller,
 * so a card's number always matches the list it drills into. Uses THE rule from
 * ticket.controller (ticketVisibilityWhere); admins / scope 'all' see everything.
 *
 * Also folds in the optional ?teamManagerId= / ?assigneeId= dashboard filters, as
 * an AND on top of the caller's own scope — never a replacement for it. A manager
 * already scoped to their own team who somehow passes a different team's id simply
 * gets an empty intersection, never someone else's data; an admin picking a team
 * sees just that team, same rule, wider starting scope.
 *
 * Returns { where } for Sequelize queries and { sql, rep } for raw SQL
 * (`sql` is " AND <alias>.id IN (:visIds)", or '' when unrestricted and unfiltered).
 */
async function visibility(req, alias = 't') {
  // lazy: ticket.controller is large and must not load at route-require time
  const { ticketVisibilityWhere, splitProjectRef } = require('./ticket.controller');
  let where = req.hdUser ? await ticketVisibilityWhere(req.hdUser) : null;

  const extra = [];
  if (req.query?.teamManagerId) extra.push({ teamManagerId: String(req.query.teamManagerId) });
  if (req.query?.assigneeId)    extra.push({ assigneeId: String(req.query.assigneeId) });
  if (req.query?.category)      extra.push({ category: String(req.query.category) });
  if (req.query?.projectId) {
    // Same match a ticket can carry a project two ways (direct PM link, or via a
    // legacy hd_project linked to one) — identical rule to the ticket list's own
    // ?projectId= filter (ticket.controller.js buildTicketWhere), reused verbatim
    // so "this dashboard's Project filter" and "that ticket list filter" never disagree.
    const ref = splitProjectRef(req.query.projectId);
    if (ref.error) extra.push({ id: null });
    else if (ref.pmProjectId) {
      extra.push({ [Op.or]: [
        { pmProjectId: ref.pmProjectId },
        { projectId: { [Op.in]: sequelize.literal(
          `(SELECT id FROM hd_projects WHERE pm_project_id = ${sequelize.escape(ref.pmProjectId)})`) } },
      ] });
    } else {
      extra.push({ projectId: ref.projectId });
    }
  }
  if (req.query?.billingType) {
    // Billing type lives on the PM project, not the ticket — same "direct pm_project_id,
    // or via a legacy hd_project linked to one" matching as the Project filter above,
    // so this stays consistent with what getBillingTickets already reports.
    const bt = String(req.query.billingType);
    extra.push({ [Op.or]: [
      { pmProjectId: { [Op.in]: sequelize.literal(
        `(SELECT id FROM pm_projects WHERE billingType = ${sequelize.escape(bt)})`) } },
      { projectId: { [Op.in]: sequelize.literal(
        `(SELECT hp.id FROM hd_projects hp JOIN pm_projects pp ON pp.id = hp.pm_project_id WHERE pp.billingType = ${sequelize.escape(bt)})`) } },
    ] });
  }
  if (extra.length) {
    const filterWhere = extra.length === 1 ? extra[0] : { [Op.and]: extra };
    where = where ? { [Op.and]: [where, filterWhere] } : filterWhere;
  }

  if (!where) return { where: null, sql: '', rep: {} };
  const ids = (await HdTicket.findAll({ where, attributes: ['id'], raw: true })).map((r) => r.id);
  return { where, sql: ` AND ${alias ? `${alias}.` : ''}id IN (:visIds)`, rep: { visIds: ids.length ? ids : [-1] } };
}
const and = (vis, extra) => (vis ? { [Op.and]: [vis, extra] } : extra);

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/dashboard/stats
 * Return aggregate ticket counts: total, open, inProgress, pending, resolved, closed, slaBreached.
 * @type {import('express').RequestHandler}
 */
const getStats = async (req, res, next) => {
  try {
    const { where: vis } = await visibility(req);
    const ids = await getBuiltInStatusIds();
    const [total, open, inProgress, pending, resolved, closed, slaBreached] = await Promise.all([
      HdTicket.count({ where: vis || {} }),
      HdTicket.count({ where: and(vis, { statusId: ids.open }) }),
      HdTicket.count({ where: and(vis, { statusId: ids.inProgress }) }),
      HdTicket.count({ where: and(vis, { statusId: ids.pending }) }),
      HdTicket.count({ where: and(vis, { statusId: ids.resolved }) }),
      HdTicket.count({ where: and(vis, { statusId: ids.closed }) }),
      // BUG M10 FIX: exclude closed/resolved tickets from the sla-breached (overdue) count
      // so the dashboard only shows tickets that still need action.
      HdTicket.count({
        where: and(vis, {
          slaBreached: true,
          statusId: { [Op.notIn]: [ids.closed, ids.resolved] },
        }),
      }),
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
    // ?open=1 → only tickets still needing action (Operations dashboard donut)
    const { where: vis } = await visibility(req);
    const where = and(vis, req.query?.open === '1'
      ? { statusId: { [Op.notIn]: await statusResolver.getClosedStatusIds() } }
      : {});
    const rows = await HdTicket.findAll({
      attributes: ['priority', [fn('COUNT', col('id')), 'count']],
      where,
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
 * GET /helpdesk/dashboard/by-team
 * Ticket counts per TEAM (team_manager_id → manager name). Tickets that never
 * got a team (team_manager_id NULL) are reported under their legacy group as
 * 'Group: <name>', plus one 'Unassigned' row for tickets with neither.
 * Rows: { teamManagerId, teamName, total, pending }
 * @type {import('express').RequestHandler}
 */
const getByTeam = async (req, res, next) => {
  try {
    // Ids only (never user input) — safe to inline directly into the SQL fragment.
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const PENDING = `SUM(CASE WHEN t.status_id NOT IN (${closedList}) THEN 1 ELSE 0 END)`;
    const v = await visibility(req);
    const opts = { replacements: v.rep };
    const [[teamRows], [groupRows], [[unassigned]]] = await Promise.all([
      sequelize.query(`
        SELECT t.team_manager_id AS teamManagerId, u.name AS teamName,
               COUNT(t.id) AS total, ${PENDING} AS pending
        FROM hd_tickets t
        JOIN users u ON u.id = t.team_manager_id
        WHERE t.team_manager_id IS NOT NULL${v.sql}
        GROUP BY t.team_manager_id, u.name
        ORDER BY total DESC
      `, opts),
      sequelize.query(`
        SELECT CONCAT('Group: ', g.name) AS teamName,
               COUNT(t.id) AS total, ${PENDING} AS pending
        FROM hd_tickets t
        JOIN hd_groups g ON g.id = t.group_id
        WHERE t.team_manager_id IS NULL AND t.group_id IS NOT NULL${v.sql}
        GROUP BY g.id, g.name
        ORDER BY total DESC
      `, opts),
      sequelize.query(`
        SELECT COUNT(t.id) AS total, COALESCE(${PENDING}, 0) AS pending
        FROM hd_tickets t
        WHERE t.team_manager_id IS NULL AND t.group_id IS NULL${v.sql}
      `, opts),
    ]);

    const num = (r) => ({ ...r, total: Number(r.total) || 0, pending: Number(r.pending) || 0 });
    const rows = [
      ...teamRows.map(num),
      ...groupRows.map((r) => num({ teamManagerId: null, ...r })),
      num({ teamManagerId: null, teamName: 'Unassigned', ...unassigned }),
    ];
    return sendSuccess(res, rows, 'By-team fetched');
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
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const [rows] = await sequelize.query(`
      SELECT
        u.name AS agentName,
        u.id   AS agentId,
        COUNT(t.id)                                       AS total,
        SUM(CASE WHEN t.status_id NOT IN (${closedList}) THEN 1 ELSE 0 END) AS pending
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
    const v = await visibility(req);
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const [rows] = await sequelize.query(`
      SELECT
        projectName,
        MAX(pmProjectId) AS pmProjectId,
        COUNT(*) AS total,
        SUM(CASE WHEN status_id NOT IN (${closedList}) THEN 1 ELSE 0 END) AS pending
      FROM (
        -- New tickets reference PM projects; legacy tickets reference hd_projects.
        -- A legacy hd project that is linked to a PM project counts under the PM name.
        SELECT t.status, t.status_id,
               COALESCE(pm.name, pm2.name, hp.name) AS projectName,
               COALESCE(pm.id, pm2.id) AS pmProjectId
          FROM hd_tickets t
          LEFT JOIN pm_projects pm  ON pm.id  = t.pm_project_id
          LEFT JOIN hd_projects hp  ON hp.id  = t.project_id
          LEFT JOIN pm_projects pm2 ON pm2.id = hp.pm_project_id
         WHERE (t.pm_project_id IS NOT NULL OR t.project_id IS NOT NULL)${v.sql}
      ) x
      GROUP BY projectName
      ORDER BY total DESC
      LIMIT 20
    `, { replacements: v.rep });
    return sendSuccess(res, rows, 'Project stats fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/deadlines
 * The Operations dashboard's "Breached | Upcoming Deadlines" card.
 *   breached — open tickets whose SLA is breached OR whose due date has passed
 *              (most overdue first)
 *   upcoming — open tickets due within the next 14 days that are not breached
 *              (soonest first)
 * DATETIMEs are stored in UTC (no Sequelize timezone set), so the calendar day
 * is taken in the business timezone — a ticket due "20 Sep" in IST is stored as
 * 19 Sep 18:30 UTC and must still count as the 20th. Override with HD_TZ_OFFSET.
 * Unscoped, like every other dashboard endpoint.
 * @type {import('express').RequestHandler}
 */
const getDeadlines = async (req, res, next) => {
  try {
    const tz = /^[+-]\d{2}:\d{2}$/.test(process.env.HD_TZ_OFFSET || '') ? process.env.HD_TZ_OFFSET : '+05:30';
    const v = await visibility(req);
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const [rows] = await sequelize.query(`
      SELECT t.id, t.req_number AS reqNumber, t.title, t.status, t.priority,
             t.sla_breached AS slaBreached,
             DATE_FORMAT(CONVERT_TZ(t.due_date, '+00:00', :tz), '%Y-%m-%d') AS dueDate,
             DATEDIFF(DATE(CONVERT_TZ(t.due_date, '+00:00', :tz)),
                      DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', :tz))) AS daysLeft,
             u.name AS assigneeName,
             COALESCE(pm.name, pm2.name, hp.name) AS projectName
        FROM hd_tickets t
        LEFT JOIN users u         ON u.id   = t.assignee_id
        LEFT JOIN pm_projects pm  ON pm.id  = t.pm_project_id
        LEFT JOIN hd_projects hp  ON hp.id  = t.project_id
        LEFT JOIN pm_projects pm2 ON pm2.id = hp.pm_project_id
       WHERE t.status_id NOT IN (${closedList})
         AND (t.sla_breached = 1 OR t.due_date IS NOT NULL)${v.sql}
    `, { replacements: { tz, ...v.rep } });

    const list = rows.map((r) => ({
      ...r,
      slaBreached: !!Number(r.slaBreached),
      daysLeft: r.daysLeft == null ? null : Number(r.daysLeft),
    }));
    const isBreached = (r) => r.slaBreached || (r.daysLeft != null && r.daysLeft < 0);

    const breached = list.filter(isBreached)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
    const upcoming = list.filter((r) => !isBreached(r) && r.daysLeft != null && r.daysLeft <= 14)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return sendSuccess(res, { breached, upcoming }, 'Deadlines fetched');
  } catch (err) { next(err); }
};

/**
 * GET /helpdesk/dashboard/billing
 * Open tickets split by their project's billing type — the Operations twin of
 * the PM dashboard's Billable / Non-Billable project lists. A ticket takes the
 * billing type of its PM project (directly, or via a legacy hd project linked to
 * one). Tickets with no project, or a project with no billing type, are in neither.
 * Unscoped, like every other dashboard endpoint.
 * @type {import('express').RequestHandler}
 */
const getBillingTickets = async (req, res, next) => {
  try {
    const v = await visibility(req);
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const [rows] = await sequelize.query(`
      SELECT t.id, t.req_number AS reqNumber, t.title, t.status, t.priority,
             COALESCE(pm.name, pm2.name)               AS projectName,
             COALESCE(pm.billingType, pm2.billingType) AS billingType,
             u.name AS assigneeName
        FROM hd_tickets t
        LEFT JOIN pm_projects pm  ON pm.id  = t.pm_project_id
        LEFT JOIN hd_projects hp  ON hp.id  = t.project_id
        LEFT JOIN pm_projects pm2 ON pm2.id = hp.pm_project_id
        LEFT JOIN users u         ON u.id   = t.assignee_id
       WHERE t.status_id NOT IN (${closedList})${v.sql}
       ORDER BY t.created_at DESC
    `, { replacements: v.rep });
    const billable    = rows.filter((r) => r.billingType === 'Billable');
    const nonBillable = rows.filter((r) => r.billingType === 'Non-Billable');
    return sendSuccess(res, { billable, nonBillable }, 'Billing tickets fetched');
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
    const openId = (await statusResolver.getBuiltInStatus('open')).id;
    const inProgressList = (await statusResolver.getStatusIdsByKeys(['in-progress', 'pending'])).join(',') || '0';
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const [rows] = await sequelize.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status_id = ${Number(openId)} THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status_id IN (${inProgressList}) THEN 1 ELSE 0 END) AS inProgress,
        SUM(CASE WHEN status_id IN (${closedList}) THEN 1 ELSE 0 END) AS closed
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
    // Also exclude closed/resolved tickets from the unassigned count — they no longer need assignment.
    const count = await HdTicket.count({
      where: {
        assigneeId: null,
        statusId: { [Op.notIn]: await statusResolver.getClosedStatusIds() },
      },
    });
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
    // BUG M10 FIX: exclude closed/resolved tickets from the breached count
    const breached = await HdTicket.count({
      where: {
        slaBreached: true,
        statusId: { [Op.notIn]: await statusResolver.getClosedStatusIds() },
      },
    });
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
    const closedList = (await statusResolver.getClosedStatusIds()).join(',') || '0';
    const [rows] = await sequelize.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS received,
        SUM(CASE WHEN status_id IN (${closedList}) THEN 1 ELSE 0 END) AS completed
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

// Lazy-load ExcelJS only when needed (same convention as ticket.controller.js).
let ExcelJS;
function getExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

/**
 * Run another handler in this module against the SAME req (so it sees the same
 * filters/visibility) and return its `data` payload directly, without a real
 * HTTP round-trip. Avoids re-deriving each card's query here — this file's own
 * test suite already calls handlers this way (test/_helpers.js mockRes/mockNext).
 */
async function callHandler(fn, req) {
  let data;
  const res = { status() { return this; }, json(body) { data = body.data; return this; } };
  await fn(req, res, (err) => { if (err) throw err; });
  return data;
}

const STATUS_LABEL = { open: 'Open', 'in-progress': 'In Progress', pending: 'Pending', 'on-hold': 'On Hold', resolved: 'Resolved', closed: 'Closed' };

/** Bold white-on-blue header row, same look as the ticket import template. */
function styleHeaderRow(row) {
  row.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  row.height = 20;
}

/**
 * GET /helpdesk/dashboard/export
 * Same filters as every other dashboard endpoint (?teamManagerId=&assigneeId=&
 * category=&projectId=&billingType=) — the file always matches what's on screen.
 * Multi-sheet .xlsx: Summary, By Priority, By Team, By Project, Deadlines, Billing.
 * @type {import('express').RequestHandler}
 */
const exportDashboard = async (req, res, next) => {
  try {
    const [stats, byPriority, byTeam, byProject, deadlines, billing] = await Promise.all([
      callHandler(getStats, req),
      callHandler(getByPriority, req),
      callHandler(getByTeam, req),
      callHandler(getProjectStats, req),
      callHandler(getDeadlines, req),
      callHandler(getBillingTickets, req),
    ]);

    const XL = getExcelJS();
    const wb = new XL.Workbook();
    wb.creator = 'PLI Portal';
    wb.created = new Date();

    // ── Summary ──────────────────────────────────────────────────────────────
    const wsSummary = wb.addWorksheet('Summary');
    wsSummary.columns = [{ header: 'Metric', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 18 }];
    styleHeaderRow(wsSummary.getRow(1));
    const filterLines = [
      req.query.teamManagerId && `Team manager id: ${req.query.teamManagerId}`,
      req.query.assigneeId    && `Employee id: ${req.query.assigneeId}`,
      req.query.category      && `Category: ${req.query.category}`,
      req.query.projectId     && `Project id: ${req.query.projectId}`,
      req.query.billingType   && `Billing type: ${req.query.billingType}`,
    ].filter(Boolean);
    wsSummary.addRow({ k: 'Generated', v: new Date().toLocaleString('en-IN') });
    wsSummary.addRow({ k: 'Filters applied', v: filterLines.length ? filterLines.join('; ') : 'None' });
    wsSummary.addRow({});
    [['Total Tickets', stats.total], ['Open', stats.open], ['In Progress', stats.inProgress],
     ['Pending', stats.pending], ['SLA Breached', stats.slaBreached], ['Resolved', stats.resolved],
     ['Closed', stats.closed]].forEach(([k, v]) => wsSummary.addRow({ k, v }));

    // ── By Priority ──────────────────────────────────────────────────────────
    const wsPriority = wb.addWorksheet('By Priority');
    wsPriority.columns = [{ header: 'Priority', key: 'priority', width: 16 }, { header: 'Count', key: 'count', width: 12 }];
    styleHeaderRow(wsPriority.getRow(1));
    byPriority.forEach((r) => wsPriority.addRow({ priority: r.priority ?? r.label, count: r.count ?? r.value ?? 0 }));

    // ── By Team ──────────────────────────────────────────────────────────────
    const wsTeam = wb.addWorksheet('By Team');
    wsTeam.columns = [
      { header: 'Team', key: 'team', width: 30 }, { header: 'Total', key: 'total', width: 10 },
      { header: 'Still Open', key: 'pending', width: 12 },
    ];
    styleHeaderRow(wsTeam.getRow(1));
    byTeam.forEach((r) => wsTeam.addRow({ team: r.teamName || 'Unassigned', total: r.total ?? 0, pending: r.pending ?? 0 }));

    // ── By Project ───────────────────────────────────────────────────────────
    const wsProject = wb.addWorksheet('By Project');
    wsProject.columns = [
      { header: 'Project', key: 'project', width: 34 }, { header: 'Total', key: 'total', width: 10 },
      { header: 'Still Open', key: 'pending', width: 12 },
    ];
    styleHeaderRow(wsProject.getRow(1));
    byProject.forEach((r) => wsProject.addRow({ project: r.projectName || 'No project', total: r.total ?? 0, pending: r.pending ?? 0 }));

    // ── Deadlines ────────────────────────────────────────────────────────────
    const wsDeadlines = wb.addWorksheet('Deadlines');
    wsDeadlines.columns = [
      { header: 'Status',   key: 'kind',    width: 12 },
      { header: 'Ticket',   key: 'title',   width: 40 },
      { header: 'Project',  key: 'project', width: 26 },
      { header: 'Due Date', key: 'due',     width: 14 },
      { header: 'Days Left',key: 'days',    width: 12 },
    ];
    styleHeaderRow(wsDeadlines.getRow(1));
    [...deadlines.breached.map((r) => ({ ...r, kind: 'Breached' })), ...deadlines.upcoming.map((r) => ({ ...r, kind: 'Upcoming' }))]
      .forEach((r) => wsDeadlines.addRow({ kind: r.kind, title: r.title, project: r.projectName || '', due: r.dueDate || '', days: r.daysLeft ?? '' }));

    // ── Billing ──────────────────────────────────────────────────────────────
    const wsBilling = wb.addWorksheet('Billing');
    wsBilling.columns = [
      { header: 'Billing Type', key: 'billingType', width: 16 },
      { header: 'REQ#',         key: 'reqNumber',   width: 16 },
      { header: 'Title',        key: 'title',       width: 40 },
      { header: 'Status',       key: 'status',      width: 14 },
      { header: 'Project',      key: 'project',     width: 26 },
      { header: 'Assignee',     key: 'assignee',    width: 22 },
    ];
    styleHeaderRow(wsBilling.getRow(1));
    [...billing.billable.map((r) => ({ ...r, bt: 'Billable' })), ...billing.nonBillable.map((r) => ({ ...r, bt: 'Non-Billable' }))]
      .forEach((r) => wsBilling.addRow({
        billingType: r.bt, reqNumber: r.reqNumber, title: r.title,
        status: STATUS_LABEL[r.status] || r.status, project: r.projectName || '', assignee: r.assigneeName || 'Unassigned',
      }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="operations-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
  } catch (err) { next(err); }
};

module.exports = {
  getStats,
  getByStatus,
  getByPriority,
  getByGroup,
  getByTeam,
  getMonthlyTrend,
  getAgentStats,
  getRaisedByTeam,
  getProjectStats,
  getMyStats,
  getUnassignedCount,
  getSlaStats,
  getWeeklyTrend,
  getModeStats,
  getDeadlines,
  getBillingTickets,
  exportDashboard,
};
