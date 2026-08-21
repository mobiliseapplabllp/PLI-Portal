'use strict';

/**
 * Announcements router — CRUD for HdAnnouncement.
 * All routes require helpdeskAuth (applied by parent index router).
 */

const router     = require('express').Router();
const annCtrl    = require('../../controllers/helpdesk/announcement.controller');

router.get('/',      annCtrl.listAnnouncements);
router.get('/all',   annCtrl.listAllAnnouncements);
router.post('/',     annCtrl.createAnnouncement);
router.get('/:id',   annCtrl.getAnnouncement);
router.put('/:id',   annCtrl.updateAnnouncement);
router.delete('/:id', annCtrl.deleteAnnouncement);

module.exports = router;
