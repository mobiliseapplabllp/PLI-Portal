'use strict';

/**
 * Helpdesk router barrel.
 *
 * Mount this module in the main app router:
 *   app.use('/api/helpdesk', require('./routes/helpdesk'));
 *
 * Authentication strategy:
 *   - Most sub-routers are wrapped with authenticate + helpdeskAuth here.
 *   - Exceptions (approvals /respond, solutions /public, widget/**) manage their
 *     own auth requirements internally.
 *
 * Sub-routers that manage their own auth must NOT receive helpdeskAuth here.
 */

const router = require('express').Router();

const { authenticate }     = require('../../middleware/auth');
const { helpdeskAuth }     = require('../../middleware/helpdeskAuth');

// Load models/associations once when this router is first imported
require('../../models/helpdesk');

const ticketsRouter       = require('./tickets.routes');
const approvalsRouter     = require('./approvals.routes');
const groupsRouter        = require('./groups.routes');
const hdProjectsRouter    = require('./hdProjects.routes');
const hdOptionsRouter     = require('./hdOptions.routes');
const solutionsRouter     = require('./solutions.routes');
const announcementsRouter = require('./announcements.routes');
const hdDashboardRouter   = require('./hdDashboard.routes');
const attachmentsRouter   = require('./attachments.routes');
const widgetRouter        = require('./widget.routes');

// ── Public routers (no helpdeskAuth at this level) ─────────────────────────
// widget: entirely public — publicToken + email auth
router.use('/widget', widgetRouter);

// solutions /public and approvals /respond are public; the rest of these
// routers re-apply authenticate + helpdeskAuth internally for their protected
// routes.
router.use('/approvals', approvalsRouter);
router.use('/solutions', solutionsRouter);

// ── Authenticated routers ──────────────────────────────────────────────────
// Apply authenticate + helpdeskAuth for all subsequent routes
router.use(authenticate, helpdeskAuth);

router.use('/tickets',       ticketsRouter);
router.use('/groups',        groupsRouter);
router.use('/projects',      hdProjectsRouter);
router.use('/options',       hdOptionsRouter);
router.use('/announcements', announcementsRouter);
router.use('/dashboard',     hdDashboardRouter);
router.use('/attachments',   attachmentsRouter);
router.use('/user-groups',   require('./hdUserGroups.routes'));

module.exports = router;
