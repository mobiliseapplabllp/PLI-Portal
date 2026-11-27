'use strict';

/**
 * Attachments router.
 * - POST /        Upload a file (multer single 'file').  Requires auth.
 * - GET  /:id/download  Dual-read by id — blob-stored (new) or disk (legacy). Requires auth.
 * - GET  /:storedName   Legacy direct-link route — disk-stored rows only. Requires auth.
 * - DELETE /:id   Delete a file. Requires auth.
 */

const router         = require('express').Router();
const upload         = require('../../middleware/upload');
const attachmentCtrl = require('../../controllers/helpdesk/attachment.controller');

router.post('/', upload.single('file'), attachmentCtrl.uploadAttachment);
router.get('/:id/download', attachmentCtrl.downloadAttachment);
router.get('/:storedName',  attachmentCtrl.serveAttachment);
router.delete('/:id',       attachmentCtrl.deleteAttachment);

module.exports = router;
