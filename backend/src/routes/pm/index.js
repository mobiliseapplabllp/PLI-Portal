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
const raidCtrl           = require('../../controllers/pm/raid.controller');
const financialRoutes    = require('./financial.routes');
const closureRoutes      = require('./closure.routes');
const projectCtrl        = require('../../controllers/pm/project.controller');
const utilCtrl           = require('../../controllers/pm/utilisation.controller');

router.use(authenticate);

const ALL        = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];
const MANAGERS   = ['admin', 'manager', 'senior_manager'];
const MGMT_ROLES = ['admin', 'manager', 'senior_manager', 'md', 'director'];
router.get('/my-tasks', authorize(...ALL), taskCtrl.getMyTasks);

// ── User resource availability / utilisation ─────────────────────────────────
router.get('/users/:userId/availability', authorize(...ALL),        projectCtrl.getUserAvailability);
router.get('/users/:userId/utilisation',  authorize(...ALL),        utilCtrl.getUserUtilisation);
// Team × months grid (heat map). Registered before any router.use('/...') mounts —
// no top-level '/:param' route exists in this file, so '/utilisation' is unambiguous.
router.get('/utilisation',                authorize(...MGMT_ROLES), utilCtrl.getTeamUtilisation);

// ── Allocation exception inbox (ALL; the service decides visibility/approver roles) ──
// Registered before router.use('/projects', …) like /utilisation above.
router.get('/allocation-exceptions',                authorize(...ALL), projectCtrl.listAllocationExceptions);
router.patch('/allocation-exceptions/:approvalId',  authorize(...ALL), projectCtrl.decideAllocationException);
router.delete('/allocation-exceptions/:approvalId', authorize(...ALL), projectCtrl.cancelAllocationException);

// ── RAID summary (must be before /projects/:id catch-all) ────────────────────
router.get('/projects/raid-summary', authorize(...MANAGERS), raidCtrl.raidSummary);

// ── Bulk project import (Client + Project Name spreadsheet, Operations-only) ──
// Also registered before router.use('/projects', …) like raid-summary above —
// a literal path must not fall through to project.routes.js's /:id catch-all.
const bulkImportCtrl = require('../../controllers/pm/bulkImport.controller');
const uploadEarly    = require('../../middleware/upload');
router.get('/projects/bulk-import/template',       authorize(...MANAGERS), bulkImportCtrl.downloadTemplate);
router.post('/projects/bulk-import/validate',      authorize(...MANAGERS), uploadEarly.single('file'), bulkImportCtrl.validateImport);
router.post('/projects/bulk-import/confirm',       authorize(...MANAGERS), bulkImportCtrl.confirmImport);
router.get('/projects/bulk-import/logs',           authorize(...MANAGERS), bulkImportCtrl.listImportLogs);
router.post('/projects/bulk-import/:batchId/undo', authorize(...MANAGERS), bulkImportCtrl.undoImport);

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
const ADMIN_ONLY    = ['admin'];
router.get('/milestones/export',           authorize(...ALL),        milestoneCtrl.exportMilestones);
router.get('/milestones/import/template',  authorize(...ALL),        milestoneCtrl.getMilestoneImportTemplate);
router.post('/milestones/import/validate', authorize(...ADMIN_ONLY), upload.single('file'), milestoneCtrl.validateMilestoneImport);
router.post('/milestones/import/commit',   authorize(...ADMIN_ONLY), milestoneCtrl.commitMilestoneImport);

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.use('/dashboard', require('./pmDashboard.routes'));

module.exports = router;
