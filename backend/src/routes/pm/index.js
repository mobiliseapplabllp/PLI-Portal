const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');

const projectRoutes      = require('./project.routes');
const milestoneRoutes    = require('./milestone.routes');
const taskRoutes         = require('./task.routes');
const dailyLogRoutes     = require('./dailyLog.routes');
const pmSettingsRoutes   = require('./pmSettings.routes');
const documentRoutes     = require('./document.routes');
const taskCtrl           = require('../../controllers/pm/task.controller');

// ── New Phase 2 routes ────────────────────────────────────────────────────────
const pmConfigRoutes     = require('./pmConfig.routes');
const statusReportRoutes = require('./statusReport.routes');
const raidRoutes         = require('./raid.routes');
const financialRoutes    = require('./financial.routes');
const closureRoutes      = require('./closure.routes');

router.use(authenticate);

const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];
router.get('/my-tasks', authorize(...ALL), taskCtrl.getMyTasks);

// ── Core project routes ───────────────────────────────────────────────────────
router.use('/projects', projectRoutes);
router.use('/projects/:id/milestones', milestoneRoutes);
router.use('/projects/:id/milestones/:milestoneId/tasks', taskRoutes);
router.use('/projects/:id/daily-logs', dailyLogRoutes);

// ── PM Configuration (project types, statuses, milestone templates) ───────────
router.use('/config', pmConfigRoutes);

// ── New project sub-resources ─────────────────────────────────────────────────
router.use('/projects/:id/status-reports', statusReportRoutes);
router.use('/projects/:id/raid',           raidRoutes);
router.use('/projects/:id/financial',      financialRoutes);
router.use('/projects/:id/closure',        closureRoutes);

// ── Settings ──────────────────────────────────────────────────────────────────
router.use('/settings', pmSettingsRoutes);

// ── Document store — project-level and milestone-level ───────────────────────
router.use('/projects/:projectId/documents', documentRoutes);
router.use('/projects/:projectId/milestones/:milestoneId/documents', documentRoutes);

// ── Flat milestone router — exposes export/import at /api/pm/milestones/* ────
router.use('/milestones', milestoneRoutes);

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.use('/dashboard', require('./pmDashboard.routes'));

module.exports = router;
