const router = require('express').Router();
const ctrl   = require('../../controllers/pm/config.controller');
const cal    = require('../../controllers/pm/calendar.controller');
const { authorize } = require('../../middleware/rbac');
const upload = require('../../middleware/upload');

const ADMIN    = ['admin'];
const MANAGERS = ['admin', 'manager', 'senior_manager', 'md', 'director'];
const ALL      = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

// ── Project Types ─────────────────────────────────────────────────────────────
router.get   ('/project-types',            authorize(...ALL),     ctrl.getProjectTypes);
router.post  ('/project-types',            authorize(...MANAGERS), ctrl.createProjectType);
router.put   ('/project-types/:id',        authorize(...MANAGERS), ctrl.updateProjectType);
router.delete('/project-types/:id',        authorize(...MANAGERS), ctrl.deleteProjectType);

// ── Project Statuses ──────────────────────────────────────────────────────────
router.get   ('/statuses/all',             authorize(...MANAGERS), ctrl.getAllStatuses);
router.get   ('/statuses',                 authorize(...ALL),     ctrl.getStatuses);
router.post  ('/statuses',                 authorize(...MANAGERS), ctrl.createStatus);
router.put   ('/statuses/:id',             authorize(...MANAGERS), ctrl.updateStatus);
router.delete('/statuses/:id',             authorize(...MANAGERS), ctrl.deleteStatus);

// ── Milestone Templates ───────────────────────────────────────────────────────
router.get   ('/milestone-templates',                          authorize(...ALL),     ctrl.getMilestoneTemplates);
router.post  ('/milestone-templates',                          authorize(...MANAGERS), ctrl.createMilestoneTemplate);
router.put   ('/milestone-templates/reorder',                  authorize(...MANAGERS), ctrl.reorderMilestoneTemplates);
router.post  ('/milestone-templates/copy',                     authorize(...ADMIN),    ctrl.copyMilestoneTemplates);
router.put   ('/milestone-templates/:id',                      authorize(...MANAGERS), ctrl.updateMilestoneTemplate);
router.delete('/milestone-templates/:id',                      authorize(...MANAGERS), ctrl.deleteMilestoneTemplate);
router.get   ('/milestone-templates/:projectType/validate',    authorize(...MANAGERS), ctrl.validateTemplateRanges);

// ── PM Client Orgs ────────────────────────────────────────────────────────────
router.get   ('/client-orgs',     authorize(...MANAGERS), ctrl.getPmClientOrgs);
router.post  ('/client-orgs',     authorize(...MANAGERS), ctrl.createPmClientOrg);
router.delete('/client-orgs/:id', authorize(...MANAGERS), ctrl.deletePmClientOrg);

// ── PM Member Roles ───────────────────────────────────────────────────────────
router.get   ('/member-roles',     authorize(...ALL),      ctrl.getMemberRoles);
router.post  ('/member-roles',     authorize(...MANAGERS), ctrl.createMemberRole);
router.put   ('/member-roles/:id', authorize(...MANAGERS), ctrl.updateMemberRole);
router.delete('/member-roles/:id', authorize(...MANAGERS), ctrl.deleteMemberRole);

// ── Working Calendar (Phase 1) ────────────────────────────────────────────────
router.get   ('/calendar',         authorize(...ALL),   cal.getCalendar);
router.put   ('/calendar',         authorize(...ADMIN), cal.updateCalendar);
router.get   ('/calendar/preview', authorize(...ALL),   cal.getCalendarPreview);
router.get   ('/calendar/working-days', authorize(...ALL), cal.getWorkingDays);

// Holidays — import routes MUST precede /holidays/:id
router.get   ('/holidays/import/template', authorize(...ALL),   cal.getHolidayImportTemplate);
router.post  ('/holidays/import/validate', authorize(...ADMIN), upload.single('file'), cal.validateHolidayImport);
router.post  ('/holidays/import/commit',   authorize(...ADMIN), cal.commitHolidayImport);
router.get   ('/holidays',     authorize(...ALL),   cal.getHolidays);
router.post  ('/holidays',     authorize(...ADMIN), cal.createHoliday);
router.put   ('/holidays/:id', authorize(...ADMIN), cal.updateHoliday);
router.delete('/holidays/:id', authorize(...ADMIN), cal.deleteHoliday);

module.exports = router;
