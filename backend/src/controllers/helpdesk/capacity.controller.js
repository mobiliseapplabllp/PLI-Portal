'use strict';

/**
 * @module controllers/helpdesk/capacity
 * Capacity-based assignee suggestion for helpdesk tickets.
 *
 * Pure read: for a set of users (a group's members, or explicit ids) compute
 * each person's free hours over a window from their PM + helpdesk allocations
 * (services/pm/utilisation.service.loadAllocations → utils/capacityEngine.summarise),
 * add their open-ticket count, sort by availability and suggest the top 3.
 *
 * No permission beyond helpdeskAuth — any helpdesk user may ask "who is free?".
 */

const { Op, fn, col } = require('sequelize');
const User      = require('../../models/User');
const HdGroup   = require('../../models/helpdesk/HdGroup');
const HdTicket  = require('../../models/helpdesk/HdTicket');
const { loadAllocations } = require('../../services/pm/utilisation.service');
const pmSettingsService   = require('../../services/pm/pmSettings.service');
const E = require('../../utils/capacityEngine');
const { sendSuccess, sendError } = require('../../utils/response');
const { listGroupMembers } = require('../../services/helpdesk/groupMembership.service');

const DEFAULT_WINDOW_DAYS = 14;
const SUGGEST_COUNT       = 3;
const INACTIVE_TICKET_STATUSES = ['closed', 'resolved'];
const USER_ATTRS = ['id', 'name', 'email', 'role', 'designation'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strict YYYY-MM-DD → local Date, or null when malformed / not a real date. */
function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
  const d = E.toDate(s);
  return d && E.iso(d) === s ? d : null;
}

/**
 * Resolve ?from / ?to with defaults (today → today + 14 days).
 * @returns {{ from: string, to: string } | { error: string }}
 */
function resolveWindow(query) {
  const now  = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let from = base;
  if (query.from != null && query.from !== '') {
    from = parseDate(query.from);
    if (!from) return { error: 'from must be a valid date in YYYY-MM-DD format' };
  }
  let to = new Date(from.getTime() + DEFAULT_WINDOW_DAYS * 86400000);
  if (query.to != null && query.to !== '') {
    to = parseDate(query.to);
    if (!to) return { error: 'to must be a valid date in YYYY-MM-DD format' };
  }
  if (to < from) return { error: '"to" date is before "from" date' };
  return { from: E.iso(from), to: E.iso(to) };
}

/** Does an allocation overlap the [from, to] window? (no start → treated as today, like the engine). */
function overlapsWindow(alloc, from, to) {
  const start = alloc.allocationFrom || E.iso(new Date());
  if (start > to) return false;
  if (alloc.allocationTo && alloc.allocationTo < from) return false;
  return true;
}

/** Open (not closed/resolved) ticket count per assignee — one grouped query. */
async function countOpenTickets(userIds) {
  if (!userIds.length) return new Map();
  const rows = await HdTicket.findAll({
    attributes: ['assigneeId', [fn('COUNT', col('id')), 'count']],
    where: { assigneeId: { [Op.in]: userIds }, status: { [Op.notIn]: INACTIVE_TICKET_STATUSES } },
    group: ['assignee_id'],
    raw: true,
  });
  return new Map(rows.map(r => [String(r.assigneeId), Number(r.count)]));
}

/** Compare for the suggestion order: freeHours DESC, openTickets ASC, name ASC. */
const byAvailability = (a, b) =>
  (b.freeHours - a.freeHours) ||
  (a.openTickets - b.openTickets) ||
  String(a.name || '').localeCompare(String(b.name || ''));

/**
 * Compute the capacity picture for a list of User rows and send it.
 * Loads the calendar once and the allocations once (batched).
 */
async function respondWithCapacity(res, users, { from, to, group }) {
  const ids = users.map(u => String(u.id));
  const [calendar, allocByUser, openByUser] = await Promise.all([
    pmSettingsService.getCalendar(),
    loadAllocations(ids),
    countOpenTickets(ids),
  ]);

  const members = users.map(u => {
    const id     = String(u.id);
    const allocs = allocByUser.get(id) || [];
    const s      = E.summarise(allocs, calendar, from, to);
    return {
      userId: id,
      name: u.name, email: u.email, role: u.role, designation: u.designation,
      freeHours: s.freeHours,
      peakHours: s.peakHours,
      avgHours:  s.avgHours,
      isOverAllocated: s.isOverAllocated,
      nextFreeDate: s.nextFreeDate,
      openTickets: openByUser.get(id) || 0,
      allocationsCount: allocs.filter(a => overlapsWindow(a, from, to)).length,
    };
  }).sort(byAvailability);

  return sendSuccess(res, {
    from, to,
    capacity:  E.normaliseCalendar(calendar).hoursPerDay,
    groupId:   group ? group.id : null,
    groupName: group ? group.name : null,
    members,
    suggested: members.slice(0, SUGGEST_COUNT).map(m => m.userId),
  }, 'Capacity computed');
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /helpdesk/groups/:groupId/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Members = active users with hd_group_id = group, plus (when hd_groups has a
 * department_id column) active users in the group's department.
 * @type {import('express').RequestHandler}
 */
const getGroupCapacity = async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId, 10);
    if (!Number.isInteger(groupId) || groupId <= 0) return sendError(res, 'Invalid group id', 400);

    const win = resolveWindow(req.query || {});
    if (win.error) return sendError(res, win.error, 400);

    const group = await HdGroup.findByPk(groupId);
    if (!group) return sendError(res, 'Group not found', 404);

    // Same membership rule as ticket assignment (override → department group).
    const users = await listGroupMembers(group, { attributes: USER_ATTRS, order: [['name', 'ASC']] });

    return respondWithCapacity(res, users, { from: win.from, to: win.to, group });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /helpdesk/capacity?userIds=a,b,c&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Same picture for an explicit list of users. Unknown / inactive ids are dropped.
 * @type {import('express').RequestHandler}
 */
const getUsersCapacity = async (req, res, next) => {
  try {
    const raw = req.query?.userIds;
    const ids = [...new Set(
      (Array.isArray(raw) ? raw : String(raw || '').split(','))
        .map(s => String(s).trim()).filter(Boolean)
    )];
    if (!ids.length) return sendError(res, 'userIds is required (comma-separated list)', 400);

    const win = resolveWindow(req.query || {});
    if (win.error) return sendError(res, win.error, 400);

    const users = await User.findAll({
      where: { id: { [Op.in]: ids }, isActive: true },
      attributes: USER_ATTRS,
      order: [['name', 'ASC']],
    });

    return respondWithCapacity(res, users, { from: win.from, to: win.to, group: null });
  } catch (err) {
    next(err);
  }
};

module.exports = { getGroupCapacity, getUsersCapacity };
