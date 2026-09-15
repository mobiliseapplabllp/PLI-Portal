'use strict';

/**
 * @module services/helpdesk/groupMembership
 * THE single rule for "who belongs to a helpdesk group". Every caller —
 * ticket assignee checks, capacity suggestions, assignee dropdowns, the User
 * Master screen and helpdeskAuth — must agree, so it lives here only.
 *
 *   effective group = users.hd_group_id (explicit override)
 *                     ?? lowest-id hd_groups row whose department_id = users.departmentId
 *                     ?? none
 *
 * A user is a member of exactly one group: their effective group. An override
 * pointing elsewhere removes them from their department's group.
 */

const { Op } = require('sequelize');
const User    = require('../../models/User');
const HdGroup = require('../../models/helpdesk/HdGroup');

const key = (v) => (v == null ? null : String(v).toLowerCase());

/** department id (lower-cased) → lowest group id backed by that department. */
async function loadDepartmentGroupMap() {
  const groups = await HdGroup.findAll({
    where: { departmentId: { [Op.ne]: null } },
    attributes: ['id', 'departmentId'],
    order: [['id', 'ASC']],
    raw: true,
  });
  const map = new Map();
  for (const g of groups) {
    const k = key(g.departmentId);
    if (k && !map.has(k)) map.set(k, g.id);
  }
  return map;
}

/** Effective group id for a user row { hdGroupId, departmentId }. */
function effectiveGroupId(user, deptGroupMap) {
  if (!user) return null;
  if (user.hdGroupId != null) return Number(user.hdGroupId);
  return deptGroupMap.get(key(user.departmentId)) ?? null;
}

/**
 * Is `userId` a member of `groupId` under the effective-group rule?
 * Unknown user / group → false.
 */
async function isGroupMember(userId, groupId) {
  if (!userId || !groupId) return false;
  const gid = Number(groupId);
  if (!Number.isInteger(gid)) return false;
  const [user, group] = await Promise.all([
    User.findByPk(userId, { attributes: ['id', 'hdGroupId', 'departmentId'] }),
    HdGroup.findByPk(gid, { attributes: ['id'] }),
  ]);
  if (!user || !group) return false;
  if (user.hdGroupId != null) return Number(user.hdGroupId) === gid;
  if (!user.departmentId) return false;
  const map = await loadDepartmentGroupMap();
  return map.get(key(user.departmentId)) === gid;
}

/**
 * Active users whose effective group is `group`.
 * @param {{ id:number, departmentId?:string|null }} group
 * @param {{ attributes?: string[], order?: any[] }} [opts]
 */
async function listGroupMembers(group, opts = {}) {
  const gid = Number(group.id);
  const or = [{ hdGroupId: gid }];
  if (group.departmentId) or.push({ hdGroupId: null, departmentId: group.departmentId });
  const attrs = opts.attributes ? [...new Set([...opts.attributes, 'hdGroupId', 'departmentId'])] : undefined;
  const candidates = await User.findAll({
    where: { isActive: true, [Op.or]: or },
    ...(attrs ? { attributes: attrs } : {}),
    order: opts.order || [['name', 'ASC']],
  });
  if (!group.departmentId) return candidates;
  const map = await loadDepartmentGroupMap();
  return candidates.filter((u) => effectiveGroupId(u, map) === gid);
}

module.exports = { loadDepartmentGroupMap, effectiveGroupId, isGroupMember, listGroupMembers };
