'use strict';

/**
 * Attachments router.
 * - POST /        Upload a file (multer single 'file').  Requires auth.
 * - GET  /:storedName  Serve a file from disk. Requires auth.
 * - DELETE /:id   Delete a file. Requires auth.
 */

const router         = require('express').Router();
const upload         = require('../../middleware/upload');
const attachmentCtrl = require('../../controllers/helpdesk/attachment.controller');

router.post('/', upload.single('file'), attachmentCtrl.uploadAttachment);
router.get('/:storedName',  attachmentCtrl.serveAttachment);
router.delete('/:id',       attachmentCtrl.deleteAttachment);

module.exports = router;
