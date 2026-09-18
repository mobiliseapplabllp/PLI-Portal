const router = require('express').Router();
const ctrl = require('../../controllers/pm/project.controller');
const taskCtrl = require('../../controllers/pm/task.controller');
const { authorize } = require('../../middleware/rbac');

const MANAGERS = ['admin', 'manager', 'senior_manager'];
const ALL = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];

router.get('/', authorize(...ALL), ctrl.getProjects);
// before '/:id' — a literal path must not be captured as an id
router.get('/name-available', authorize(...MANAGERS), ctrl.checkProjectName);
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
router.patch('/:id/members/:memberId/confirm-hours', authorize(...MANAGERS), ctrl.confirmMemberHours);
router.delete('/:id/members/:memberId', authorize(...MANAGERS), ctrl.removeMember);

// Allocation segments (time-phased periods of a member) — B5
router.get('/:id/members/:memberId/segments',                          authorize(...ALL),      ctrl.listSegments);
router.post('/:id/members/:memberId/segments',                         authorize(...MANAGERS), ctrl.addSegment);
router.put('/:id/members/:memberId/segments/:segmentId',               authorize(...MANAGERS), ctrl.updateSegment);
router.delete('/:id/members/:memberId/segments/:segmentId',            authorize(...MANAGERS), ctrl.removeSegment);
router.patch('/:id/members/:memberId/segments/:segmentId/confirm',     authorize(...MANAGERS), ctrl.confirmSegment);
router.post('/:id/members/:memberId/release',                          authorize(...MANAGERS), ctrl.releaseMember);

// Person × month allocation grid + history — B5
router.get('/:id/allocation-grid',     authorize(...ALL),      ctrl.getAllocationGrid);
router.post('/:id/allocation-grid',    authorize(...MANAGERS), ctrl.applyAllocationGrid);
router.get('/:id/allocation-history',  authorize(...ALL),      ctrl.getAllocationHistory);

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

// Allocation exception request (over-capacity, approver-gated). Inbox + decision live at
// /pm/allocation-exceptions in routes/pm/index.js.
router.post('/:id/allocation-exception',              authorize(...MANAGERS), ctrl.requestAllocationException);

module.exports = router;
