'use strict';

/**
 * Widget router — PUBLIC (no helpdeskAuth).
 * These endpoints are called by the embeddable JS widget running on external sites.
 * Authentication is handled via publicToken + email, not JWT.
 */

const router      = require('express').Router();
const widgetCtrl  = require('../../controllers/helpdesk/widget.controller');

// GET  /helpdesk/widget/config?token=X
router.get('/config', widgetCtrl.getWidgetConfig);

// GET  /helpdesk/widget/tickets?token=X&email=Y
router.get('/tickets', widgetCtrl.getWidgetTicketsByEmail);

// POST /helpdesk/widget/tickets
router.post('/tickets', widgetCtrl.submitWidgetTicket);

// GET  /helpdesk/widget/tickets/:id?token=X&email=Y
router.get('/tickets/:id', widgetCtrl.getWidgetTicketById);

// POST /helpdesk/widget/tickets/:id/reopen
router.post('/tickets/:id/reopen', widgetCtrl.reopenWidgetTicket);

module.exports = router;
