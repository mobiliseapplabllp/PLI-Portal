const router = require('express').Router();
const ctrl   = require('../../controllers/pm/config.controller');
const cal    = require('../../controllers/pm/calendar.controller');
const { authorize } = require('../../middleware/rbac');
const upload = require('../../middleware/upload');

const ADMIN    = ['admin'];
const MANAGERS = ['admin', 'manager', 'senior_manager', 'md', 'director'];
const ALL      = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

// ── Project Types ─────────────────────────────────────────────────────────────
// System configuration — admin-only to mutate (read stays open to everyone,
// same as Working Calendar/Holidays below). Was MANAGERS, incorrectly letting
// a manager add/rename/delete project types through the PM Settings UI.
router.get   ('/project-types',            authorize(...ALL),   ctrl.getProjectTypes);
router.post  ('/project-types',            authorize(...ADMIN), ctrl.createProjectType);
router.put   ('/project-types/:id',        authorize(...ADMIN), ctrl.updateProjectType);
router.delete('/project-types/:id',        authorize(...ADMIN), ctrl.deleteProjectType);

// ── Project Statuses ──────────────────────────────────────────────────────────
router.get   ('/statuses/all',             authorize(...MANAGERS), ctrl.getAllStatuses);
router.get   ('/statuses',                 authorize(...ALL),     ctrl.getStatuses);
router.post  ('/statuses',                 authorize(...ADMIN), ctrl.createStatus);
router.put   ('/statuses/:id',             authorize(...ADMIN), ctrl.updateStatus);
router.delete('/statuses/:id',             authorize(...ADMIN), ctrl.deleteStatus);

// ── Milestone Templates ───────────────────────────────────────────────────────
router.get   ('/milestone-templates',                          authorize(...ALL),     ctrl.getMilestoneTemplates);
router.post  ('/milestone-templates',                          authorize(...ADMIN), ctrl.createMilestoneTemplate);
router.put   ('/milestone-templates/reorder',                  authorize(...ADMIN), ctrl.reorderMilestoneTemplates);
router.post  ('/milestone-templates/copy',                     authorize(...ADMIN),    ctrl.copyMilestoneTemplates);
router.put   ('/milestone-templates/:id',                      authorize(...ADMIN), ctrl.updateMilestoneTemplate);
router.delete('/milestone-templates/:id',                      authorize(...ADMIN), ctrl.deleteMilestoneTemplate);
router.get   ('/milestone-templates/:projectType/validate',    authorize(...MANAGERS), ctrl.validateTemplateRanges);

// ── PM Client Orgs ────────────────────────────────────────────────────────────
// NOTE: not currently called by the frontend (Client Orgs tab uses the CSAT
// client-org API, already admin-only) — left as-is, dead path, out of scope.
router.get   ('/client-orgs',     authorize(...MANAGERS), ctrl.getPmClientOrgs);
router.post  ('/client-orgs',     authorize(...MANAGERS), ctrl.createPmClientOrg);
router.delete('/client-orgs/:id', authorize(...MANAGERS), ctrl.deletePmClientOrg);

// ── PM Member Roles ───────────────────────────────────────────────────────────
router.get   ('/member-roles',     authorize(...ALL),      ctrl.getMemberRoles);
router.post  ('/member-roles',     authorize(...ADMIN), ctrl.createMemberRole);
router.put   ('/member-roles/:id', authorize(...ADMIN), ctrl.updateMemberRole);
router.delete('/member-roles/:id', authorize(...ADMIN), ctrl.deleteMemberRole);

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
