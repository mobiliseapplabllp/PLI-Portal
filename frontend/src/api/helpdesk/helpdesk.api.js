import api from '../axios';

export const getTicketsApi        = (params)     => api.get('/helpdesk/tickets', { params });
export const getTicketByIdApi     = (id)         => api.get(`/helpdesk/tickets/${id}`);
export const createTicketApi      = (data)       => api.post('/helpdesk/tickets', data);
export const updateTicketApi      = (id, data)   => api.put(`/helpdesk/tickets/${id}`, data);
export const deleteTicketApi      = (id)         => api.delete(`/helpdesk/tickets/${id}`);
export const bulkAssignTicketsApi = (data)       => api.post('/helpdesk/tickets/bulk-assign', data);

export const getGroupsApi         = ()           => api.get('/helpdesk/groups');
export const getHdProjectsApi     = ()           => api.get('/helpdesk/projects');
export const getSolutionsApi      = (params)     => api.get('/helpdesk/solutions', { params });
export const getAnnouncementsApi  = ()           => api.get('/helpdesk/announcements');
export const getDashboardStatsApi = ()           => api.get('/helpdesk/dashboard/stats');

// Ticket history and linking (also exported from tickets.api.js)
export const getTicketHistoryApi  = (id)         => api.get(`/helpdesk/tickets/${id}/history`);
export const linkTicketApi        = (id, data)   => api.post(`/helpdesk/tickets/${id}/link`, data);

// Helpdesk field options (Category, Status, Priority, Mode, etc.)
export const getHdOptionsApi      = (type)       => api.get('/helpdesk/options', { params: { type } });
export const getAllHdOptionsApi    = ()           => api.get('/helpdesk/options/all');
export const createHdOptionApi    = (data)       => api.post('/helpdesk/options', data);
export const deleteHdOptionApi    = (id)         => api.delete(`/helpdesk/options/${id}`);

/**
 * Fetch all users with their current helpdesk group assignment.
 */
export const getUserGroupsApi = () => api.get('/helpdesk/user-groups');

/**
 * Assign a single user to a helpdesk group (or null to unassign).
 * @param {string} userId
 * @param {number|null} groupId
 */
export const assignUserGroupApi = (userId, groupId) =>
  api.put(`/helpdesk/user-groups/${userId}`, { groupId });

/**
 * Bulk-assign multiple users to helpdesk groups.
 * @param {{ userId: string, groupId: number|null }[]} assignments
 */
export const bulkAssignUserGroupsApi = (assignments) =>
  api.put('/helpdesk/user-groups/bulk', { assignments });
