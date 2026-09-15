const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../core/rbac');

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
const raidCtrl           = require('../../controllers/pm/raid.controller');
const financialRoutes    = require('./financial.routes');
const closureRoutes      = require('./closure.routes');
const projectCtrl        = require('../../controllers/pm/project.controller');
const utilCtrl           = require('../../controllers/pm/utilisation.controller');

router.use(authenticate);

router.get('/my-tasks', requirePermission('pm.task.viewMine'), taskCtrl.getMyTasks);

// ── User resource availability / utilisation ─────────────────────────────────
router.get('/users/:userId/availability', requirePermission('pm.availability.view'),        projectCtrl.getUserAvailability);
router.get('/users/:userId/utilisation',  requirePermission('pm.utilisation.viewUser'),        utilCtrl.getUserUtilisation);
// Team × months grid (heat map). Registered before any router.use('/...') mounts —
// no top-level '/:param' route exists in this file, so '/utilisation' is unambiguous.
router.get('/utilisation',                requirePermission('pm.utilisation.viewTeam'), utilCtrl.getTeamUtilisation);

// ── RAID summary (must be before /projects/:id catch-all) ────────────────────
router.get('/projects/raid-summary', requirePermission('pm.raid.viewSummary'), raidCtrl.raidSummary);

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

// ── Flat milestone routes — import/export only at /api/pm/milestones/* ────────
const milestoneCtrl = require('../../controllers/pm/milestone.controller');
const upload        = require('../../middleware/upload');
router.get('/milestones/export',           requirePermission('pm.milestone.export'),        milestoneCtrl.exportMilestones);
router.get('/milestones/import/template',  requirePermission('pm.milestone.importTemplate'),        milestoneCtrl.getMilestoneImportTemplate);
router.post('/milestones/import/validate', requirePermission('pm.milestone.import'), upload.single('file'), milestoneCtrl.validateMilestoneImport);
router.post('/milestones/import/commit',   requirePermission('pm.milestone.import'), milestoneCtrl.commitMilestoneImport);

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.use('/dashboard', require('./pmDashboard.routes'));

module.exports = router;
