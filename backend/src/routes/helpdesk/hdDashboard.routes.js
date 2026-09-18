'use strict';

/**
 * Dashboard router — aggregate statistics for the helpdesk.
 * All routes require helpdeskAuth (applied by parent index router).
 */

const router      = require('express').Router();
const dashCtrl    = require('../../controllers/helpdesk/hdDashboard.controller');

router.get('/stats',            dashCtrl.getStats);
router.get('/by-status',        dashCtrl.getByStatus);
router.get('/by-priority',      dashCtrl.getByPriority);
router.get('/by-group',         dashCtrl.getByGroup);   // legacy — kept for compatibility
router.get('/by-team',          dashCtrl.getByTeam);
router.get('/monthly-trend',    dashCtrl.getMonthlyTrend);
router.get('/agent-stats',      dashCtrl.getAgentStats);
router.get('/raised-by-team',   dashCtrl.getRaisedByTeam);
router.get('/project-stats',    dashCtrl.getProjectStats);
router.get('/my-stats',         dashCtrl.getMyStats);
router.get('/unassigned-count', dashCtrl.getUnassignedCount);
router.get('/sla-stats',        dashCtrl.getSlaStats);
router.get('/weekly-trend',     dashCtrl.getWeeklyTrend);
router.get('/mode-stats',       dashCtrl.getModeStats);

module.exports = router;
