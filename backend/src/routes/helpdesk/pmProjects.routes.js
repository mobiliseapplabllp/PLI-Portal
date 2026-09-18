'use strict';

/**
 * GET /helpdesk/pm-projects — read-only PM project list for ticket creation.
 * Requires helpdeskAuth (applied by the parent index router).
 */
const router = require('express').Router();
const { listPmProjects } = require('../../controllers/helpdesk/pmProjectList.controller');

router.get('/', listPmProjects);

module.exports = router;
