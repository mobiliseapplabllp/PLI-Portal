import api from '../axios';

/**
 * Capacity suggestion for a helpdesk group over a date window.
 * GET /helpdesk/groups/:groupId/capacity?from&to
 * → { from, to, capacity, groupId, groupName, members:[...], suggested:[userId×≤3] }
 * @param {number|string} groupId
 * @param {{ from?: string, to?: string }} [params] - ISO dates (YYYY-MM-DD)
 */
export const getGroupCapacityApi = (groupId, params) =>
  api.get(`/helpdesk/groups/${groupId}/capacity`, { params });

/**
 * Members of a helpdesk group, using the SAME membership rule the server applies
 * when assigning (override group → department group). Backed by the capacity
 * endpoint, so each member also carries freeHours / openTickets for the next 2 weeks.
 * Resolves to user-like objects: { _id, id, name, email, role, designation, ... }.
 */
export const getGroupMembersApi = async (groupId) => {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const from = new Date();
  const to = new Date(); to.setDate(to.getDate() + 14);
  const res = await getGroupCapacityApi(groupId, { from: iso(from), to: iso(to) });
  const data = res.data?.data ?? res.data ?? {};
  return (Array.isArray(data.members) ? data.members : []).map((m) => ({ ...m, _id: m.userId, id: m.userId }));
};
