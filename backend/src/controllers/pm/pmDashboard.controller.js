'use strict';
const { Op }       = require('sequelize');
const Project      = require('../../models/pm/Project');
const Milestone    = require('../../models/pm/Milestone');
const User         = require('../../models/User');
const { sendSuccess } = require('../../utils/response');

/**
 * GET /api/pm/dashboard/stats
 * Returns aggregate stats for the PM dashboard.
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalProjects,
      billableCount,
      nonBillableCount,
      activeCount,
      completedCount,
      onHoldCount,
    ] = await Promise.all([
      Project.count(),
      Project.count({ where: { projectType: 'Billable' } }),
      Project.count({ where: { projectType: 'Non-Billable' } }),
      Project.count({ where: { status: 'active' } }),
      Project.count({ where: { status: 'completed' } }),
      Project.count({ where: { status: 'on_hold' } }),
    ]);

    // Projects with milestone counts (top 20 by updatedAt)
    const projects = await Project.findAll({
      attributes: ['id', 'name', 'status', 'projectType', 'startDate', 'endDate', 'managerId'],
      include: [
        {
          model: Milestone,
          as: 'milestones',
          attributes: ['id', 'status', 'endDate'],
          required: false,
        },
        {
          model: User,
          as: 'projectManager',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      order: [['updatedAt', 'DESC']],
      limit: 20,
    });

    // Compute per-project milestone stats
    const projectStats = projects.map(p => {
      const ms = p.milestones || [];
      const today = new Date();
      return {
        id:          p.id,
        name:        p.name,
        status:      p.status,
        projectType: p.projectType,
        startDate:   p.startDate,
        endDate:     p.endDate,
        manager:     p.projectManager ? p.projectManager.name : null,
        milestones: {
          total:     ms.length,
          completed: ms.filter(m => m.status === 'completed').length,
          overdue:   ms.filter(m => m.endDate && new Date(m.endDate) < today && m.status !== 'completed').length,
        },
      };
    });

    // Overall milestone counts
    const [totalMilestones, completedMilestones, overdueMilestones] = await Promise.all([
      Milestone.count(),
      Milestone.count({ where: { status: 'completed' } }),
      Milestone.count({
        where: {
          endDate: { [Op.lt]: new Date() },
          status:  { [Op.ne]: 'completed' },
        },
      }),
    ]);

    return sendSuccess(res, {
      projects: {
        total:       totalProjects,
        billable:    billableCount,
        nonBillable: nonBillableCount,
        active:      activeCount,
        completed:   completedCount,
        onHold:      onHoldCount,
      },
      milestones: {
        total:     totalMilestones,
        completed: completedMilestones,
        overdue:   overdueMilestones,
      },
      projectList: projectStats,
    }, 'Dashboard stats fetched');
  } catch (err) {
    next(err);
  }
};

// Lazy-load ExcelJS only when needed (same convention as ticket.controller.js).
let ExcelJS;
function getExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

/** Bold white-on-blue header row, same look as the ticket import template. */
function styleHeaderRow(row) {
  row.font   = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  row.height = 20;
}

/**
 * POST /api/pm/dashboard/export
 * The PM dashboard computes everything CLIENT-SIDE (Team/Employee/Client/
 * Project/Project Type/Billing Type/My Projects filters all narrow an already
 * role-scoped project list in the browser — there is no equivalent server-side
 * endpoint to re-derive here). So the frontend sends its own already-filtered
 * summary and this just turns it into a styled .xlsx — guarantees the file
 * always matches exactly what's on screen, with no filter logic duplicated
 * (and no risk of it drifting from the frontend's rules) on this side.
 *
 * Body: { filters: string[], stats: {total,active,completed,onHold,billable,
 *   nonBillable}, deadlines: [{kind,title,projectName,dueDate,daysLeft}] }
 */
const exportDashboard = async (req, res, next) => {
  try {
    const { filters = [], stats = {}, deadlines = [] } = req.body || {};

    const XL = getExcelJS();
    const wb = new XL.Workbook();
    wb.creator = 'PLI Portal';
    wb.created = new Date();

    // ── Summary ──────────────────────────────────────────────────────────────
    const wsSummary = wb.addWorksheet('Summary');
    wsSummary.columns = [{ header: 'Metric', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 40 }];
    styleHeaderRow(wsSummary.getRow(1));
    wsSummary.addRow({ k: 'Generated', v: new Date().toLocaleString('en-IN') });
    wsSummary.addRow({ k: 'Filters applied', v: filters.length ? filters.join('; ') : 'None' });
    wsSummary.addRow({});
    [['Total Projects', stats.total ?? 0], ['Active', stats.active ?? 0], ['Completed', stats.completed ?? 0],
     ['On Hold', stats.onHold ?? 0], ['Billable', stats.billable ?? 0], ['Non-Billable', stats.nonBillable ?? 0]]
      .forEach(([k, v]) => wsSummary.addRow({ k, v }));

    // ── Deadlines ────────────────────────────────────────────────────────────
    const wsDeadlines = wb.addWorksheet('Deadlines');
    wsDeadlines.columns = [
      { header: 'Status',    key: 'kind',    width: 12 },
      { header: 'Phase / Sub-milestone', key: 'title', width: 40 },
      { header: 'Project',   key: 'project', width: 30 },
      { header: 'Due Date',  key: 'due',     width: 14 },
      { header: 'Days Left', key: 'days',    width: 12 },
    ];
    styleHeaderRow(wsDeadlines.getRow(1));
    deadlines.forEach((r) => wsDeadlines.addRow({
      kind: r.kind === 'breached' ? 'Breached' : 'Upcoming',
      title: r.title || '', project: r.projectName || '', due: r.dueDate || '', days: r.daysLeft ?? '',
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="pm-dashboard-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    const buf = await wb.xlsx.writeBuffer();
    return res.send(buf);
  } catch (err) { next(err); }
};

module.exports = { getDashboardStats, exportDashboard };
