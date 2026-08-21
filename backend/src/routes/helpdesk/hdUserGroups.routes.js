'use strict';
const router     = require('express').Router();
const ctrl       = require('../../controllers/helpdesk/hdUserGroup.controller');
const { authenticate } = require('../../middleware/auth');
const { helpdeskAuth } = require('../../middleware/helpdeskAuth');

router.get('/',            authenticate, helpdeskAuth, ctrl.listUserGroups);
router.put('/bulk',        authenticate, helpdeskAuth, ctrl.bulkAssignUserGroups);
router.put('/:userId',     authenticate, helpdeskAuth, ctrl.assignUserGroup);

module.exports = router;
