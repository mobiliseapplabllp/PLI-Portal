'use strict';

/**
 * Approvals router.
 *
 * NOTE: respondApproval is PUBLIC — no helpdeskAuth — because approvers click
 * a link from their email inbox without logging in to the portal.
 * The parent index router applies helpdeskAuth only to authenticated routes;
 * here we selectively skip it for the /respond endpoint.
 */

const router = require('express').Router();
const { authenticate }    = require('../../middleware/auth');
const { helpdeskAuth }    = require('../../middleware/helpdeskAuth');
const approvalCtrl        = require('../../controllers/helpdesk/approval.controller');

// ── PUBLIC — no auth ───────────────────────────────────────────────────────
// GET /helpdesk/approvals/respond?token=X&action=approve|reject
router.get('/respond', approvalCtrl.respondApproval);

// ── Authenticated ──────────────────────────────────────────────────────────
router.use(authenticate, helpdeskAuth);

router.get('/',                             approvalCtrl.listApprovals);
router.post('/:ticketId/request',           approvalCtrl.requestApproval);
router.get('/:ticketId/status',             approvalCtrl.getApprovalStatus);
// GET /helpdesk/approvals/:ticketId/default-approver — who would approve if no approverId is sent
router.get('/:ticketId/default-approver',   approvalCtrl.getDefaultApprover);
router.post('/:approvalId/respond-auth',    approvalCtrl.respondApprovalAuth);

module.exports = router;
