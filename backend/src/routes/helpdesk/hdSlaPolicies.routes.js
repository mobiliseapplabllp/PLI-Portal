'use strict';

const router = require('express').Router();
const ctrl = require('../../controllers/helpdesk/hdSlaPolicy.controller');

// GET is open to any authenticated helpdesk user — ticket pages need it to
// compute live SLA status, not just the admin editor.
router.get('/', ctrl.listPolicies);

// Admin-gated inside the controller.
router.put('/:id', ctrl.updatePolicy);

module.exports = router;
