const router = require('express').Router();
const ctrl = require('../controllers/kpiDefinitionRequest.controller');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Self-check — drives sidebar visibility for a granted Definer/Approver
// whose role wouldn't otherwise show KPI-definition links.
router.get('/my-access', ctrl.myAccess);

// Visibility is service-scoped, not role-scoped: admin sees everything,
// everyone else sees only requests they submitted or are the approver for
// (kpiDefinitionApproval.service.js listRequests).
router.get('/', ctrl.listRequests);
router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', ctrl.reject);

// Sub-delegation — permission is checked inside grantSubDefiner() itself
// (the caller must already be able to define for the target's department),
// not at the route layer, same pattern as the KPI-plan write routes.
router.post('/sub-definers', ctrl.grantSubDefiner);

module.exports = router;
