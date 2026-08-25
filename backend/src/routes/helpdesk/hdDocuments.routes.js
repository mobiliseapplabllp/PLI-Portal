'use strict';
const router = require('express').Router({ mergeParams: true });
const ctrl   = require('../../controllers/helpdesk/hdDocument.controller');

router.get('/',                       ctrl.listDocuments);
router.post('/', ctrl.uploadMiddleware, ctrl.uploadDocument);
router.get('/:docId/download',        ctrl.downloadDocument);
router.delete('/:docId',              ctrl.deleteDocument);

module.exports = router;
