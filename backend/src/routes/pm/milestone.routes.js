const router = require('express').Router({ mergeParams: true });
const ctrl = require('../../controllers/pm/milestone.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager'];
const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getMilestones);
router.post('/', authorize(...MANAGERS), ctrl.createMilestone);
router.put('/:milestoneId', authorize(...MANAGERS), ctrl.updateMilestone);
router.delete('/:milestoneId', authorize(...MANAGERS), ctrl.deleteMilestone);
router.patch('/:milestoneId/status', authorize(...MANAGERS), ctrl.updateStatus);
router.patch('/:milestoneId/progress', authorize(...MANAGERS), ctrl.updateProgress);

module.exports = router;
