'use strict';

/**
 * Assignees router — operates on individual HdTicketAssignee rows.
 * Auth (authenticate + helpdeskAuth) is applied by the parent helpdesk index router.
 */

const router         = require('express').Router();
const assigneeCtrl   = require('../../controllers/helpdesk/assignee.controller');

router.delete('/:id', assigneeCtrl.removeAssignee);
router.put('/:id',    assigneeCtrl.updateAssignee);

module.exports = router;
