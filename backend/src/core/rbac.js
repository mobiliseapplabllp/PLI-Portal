'use strict';

/**
 * Central permission map for PM (and helpdesk) routes.
 *
 * Each permission key maps to the list of user roles allowed to perform it.
 * `requirePermission(key)` returns the EXISTING `authorize(...roles)` middleware
 * from middleware/rbac.js — this module only names the role lists, it does not
 * change how authorization is enforced.
 *
 * Role lists here MUST stay identical to what the routes passed to authorize()
 * before the refactor; backend/test/rbac.test.js snapshots them.
 *
 * Helpdesk routes currently use no role-based authorize() calls — their access
 * model lives in middleware/helpdeskAuth.js (hdUser permissions) and is unchanged.
 *
 * KPI routes do not use this module.
 */

const { authorize } = require('../middleware/rbac');

const ALL        = ['admin', 'manager', 'senior_manager', 'employee', 'hr_admin', 'final_approver', 'md', 'director'];
const MANAGERS   = ['admin', 'manager', 'senior_manager'];
const MGMT       = ['admin', 'manager', 'senior_manager', 'md', 'director'];
const ADMIN      = ['admin'];
const APPROVERS  = ['admin', 'senior_manager', 'md', 'director'];

const PERMISSIONS = Object.freeze({
  // ── Projects ──────────────────────────────────────────────────────────────
  'pm.project.view':                  ALL,
  'pm.project.create':                MANAGERS,
  'pm.project.update':                MANAGERS,
  'pm.project.delete':                ADMIN,
  'pm.project.helpdesk.view':         ALL,
  'pm.project.helpdesk.manage':       MANAGERS,

  // ── Members / recipients / allocation ─────────────────────────────────────
  'pm.member.view':                   ALL,
  'pm.member.manage':                 MANAGERS,
  'pm.recipient.manage':              MANAGERS,
  'pm.availability.view':             ALL,
  'pm.allocation.preview':            MANAGERS,
  'pm.allocation.requestApproval':    MANAGERS,
  'pm.allocation.approvalInbox':      MANAGERS,
  'pm.allocation.decide':             APPROVERS,

  // ── Utilisation ───────────────────────────────────────────────────────────
  'pm.utilisation.viewUser':          ALL,
  'pm.utilisation.viewTeam':          MGMT,

  // ── Milestones ────────────────────────────────────────────────────────────
  'pm.milestone.view':                ALL,
  'pm.milestone.create':              ADMIN,
  'pm.milestone.update':              MANAGERS,
  'pm.milestone.delete':              ADMIN,
  'pm.milestone.plannedDates.set':    MANAGERS,
  'pm.milestone.plannedDates.unlock': ADMIN,
  'pm.milestone.sub.create':          MANAGERS,
  'pm.milestone.export':              ALL,
  'pm.milestone.importTemplate':      ALL,
  'pm.milestone.import':              ADMIN,

  // ── Tasks ─────────────────────────────────────────────────────────────────
  'pm.task.viewMine':                 ALL,
  'pm.task.view':                     ALL,
  'pm.task.create':                   ALL,
  'pm.task.update':                   ALL,
  'pm.task.delete':                   MANAGERS,

  // ── Project sub-resources ─────────────────────────────────────────────────
  'pm.dailyLog.view':                 ALL,
  'pm.dailyLog.write':                ALL,
  'pm.statusReport.view':             ALL,
  'pm.statusReport.manage':           MANAGERS,
  'pm.raid.view':                     ALL,
  'pm.raid.manage':                   MANAGERS,
  'pm.raid.viewSummary':              MANAGERS,
  'pm.financial.view':                ALL,
  'pm.financial.manage':              MANAGERS,
  'pm.closure.view':                  ALL,
  'pm.closure.manage':                MANAGERS,

  // ── Configuration ─────────────────────────────────────────────────────────
  'pm.projectType.view':              ALL,
  'pm.projectType.manage':            MGMT,
  'pm.projectStatus.view':            ALL,
  'pm.projectStatus.manage':          MGMT,
  'pm.milestoneTemplate.view':        ALL,
  'pm.milestoneTemplate.manage':      MGMT,
  'pm.clientOrg.manage':              MGMT,
  'pm.memberRole.view':               ALL,
  'pm.memberRole.manage':             MGMT,
  'pm.calendar.view':                 ALL,
  'pm.calendar.manage':               ADMIN,
  'pm.holiday.view':                  ALL,
  'pm.holiday.manage':                ADMIN,
  'pm.settings.manage':               ADMIN,
});

// Freeze each role list so no caller can mutate the shared arrays.
for (const roles of Object.values(PERMISSIONS)) Object.freeze(roles);

/** Role list for a key; throws on an unknown key (fail fast). */
const rolesFor = (key) => {
  if (!Object.prototype.hasOwnProperty.call(PERMISSIONS, key)) {
    throw new Error(`Unknown permission key: '${key}'`);
  }
  return PERMISSIONS[key];
};

/**
 * Express middleware for a permission key. Delegates to authorize(...roles),
 * so the 403 behaviour/message is exactly what authorize produces.
 * Called at route-definition time, so a typo'd key throws when the route file loads.
 */
const requirePermission = (key) => {
  const mw = authorize(...rolesFor(key));
  Object.defineProperty(mw, 'permission', { value: key, enumerable: false });
  return mw;
};

/** True when `user` (with a `.role`) holds the permission. Unknown key throws. */
const can = (user, key) => {
  const roles = rolesFor(key);
  return !!(user && roles.includes(user.role));
};

module.exports = { PERMISSIONS, requirePermission, can };
