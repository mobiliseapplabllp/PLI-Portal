'use strict';

/**
 * Helpdesk Projects router — CRUD + token regeneration for HdProject.
 * All routes require helpdeskAuth (applied by parent index router).
 */

const router      = require('express').Router();
const projectCtrl = require('../../controllers/helpdesk/hdProject.controller');

router.get('/',      projectCtrl.listProjects);
router.post('/',     projectCtrl.createProject);
router.get('/:id',   projectCtrl.getProject);
router.put('/:id',   projectCtrl.updateProject);
router.delete('/:id', projectCtrl.deleteProject);

// Regenerate public widget token
router.post('/:id/regenerate-token', projectCtrl.regenerateToken);

module.exports = router;
