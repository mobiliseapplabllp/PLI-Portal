'use strict';
/**
 * Helpdesk Options router.
 * Provides CRUD for configurable dropdown values (category, mode, impact, etc.)
 * All routes require authenticate + helpdeskAuth (applied by parent index router).
 */

const router = require('express').Router();
const ctrl   = require('../../controllers/helpdesk/hdOption.controller');

// GET /helpdesk/options/all   — all types in one shot (ticket form loaders)
router.get('/all', ctrl.listAllOptions);

// GET /helpdesk/options?type=X
router.get('/',    ctrl.listOptions);

// POST /helpdesk/options
router.post('/',   ctrl.createOption);

// DELETE /helpdesk/options/:id
router.delete('/:id', ctrl.deleteOption);

module.exports = router;
