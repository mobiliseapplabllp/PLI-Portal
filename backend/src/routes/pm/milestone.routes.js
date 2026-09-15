const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/milestone.controller');
const { requirePermission } = require('../../core/rbac');
const upload = require('../../middleware/upload');


// Import/Export — must come before /:milestoneId to avoid param conflicts
router.get('/export',           requirePermission('pm.milestone.export'),        ctrl.exportMilestones);
router.get('/import/template',  requirePermission('pm.milestone.importTemplate'),        ctrl.getMilestoneImportTemplate);
router.post('/import/validate', requirePermission('pm.milestone.import'), upload.single('file'), ctrl.validateMilestoneImport);
router.post('/import/commit',   requirePermission('pm.milestone.import'), ctrl.commitMilestoneImport);

router.get('/',    requirePermission('pm.milestone.view'),        ctrl.getMilestones);
// Only admin can create/delete top-level milestones.
// Default milestones are auto-created from templates; managers should NOT add them manually.
router.post('/',   requirePermission('pm.milestone.create'), ctrl.createMilestone);
router.put('/:milestoneId',   requirePermission('pm.milestone.update'),   ctrl.updateMilestone);   // managers can update (weight%, status)
router.delete('/:milestoneId', requirePermission('pm.milestone.delete'), ctrl.deleteMilestone);  // admin only deletes top-level
router.patch('/:milestoneId/status',        requirePermission('pm.milestone.update'), ctrl.updateStatus);
router.patch('/:milestoneId/progress',      requirePermission('pm.milestone.update'), ctrl.updateProgress);
router.patch('/:milestoneId/planned-dates', requirePermission('pm.milestone.plannedDates.set'), ctrl.updatePlannedDates);
router.patch('/:milestoneId/actual-dates',  requirePermission('pm.milestone.update'), ctrl.updateActualDates);
// Planned dates are write-once. Admin unlocks a milestone so a manager can reset them once;
// the next planned-date write re-locks automatically. Lock = admin cancels an unlock.
router.patch('/:milestoneId/planned-dates/unlock', requirePermission('pm.milestone.plannedDates.unlock'), ctrl.unlockPlannedDates);
router.patch('/:milestoneId/planned-dates/lock',   requirePermission('pm.milestone.plannedDates.unlock'), ctrl.lockPlannedDates);
// Sub-milestones: managers can add/edit/delete sub-milestones inside default milestones
router.post('/:milestoneId/sub', requirePermission('pm.milestone.sub.create'), ctrl.createSubMilestone);

module.exports = router;
