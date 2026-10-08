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
// Managers can update anything (weight%, name, accountable person, status...).
// A non-manager may ALSO reach these three routes now — but updateMilestone()
// in milestone.service.js is the real gate: it still requires canManage() for
// every field EXCEPT status/completionPercentage, which it additionally allows
// through for the milestone's own accountableUserId. Gating MANAGERS-only here
// made that accountable-person exception unreachable, so a team member who
// owns a sub-milestone could never update its own status/progress.
router.put('/:milestoneId',   authorize(...ALL),        ctrl.updateMilestone);
// deleteMilestone() is the real gate here too: admin/manager for a top-level
// phase, any visible team member for a sub-milestone.
router.delete('/:milestoneId', authorize(...ALL), ctrl.deleteMilestone);
router.patch('/:milestoneId/status',        authorize(...ALL), ctrl.updateStatus);
router.patch('/:milestoneId/progress',      authorize(...ALL), ctrl.updateProgress);
// updateMilestonePlannedDates/ActualDates are the real gate: manager for any
// milestone, or a non-manager for a SUB they're accountable for — same rule
// as status/progress above.
router.patch('/:milestoneId/planned-dates', authorize(...ALL), ctrl.updatePlannedDates);
router.patch('/:milestoneId/actual-dates',  authorize(...ALL), ctrl.updateActualDates);
// Planned dates are write-once. Admin unlocks a milestone so a manager can reset them once;
// the next planned-date write re-locks automatically. Lock = admin cancels an unlock.
router.patch('/:milestoneId/planned-dates/unlock', authorize(...ADMIN_ONLY), ctrl.unlockPlannedDates);
router.patch('/:milestoneId/planned-dates/lock',   authorize(...ADMIN_ONLY), ctrl.lockPlannedDates);
// Sub-milestones: any visible team member can add one — createSubMilestone()
// only ever creates a SUB (never a top-level phase), so this can't be used to
// bypass the admin-only top-level create above.
router.post('/:milestoneId/sub', authorize(...ALL), ctrl.createSubMilestone);

module.exports = router;
