'use strict';

/**
 * @module services/helpdesk/team
 *
 * Helpdesk TEAM = a manager (users row) + their ACTIVE direct reports
 * (users.managerId = manager.id). Source of truth is the employee master —
 * never hd_groups.
 *
 * ONE membership rule, used by every helpdesk check:
 *   user U is in the team of manager M  ⇔  U.id === M.id OR U.managerId === M.id  (and U.isActive)
 *
 * Every function issues exactly one query and never selects passwordHash.
 */

const { Op } = require('sequelize');
const sequelize  = require('../../config/database');
const User       = require('../../models/User');

/** Columns safe to expose to clients. */
const PUBLIC_ATTRS = ['id', 'name', 'email', 'designation', 'role', 'departmentId', 'managerId', 'isActive'];

/**
 * Active users who have at least one active direct report.
 * memberCount excludes the manager themself. Sorted by name.
 *
 * @param {{ departmentId?: string|null }} [opts] - optional filter on the MANAGER's department
 * @returns {Promise<Array<{ id:string, name:string, email:string, designation:string|null, departmentName:string|null, memberCount:number }>>}
 */
async function listTeams({ departmentId } = {}) {
  const replacements = [];
  let where = 'm.isActive = 1';
  if (departmentId) { where += ' AND m.departmentId = ?'; replacements.push(String(departmentId)); }

  const [rows] = await sequelize.query(
    `SELECT m.id, m.name, m.email, m.designation,
            d.name        AS departmentName,
            COUNT(r.id)   AS memberCount
       FROM users m
       JOIN users r        ON r.managerId = m.id AND r.isActive = 1
       LEFT JOIN departments d ON d.id = m.departmentId
      WHERE ${where}
      GROUP BY m.id, m.name, m.email, m.designation, d.name
      ORDER BY m.name ASC`,
    { replacements }
  );

  return rows.map(r => ({
    id:             r.id,
    name:           r.name,
    email:          r.email,
    designation:    r.designation ?? null,
    departmentName: r.departmentName ?? null,
    memberCount:    Number(r.memberCount) || 0,
  }));
}

/**
 * Manager + active direct reports (manager first, then reports sorted by name).
 *
 * @param {string} managerId
 * @returns {Promise<null | { manager:{id,name,email}, members:Array<{id,name,email,designation,role,isManager:boolean}> }>}
 *   null when the manager is unknown or inactive.
 */
async function getTeamMembers(managerId) {
  if (!managerId) return null;
  const rows = await User.findAll({
    attributes: PUBLIC_ATTRS,
    where: { isActive: true, [Op.or]: [{ id: managerId }, { managerId }] },
    order: [['name', 'ASC']],
    raw: true,
  });

  const manager = rows.find(u => u.id === managerId);
  if (!manager) return null;

  const toMember = (u, isManager) => ({
    id:          u.id,
    name:        u.name,
    email:       u.email,
    designation: u.designation ?? null,
    role:        u.role,
    isManager,
  });

  return {
    manager: { id: manager.id, name: manager.name, email: manager.email },
    members: [
      toMember(manager, true),
      ...rows.filter(u => u.id !== managerId).map(u => toMember(u, false)),
    ],
  };
}

/**
 * Is `userId` a member of `managerId`'s team? (self OR active direct report)
 *
 * @param {string} userId
 * @param {string} managerId
 * @returns {Promise<boolean>}
 */
async function isInTeam(userId, managerId) {
  if (!userId || !managerId) return false;
  const n = await User.count({
    where: { id: userId, isActive: true, [Op.or]: [{ id: managerId }, { managerId }] },
  });
  return n > 0;
}

/**
 * Ids of everyone in the team: [managerId, ...activeDirectReportIds].
 * Empty array when the manager is unknown or inactive.
 *
 * @param {string} managerId
 * @returns {Promise<string[]>}
 */
async function teamMemberIds(managerId) {
  if (!managerId) return [];
  const rows = await User.findAll({
    attributes: ['id'],
    where: { isActive: true, [Op.or]: [{ id: managerId }, { managerId }] },
    raw: true,
  });
  if (!rows.some(r => r.id === managerId)) return [];
  return [managerId, ...rows.map(r => r.id).filter(id => id !== managerId)];
}

/**
 * The user's own reporting manager id (users.managerId), or null.
 *
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function managerOf(userId) {
  if (!userId) return null;
  const row = await User.findOne({ attributes: ['managerId'], where: { id: userId }, raw: true });
  return row?.managerId ?? null;
}

/**
 * Resolve the team for a ticket from the (assigneeId, teamManagerId) pair (B5/B6/B7).
 *
 * THE single implementation of the team rule — every assignment path (create,
 * update, bulk assign, ticket allocation exception) must go through it.
 *
 *  - teamManagerId given → must be an active user who manages ≥1 active report
 *    (or, when equal to assigneeId, any active user); assignee (if any) must be
 *    in that team.
 *  - only assigneeId given → team = assignee's ACTIVE reporting manager, or the
 *    assignee themselves when they have none.
 *  - neither → both null.
 *
 * @param {{ assigneeId?: string|null, teamManagerId?: string|null }} input
 * @returns {Promise<{ error: string } | { assigneeId: string|null, teamManagerId: string|null }>}
 */
async function resolveTeamFor({ assigneeId, teamManagerId } = {}) {
  const blank = (v) => v === undefined || v === null || v === '';
  const assignee = blank(assigneeId)    ? null : String(assigneeId);
  const manager  = blank(teamManagerId) ? null : String(teamManagerId);

  if (manager) {
    const mgr = await User.findOne({ where: { id: manager, isActive: true }, attributes: ['id'] });
    if (!mgr) return { error: 'Team manager not found or inactive' };
    if (manager !== assignee) {
      const ids = await teamMemberIds(manager);
      if (ids.length <= 1) return { error: 'Selected team manager has no active direct reports' };
    }
    if (assignee && !(await isInTeam(assignee, manager))) {
      return { error: 'Assignee is not in the selected team' };
    }
    return { assigneeId: assignee, teamManagerId: manager };
  }

  if (assignee) {
    const u = await User.findOne({ where: { id: assignee, isActive: true }, attributes: ['id'] });
    if (!u) return { error: 'Assignee not found or inactive' };
    // Their reporting manager becomes the team — but only if that manager is still
    // active; otherwise the assignee stands as their own team (a "self team").
    const mgrId = await managerOf(assignee);
    const activeMgr = mgrId
      ? await User.findOne({ where: { id: mgrId, isActive: true }, attributes: ['id'] })
      : null;
    return { assigneeId: assignee, teamManagerId: activeMgr ? mgrId : assignee };
  }

  return { assigneeId: null, teamManagerId: null };
}

/**
 * The team to validate against when only the ASSIGNEE changes: keep the ticket's
 * current team when the new assignee belongs to it, otherwise derive it from the
 * assignee. `bodyTeam === undefined` means the caller sent no team at all.
 *
 * @returns {Promise<{ error: string } | { assigneeId: string|null, teamManagerId: string|null }>}
 */
async function resolveTeamForTicket(ticket, { assigneeId, teamManagerId } = {}) {
  let teamInput = teamManagerId;
  if (teamInput === undefined) {
    teamInput = (ticket?.teamManagerId && assigneeId && await isInTeam(String(assigneeId), String(ticket.teamManagerId)))
      ? String(ticket.teamManagerId)
      : null;
  }
  return resolveTeamFor({ assigneeId, teamManagerId: teamInput });
}

module.exports = {
  listTeams, getTeamMembers, isInTeam, teamMemberIds, managerOf,
  resolveTeamFor, resolveTeamForTicket,
};
