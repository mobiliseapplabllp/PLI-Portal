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

module.exports = { getDashboardStats };
