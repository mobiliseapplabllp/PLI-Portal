'use strict';

/**
 * Groups router — CRUD for HdGroup.
 * All routes require helpdeskAuth (applied by parent index router).
 */

const router     = require('express').Router();
const groupCtrl  = require('../../controllers/helpdesk/group.controller');

router.get('/',      groupCtrl.listGroups);
router.post('/',     groupCtrl.createGroup);
router.get('/:id',   groupCtrl.getGroup);
router.put('/:id',   groupCtrl.updateGroup);
router.delete('/:id', groupCtrl.deleteGroup);

module.exports = router;
