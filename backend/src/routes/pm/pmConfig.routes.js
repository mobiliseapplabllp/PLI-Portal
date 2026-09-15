const router = require('express').Router();
const ctrl   = require('../../controllers/pm/config.controller');
const cal    = require('../../controllers/pm/calendar.controller');
const { requirePermission } = require('../../core/rbac');
const upload = require('../../middleware/upload');


// ── Project Types ─────────────────────────────────────────────────────────────
router.get   ('/project-types',            requirePermission('pm.projectType.view'),     ctrl.getProjectTypes);
router.post  ('/project-types',            requirePermission('pm.projectType.manage'), ctrl.createProjectType);
router.put   ('/project-types/:id',        requirePermission('pm.projectType.manage'), ctrl.updateProjectType);
router.delete('/project-types/:id',        requirePermission('pm.projectType.manage'), ctrl.deleteProjectType);

// ── Project Statuses ──────────────────────────────────────────────────────────
router.get   ('/statuses/all',             requirePermission('pm.projectStatus.manage'), ctrl.getAllStatuses);
router.get   ('/statuses',                 requirePermission('pm.projectStatus.view'),     ctrl.getStatuses);
router.post  ('/statuses',                 requirePermission('pm.projectStatus.manage'), ctrl.createStatus);
router.put   ('/statuses/:id',             requirePermission('pm.projectStatus.manage'), ctrl.updateStatus);
router.delete('/statuses/:id',             requirePermission('pm.projectStatus.manage'), ctrl.deleteStatus);

// ── Milestone Templates ───────────────────────────────────────────────────────
router.get   ('/milestone-templates',                          requirePermission('pm.milestoneTemplate.view'),     ctrl.getMilestoneTemplates);
router.post  ('/milestone-templates',                          requirePermission('pm.milestoneTemplate.manage'), ctrl.createMilestoneTemplate);
router.put   ('/milestone-templates/reorder',                  requirePermission('pm.milestoneTemplate.manage'), ctrl.reorderMilestoneTemplates);
router.put   ('/milestone-templates/:id',                      requirePermission('pm.milestoneTemplate.manage'), ctrl.updateMilestoneTemplate);
router.delete('/milestone-templates/:id',                      requirePermission('pm.milestoneTemplate.manage'), ctrl.deleteMilestoneTemplate);
router.get   ('/milestone-templates/:projectType/validate',    requirePermission('pm.milestoneTemplate.manage'), ctrl.validateTemplateRanges);

// ── PM Client Orgs ────────────────────────────────────────────────────────────
router.get   ('/client-orgs',     requirePermission('pm.clientOrg.manage'), ctrl.getPmClientOrgs);
router.post  ('/client-orgs',     requirePermission('pm.clientOrg.manage'), ctrl.createPmClientOrg);
router.delete('/client-orgs/:id', requirePermission('pm.clientOrg.manage'), ctrl.deletePmClientOrg);

// ── PM Member Roles ───────────────────────────────────────────────────────────
router.get   ('/member-roles',     requirePermission('pm.memberRole.view'),      ctrl.getMemberRoles);
router.post  ('/member-roles',     requirePermission('pm.memberRole.manage'), ctrl.createMemberRole);
router.put   ('/member-roles/:id', requirePermission('pm.memberRole.manage'), ctrl.updateMemberRole);
router.delete('/member-roles/:id', requirePermission('pm.memberRole.manage'), ctrl.deleteMemberRole);

// ── Working Calendar (Phase 1) ────────────────────────────────────────────────
router.get   ('/calendar',         requirePermission('pm.calendar.view'),   cal.getCalendar);
router.put   ('/calendar',         requirePermission('pm.calendar.manage'), cal.updateCalendar);
router.get   ('/calendar/preview', requirePermission('pm.calendar.view'),   cal.getCalendarPreview);
router.get   ('/calendar/working-days', requirePermission('pm.calendar.view'), cal.getWorkingDays);

// Holidays — import routes MUST precede /holidays/:id
router.get   ('/holidays/import/template', requirePermission('pm.holiday.view'),   cal.getHolidayImportTemplate);
router.post  ('/holidays/import/validate', requirePermission('pm.holiday.manage'), upload.single('file'), cal.validateHolidayImport);
router.post  ('/holidays/import/commit',   requirePermission('pm.holiday.manage'), cal.commitHolidayImport);
router.get   ('/holidays',     requirePermission('pm.holiday.view'),   cal.getHolidays);
router.post  ('/holidays',     requirePermission('pm.holiday.manage'), cal.createHoliday);
router.put   ('/holidays/:id', requirePermission('pm.holiday.manage'), cal.updateHoliday);
router.delete('/holidays/:id', requirePermission('pm.holiday.manage'), cal.deleteHoliday);

module.exports = router;
