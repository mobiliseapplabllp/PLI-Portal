'use strict';

/**
 * Teams router — read-only. A team is a reporting manager + their active
 * direct reports (employee master), NOT a helpdesk group.
 * All routes require helpdeskAuth (applied by parent index router).
 */

const router   = require('express').Router();
const teamCtrl = require('../../controllers/helpdesk/team.controller');

router.get('/',                    teamCtrl.listTeams);
router.get('/:managerId/members',  teamCtrl.getTeamMembers);
module.exports = router;
