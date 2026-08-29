const router = require('express').Router();
const ctrl = require('../../controllers/pm/project.controller');
const taskCtrl = require('../../controllers/pm/task.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager'];
const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getProjects);
router.post('/', authorize(...MANAGERS), ctrl.createProject);
router.get('/:id', authorize(...ALL), ctrl.getProjectById);
router.get('/:id/summary', authorize(...ALL), ctrl.getProjectSummary);
router.put('/:id', authorize(...MANAGERS), ctrl.updateProject);
router.delete('/:id', authorize('admin'), ctrl.deleteProject);

// All tasks for a project (flat, no milestone filter) — avoids N+1 in MyTasks
router.get('/:id/tasks', authorize(...ALL), taskCtrl.getAllProjectTasks);

// Members availability (batch — must be before /:id/members to avoid param conflict)
router.get('/:id/members/availability', authorize(...ALL), ctrl.getMembersAvailability);

// Members
router.get('/:id/members', authorize(...ALL), ctrl.getMembers);
router.post('/:id/members', authorize(...MANAGERS), ctrl.addMember);
router.put('/:id/members/:memberId', authorize(...MANAGERS), ctrl.updateMember);
router.delete('/:id/members/:memberId', authorize(...MANAGERS), ctrl.removeMember);

// Recipients
router.get('/:id/recipients', authorize(...MANAGERS), ctrl.getRecipients);
router.post('/:id/recipients', authorize(...MANAGERS), ctrl.addRecipient);
router.delete('/:id/recipients/:recipientId', authorize(...MANAGERS), ctrl.removeRecipient);

// Allocation
router.get('/:id/allocation-preview',                 authorize(...MANAGERS), ctrl.getAllocationPreview);
router.post('/:id/allocation-approval',               authorize(...MANAGERS), ctrl.requestAllocationApproval);
// Route points to respondToAllocationApproval (full impl); respondAllocationApproval is intentionally removed.
router.patch('/:id/allocation-approval/:approvalId',  authorize('admin','senior_manager','md','director'), ctrl.respondToAllocationApproval);

// Allocation approval inbox (source project manager sees and responds to incoming requests)
router.get('/:id/allocation-approvals',               authorize(...MANAGERS), ctrl.getProjectAllocationApprovals);
router.patch('/:id/allocation-approvals/:approvalId', authorize(...MANAGERS), ctrl.respondToAllocationApproval);

module.exports = router;
