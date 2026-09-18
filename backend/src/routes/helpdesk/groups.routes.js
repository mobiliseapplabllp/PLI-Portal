'use strict';

/**
 * Groups router — READ-ONLY.
 * Helpdesk groups are retired: teams now come from the employee master
 * (users.managerId). GETs stay so legacy tickets can still show their old
 * group name; every mutating route answers 410 Gone.
 * All routes require helpdeskAuth (applied by parent index router).
 */

const router     = require('express').Router();
const groupCtrl  = require('../../controllers/helpdesk/group.controller');

const RETIRED_MESSAGE = 'Helpdesk groups are retired — teams come from the employee master';
const gone = (req, res) =>
  res.status(410).json({ success: false, message: RETIRED_MESSAGE, error: { message: RETIRED_MESSAGE } });

router.get('/',       groupCtrl.listGroups);
router.get('/:id',    groupCtrl.getGroup);

router.post('/',      gone);
router.put('/:id',    gone);
router.patch('/:id',  gone);
router.delete('/:id', gone);

module.exports = router;
