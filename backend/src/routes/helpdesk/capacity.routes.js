'use strict';

/**
 * Helpdesk capacity router — capacity-based assignee suggestion.
 * All routes require helpdeskAuth (applied by parent index router).
 *
 * Mounted at the helpdesk root so it can serve both:
 *   GET /helpdesk/groups/:groupId/capacity
 *   GET /helpdesk/capacity?userIds=a,b,c
 */

const router       = require('express').Router();
const capacityCtrl = require('../../controllers/helpdesk/capacity.controller');

router.get('/groups/:groupId/capacity', capacityCtrl.getGroupCapacity);
router.get('/capacity',                 capacityCtrl.getUsersCapacity);

module.exports = router;
