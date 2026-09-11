const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/pm/milestone.controller');
const { authorize } = require('../../middleware/rbac');
const upload = require('../../middleware/upload');

const ADMIN_ONLY = ['admin'];
const MANAGERS   = ['admin', 'manager', 'senior_manager'];
const ALL        = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

// Import/Export — must come before /:milestoneId to avoid param conflicts
router.get('/export',           authorize(...ALL),        ctrl.exportMilestones);
router.get('/import/template',  authorize(...ALL),        ctrl.getMilestoneImportTemplate);
router.post('/import/validate', authorize(...ADMIN_ONLY), upload.single('file'), ctrl.validateMilestoneImport);
router.post('/import/commit',   authorize(...ADMIN_ONLY), ctrl.commitMilestoneImport);

router.get('/',    authorize(...ALL),        ctrl.getMilestones);
// Only admin can create/delete top-level milestones.
// Default milestones are auto-created from templates; managers should NOT add them manually.
router.post('/',   authorize(...ADMIN_ONLY), ctrl.createMilestone);
router.put('/:milestoneId',   authorize(...MANAGERS),   ctrl.updateMilestone);   // managers can update (weight%, status)
router.delete('/:milestoneId', authorize(...ADMIN_ONLY), ctrl.deleteMilestone);  // admin only deletes top-level
router.patch('/:milestoneId/status',        authorize(...MANAGERS), ctrl.updateStatus);
router.patch('/:milestoneId/progress',      authorize(...MANAGERS), ctrl.updateProgress);
router.patch('/:milestoneId/planned-dates', authorize(...MANAGERS), ctrl.updatePlannedDates);
router.patch('/:milestoneId/actual-dates',  authorize(...MANAGERS), ctrl.updateActualDates);
// Planned dates are write-once. Admin unlocks a milestone so a manager can reset them once;
// the next planned-date write re-locks automatically. Lock = admin cancels an unlock.
router.patch('/:milestoneId/planned-dates/unlock', authorize(...ADMIN_ONLY), ctrl.unlockPlannedDates);
router.patch('/:milestoneId/planned-dates/lock',   authorize(...ADMIN_ONLY), ctrl.lockPlannedDates);
// Sub-milestones: managers can add/edit/delete sub-milestones inside default milestones
router.post('/:milestoneId/sub', authorize(...MANAGERS), ctrl.createSubMilestone);

module.exports = router;
