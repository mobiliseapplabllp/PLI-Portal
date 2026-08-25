const router = require('express').Router();
const ctrl   = require('../../controllers/pm/config.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager', 'md', 'director'];
const ALL      = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

// ── Project Types ─────────────────────────────────────────────────────────────
router.get   ('/project-types',            authorize(...ALL),     ctrl.getProjectTypes);
router.post  ('/project-types',            authorize(...MANAGERS), ctrl.createProjectType);
router.put   ('/project-types/:id',        authorize(...MANAGERS), ctrl.updateProjectType);
router.delete('/project-types/:id',        authorize(...MANAGERS), ctrl.deleteProjectType);

// ── Project Statuses ──────────────────────────────────────────────────────────
router.get   ('/statuses',                 authorize(...ALL),     ctrl.getStatuses);
router.post  ('/statuses',                 authorize(...MANAGERS), ctrl.createStatus);
router.put   ('/statuses/:id',             authorize(...MANAGERS), ctrl.updateStatus);
router.delete('/statuses/:id',             authorize(...MANAGERS), ctrl.deleteStatus);

// ── Milestone Templates ───────────────────────────────────────────────────────
router.get   ('/milestone-templates',                          authorize(...ALL),     ctrl.getMilestoneTemplates);
router.post  ('/milestone-templates',                          authorize(...MANAGERS), ctrl.createMilestoneTemplate);
router.put   ('/milestone-templates/:id',                      authorize(...MANAGERS), ctrl.updateMilestoneTemplate);
router.delete('/milestone-templates/:id',                      authorize(...MANAGERS), ctrl.deleteMilestoneTemplate);
router.get   ('/milestone-templates/:projectType/validate',    authorize(...MANAGERS), ctrl.validateTemplateRanges);

module.exports = router;
