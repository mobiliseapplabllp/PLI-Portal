'use strict';
const { Op }       = require('sequelize');
const Project      = require('../../models/pm/Project');
const Milestone    = require('../../models/pm/Milestone');
const User         = require('../../models/User');
const { sendSuccess } = require('../../utils/response');
// Operations (helpdesk-only) projects are excluded from every dashboard aggregate
const { NOT_OPERATIONS } = require('../../services/pm/project.service');

/**
 * GET /api/pm/dashboard/stats
 * Returns aggregate stats for the PM dashboard.
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const scoped = (where = {}) => ({ where: { ...NOT_OPERATIONS, ...where } });
    const [
      totalProjects,
      billableCount,
      nonBillableCount,
      activeCount,
      completedCount,
      onHoldCount,
    ] = await Promise.all([
      Project.count(scoped()),
      // Billable / Non-Billable live in billingType (projectType is the category)
      Project.count(scoped({ billingType: 'Billable' })),
      Project.count(scoped({ billingType: 'Non-Billable' })),
      Project.count(scoped({ status: 'active' })),
      Project.count(scoped({ status: 'completed' })),
      Project.count(scoped({ status: 'on_hold' })),
    ]);

    // Projects with milestone counts (top 20 by updatedAt)
    const projects = await Project.findAll({
      where: NOT_OPERATIONS,
      // updatedAt must be selected: with limit + hasMany include Sequelize wraps
      // the project query in a subquery and the outer ORDER BY needs the column
      attributes: ['id', 'name', 'status', 'projectType', 'startDate', 'endDate', 'managerId', 'updatedAt'],
      include: [
        {
          model: Milestone,
          as: 'milestones',
          // pm_milestones has plannedEndDate / actualEndDate (migration 024) — no `endDate`
          attributes: ['id', 'status', 'plannedEndDate'],
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
          overdue:   ms.filter(m => m.plannedEndDate && new Date(m.plannedEndDate) < today && m.status !== 'completed').length,
        },
      };
    });

    // Overall milestone counts
    const [totalMilestones, completedMilestones, overdueMilestones] = await Promise.all([
      Milestone.count(),
      Milestone.count({ where: { status: 'completed' } }),
      Milestone.count({
        where: {
          plannedEndDate: { [Op.lt]: new Date() },
          status:         { [Op.ne]: 'completed' },
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

module.exports = { getDashboardStats };
