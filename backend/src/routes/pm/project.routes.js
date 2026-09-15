const router = require('express').Router();
const ctrl = require('../../controllers/pm/project.controller');
const taskCtrl = require('../../controllers/pm/task.controller');
const { requirePermission } = require('../../core/rbac');


router.get('/', requirePermission('pm.project.view'), ctrl.getProjects);
router.post('/', requirePermission('pm.project.create'), ctrl.createProject);
router.get('/:id', requirePermission('pm.project.view'), ctrl.getProjectById);
router.get('/:id/summary', requirePermission('pm.project.view'), ctrl.getProjectSummary);
router.put('/:id', requirePermission('pm.project.update'), ctrl.updateProject);
router.delete('/:id', requirePermission('pm.project.delete'), ctrl.deleteProject);

// Helpdesk profile of this project (ONE PROJECT MASTER) — hd_projects.pm_project_id
router.get('/:id/helpdesk',    requirePermission('pm.project.helpdesk.view'),      ctrl.getHelpdeskProfile);
router.post('/:id/helpdesk',   requirePermission('pm.project.helpdesk.manage'), ctrl.enableHelpdesk);
router.put('/:id/helpdesk',    requirePermission('pm.project.helpdesk.manage'), ctrl.updateHelpdeskProfile);
router.delete('/:id/helpdesk', requirePermission('pm.project.helpdesk.manage'), ctrl.disableHelpdesk);

// All tasks for a project (flat, no milestone filter) — avoids N+1 in MyTasks
router.get('/:id/tasks', requirePermission('pm.task.view'), taskCtrl.getAllProjectTasks);

// Members availability (batch — must be before /:id/members to avoid param conflict)
router.get('/:id/members/availability', requirePermission('pm.member.view'), ctrl.getMembersAvailability);

// Members
router.get('/:id/members', requirePermission('pm.member.view'), ctrl.getMembers);
router.post('/:id/members', requirePermission('pm.member.manage'), ctrl.addMember);
router.put('/:id/members/:memberId', requirePermission('pm.member.manage'), ctrl.updateMember);
router.patch('/:id/members/:memberId/confirm-hours', requirePermission('pm.member.manage'), ctrl.confirmMemberHours);
router.delete('/:id/members/:memberId', requirePermission('pm.member.manage'), ctrl.removeMember);

// Recipients
router.get('/:id/recipients', requirePermission('pm.recipient.manage'), ctrl.getRecipients);
router.post('/:id/recipients', requirePermission('pm.recipient.manage'), ctrl.addRecipient);
router.delete('/:id/recipients/:recipientId', requirePermission('pm.recipient.manage'), ctrl.removeRecipient);

// Allocation
router.get('/:id/allocation-preview',                 requirePermission('pm.allocation.preview'), ctrl.getAllocationPreview);
router.post('/:id/allocation-approval',               requirePermission('pm.allocation.requestApproval'), ctrl.requestAllocationApproval);
// Route points to respondToAllocationApproval (full impl); respondAllocationApproval is intentionally removed.
router.patch('/:id/allocation-approval/:approvalId',  requirePermission('pm.allocation.decide'), ctrl.respondToAllocationApproval);

// Allocation approval inbox (source project manager sees and responds to incoming requests)
router.get('/:id/allocation-approvals',               requirePermission('pm.allocation.approvalInbox'), ctrl.getProjectAllocationApprovals);
router.patch('/:id/allocation-approvals/:approvalId', requirePermission('pm.allocation.approvalInbox'), ctrl.respondToAllocationApproval);

module.exports = router;
