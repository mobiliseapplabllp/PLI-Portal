'use strict';

/** /helpdesk/widget-settings — public widget tokens on the common PM project list. */
const router = require('express').Router();
const c = require('../../controllers/helpdesk/widgetSettings.controller');

router.get('/',                          c.listWidgetSettings);
router.post('/:pmProjectId/enable',      c.enableWidget);
router.post('/:pmProjectId/regenerate',  c.regenerateWidgetToken);
router.post('/:pmProjectId/disable',     c.disableWidget);

module.exports = router;
