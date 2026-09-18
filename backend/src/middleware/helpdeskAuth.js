'use strict';

const { ForbiddenError, UnauthorizedError } = require('../utils/errors');
const User = require('../models/User');

/**
 * @typedef {Object} HdPermissions
 * @property {boolean} canManageTickets  - Create, update, close, and delete tickets.
 * @property {boolean} canAssign         - Assign or re-assign tickets to agents / groups.
 * @property {boolean} canApprove        - Approve or reject escalated tickets.
 * @property {boolean} canManageUsers    - Invite, deactivate, and edit helpdesk user profiles.
 * @property {boolean} canViewReports    - Access analytics and report dashboards.
 * @property {boolean} canManageKb       - Create and publish knowledge-base articles.
 * @property {boolean} canManageProjects - Create and administrate helpdesk projects.
 */

/**
 * @typedef {'all' | 'group' | 'own'} HdScope
 * - 'all'   – can see every ticket regardless of assignment or department.
 * - 'group' – TEAM scope: tickets whose team_manager_id is me, or whose
 *             requester/assignee is me or one of my direct reports
 *             (plus legacy group_id = my hd_group_id). Name kept for compatibility.
 * - 'own'   – can see only tickets they created or are assigned to.
 */

/**
 * @typedef {Object} HdUser
 * @property {string}       id          - UUID of the PLI Portal user.
 * @property {string}       name        - Display name.
 * @property {string}       email       - Email address.
 * @property {string}       role        - Original PLI Portal role string.
 * @property {boolean}      isAdmin     - True for admin / md / director.
 * @property {HdScope}      scope       - Ticket visibility scope.
 * @property {HdPermissions} permissions - Granular capability flags.
 * @property {number|null}  groupId     - Legacy hd_groups id (read-only, kept for old tickets).
 * @property {string|null}  managerId   - The user's own reporting manager (users.managerId).
 * @property {string|null}  teamManagerId - Team the user belongs to as a member (= managerId).
 */

/** Roles that are considered full helpdesk administrators. */
const ADMIN_ROLES = new Set(['admin', 'md', 'director']);

/**
 * Build a zero-permissions object (the safe default for unknown roles).
 * @returns {HdPermissions}
 */
function noPermissions() {
  return {
    canManageTickets: false,
    canAssign:        false,
    canApprove:       false,
    canManageUsers:   false,
    canViewReports:   false,
    canManageKb:      false,
    canManageProjects: false,
  };
}

/**
 * Build a full-permissions object (granted to admin-level roles).
 * @returns {HdPermissions}
 */
function allPermissions() {
  return {
    canManageTickets: true,
    canAssign:        true,
    canApprove:       true,
    canManageUsers:   true,
    canViewReports:   true,
    canManageKb:      true,
    canManageProjects: true,
  };
}

/**
 * Derive helpdesk scope and permissions from a PLI Portal role string.
 *
 * @param {string} role - The `req.user.role` value.
 * @returns {{ isAdmin: boolean, scope: HdScope, permissions: HdPermissions }}
 */
function resolveRoleMapping(role) {
  // --- Full admins ---
  if (ADMIN_ROLES.has(role)) {
    return { isAdmin: true, scope: 'all', permissions: allPermissions() };
  }

  switch (role) {
    case 'senior_manager':
      return {
        isAdmin: false,
        scope: 'all',
        permissions: {
          canManageTickets:  true,
          canAssign:         true,
          canApprove:        true,
          canManageUsers:    false,
          canViewReports:    true,
          canManageKb:       true,
          canManageProjects: true,
        },
      };

    case 'manager':
      return {
        isAdmin: false,
        scope: 'group',
        permissions: {
          canManageTickets:  true,
          canAssign:         true,
          canApprove:        true,
          canManageUsers:    false,
          canViewReports:    true,
          canManageKb:       false,
          canManageProjects: true,
        },
      };

    case 'hr_admin':
      return {
        isAdmin: false,
        scope: 'group',
        permissions: {
          canManageTickets:  true,
          canAssign:         false,
          canApprove:        false,
          canManageUsers:    true,
          canViewReports:    true,
          canManageKb:       false,
          canManageProjects: false,
        },
      };

    case 'final_approver':
      return {
        isAdmin: false,
        scope: 'group',
        permissions: {
          canManageTickets:  false,
          canAssign:         false,
          canApprove:        true,
          canManageUsers:    false,
          canViewReports:    true,
          canManageKb:       false,
          canManageProjects: false,
        },
      };

    case 'sales_director':
      return {
        isAdmin: false,
        scope: 'all',
        permissions: {
          canManageTickets:  true,
          canAssign:         false,
          canApprove:        false,
          canManageUsers:    false,
          canViewReports:    true,
          canManageKb:       false,
          canManageProjects: false,
        },
      };

    case 'employee':
      return { isAdmin: false, scope: 'own', permissions: noPermissions() };

    default:
      // Unknown / future roles get the safest possible defaults.
      return { isAdmin: false, scope: 'own', permissions: noPermissions() };
  }
}

/**
 * Helpdesk auth shim middleware.
 *
 * Reads `req.user` (populated by PLI Portal's existing `authenticate` middleware)
 * and attaches `req.hdUser` with helpdesk-flavoured identity and permission flags.
 * Must be placed **after** `authenticate` in the middleware chain.
 *
 * This middleware does NOT issue tokens or modify the session; it is a pure
 * projection from the PLI role model onto the helpdesk permission model.
 *
 * @type {import('express').RequestHandler}
 */
async function helpdeskAuth(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  try {
    // authenticate middleware applies renameIdsForClient() which renames id → _id.
    // Support both field names so this middleware works regardless of that transform.
    const id    = req.user._id ?? req.user.id;
    const { name, email, role } = req.user;
    const { isAdmin, scope, permissions } = resolveRoleMapping(role);

    // Legacy helpdesk group — kept for reads of old tickets only.
    // req.user may have hdGroupId (camelCase from ORM) or hd_group_id (snake_case from raw query).
    const groupId = req.user.hdGroupId ?? req.user.hd_group_id ?? null;

    // Reporting manager = the team this user belongs to as a member.
    // authenticate loads the full user row, so managerId is normally already here;
    // fall back to a single lookup only when the property is absent entirely.
    let managerId = Object.prototype.hasOwnProperty.call(req.user, 'managerId')
      ? req.user.managerId
      : undefined;
    if (managerId === undefined) {
      const row = await User.findOne({ attributes: ['managerId'], where: { id }, raw: true });
      managerId = row ? row.managerId : null;
    }
    managerId = managerId ?? null;

    /** @type {HdUser} */
    req.hdUser = {
      id, name, email, role, isAdmin, scope, permissions, groupId,
      managerId,
      teamManagerId: managerId,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Factory that returns an Express middleware enforcing a specific helpdesk permission.
 *
 * Access is granted when either of the following is true:
 *   1. `req.hdUser.isAdmin` is `true` (admins bypass all permission checks), or
 *   2. `req.hdUser.permissions[permission]` is `true`.
 *
 * The middleware must be placed **after** `helpdeskAuth` in the chain.
 *
 * @param {keyof HdPermissions} permission - The permission key to check.
 * @returns {import('express').RequestHandler}
 *
 * @example
 * router.post('/tickets', authenticate, helpdeskAuth, requireHdPermission('canManageTickets'), createTicket);
 */
function requireHdPermission(permission) {
  return function checkHdPermission(req, res, next) {
    if (!req.hdUser) {
      // helpdeskAuth was not applied upstream — fail loudly so the developer notices.
      return next(new UnauthorizedError('Helpdesk identity not established; apply helpdeskAuth before requireHdPermission'));
    }

    if (req.hdUser.isAdmin || req.hdUser.permissions[permission] === true) {
      return next();
    }

    return next(
      new ForbiddenError(`Permission denied: '${permission}' is required for this action`)
    );
  };
}

module.exports = { helpdeskAuth, requireHdPermission };
