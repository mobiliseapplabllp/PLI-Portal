'use strict';

const router  = require('express').Router({ mergeParams: true });
const upload  = require('../../middleware/upload');
const docCtrl = require('../../controllers/pm/document.controller');

// authenticate is already applied by the parent PM router (index.js), so no
// need to re-apply it here.  mergeParams: true gives access to :projectId and
// (when nested under milestones) :milestoneId.

router.get('/',                   docCtrl.listDocuments);
router.post('/', upload.single('file'), docCtrl.uploadDocument);
router.get('/:docId/download',    docCtrl.downloadDocument);
router.delete('/:docId',          docCtrl.deleteDocument);

module.exports = router;
