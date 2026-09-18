'use strict';
/**
 * User ↔ helpdesk-group mapping — READ-ONLY.
 * Helpdesk groups are retired: teams now come from the employee master
 * (users.managerId). The GET stays for legacy display; writes answer 410 Gone.
 */
const router     = require('express').Router();
const ctrl       = require('../../controllers/helpdesk/hdUserGroup.controller');
const { authenticate } = require('../../middleware/auth');
const { helpdeskAuth } = require('../../middleware/helpdeskAuth');

const RETIRED_MESSAGE = 'Helpdesk groups are retired — teams come from the employee master';
const gone = (req, res) =>
  res.status(410).json({ success: false, message: RETIRED_MESSAGE, error: { message: RETIRED_MESSAGE } });

router.get('/',            authenticate, helpdeskAuth, ctrl.listUserGroups);
router.put('/bulk',        authenticate, helpdeskAuth, gone);
router.put('/:userId',     authenticate, helpdeskAuth, gone);

module.exports = router;
