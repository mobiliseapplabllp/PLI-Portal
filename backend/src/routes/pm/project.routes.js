const router = require('express').Router();
const ctrl = require('../../controllers/pm/project.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager'];
const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getProjects);
router.post('/', authorize(...MANAGERS), ctrl.createProject);
router.get('/:id', authorize(...ALL), ctrl.getProjectById);
router.get('/:id/summary', authorize(...ALL), ctrl.getProjectSummary);
router.put('/:id', authorize(...MANAGERS), ctrl.updateProject);
router.delete('/:id', authorize('admin'), ctrl.deleteProject);

// Members
router.get('/:id/members', authorize(...ALL), ctrl.getMembers);
router.post('/:id/members', authorize(...MANAGERS), ctrl.addMember);
router.put('/:id/members/:memberId', authorize(...MANAGERS), ctrl.updateMember);
router.delete('/:id/members/:memberId', authorize(...MANAGERS), ctrl.removeMember);

// Recipients
router.get('/:id/recipients', authorize(...MANAGERS), ctrl.getRecipients);
router.post('/:id/recipients', authorize(...MANAGERS), ctrl.addRecipient);
router.delete('/:id/recipients/:recipientId', authorize(...MANAGERS), ctrl.removeRecipient);

module.exports = router;
