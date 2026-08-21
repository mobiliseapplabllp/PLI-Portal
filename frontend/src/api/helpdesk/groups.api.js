import api from '../axios';

/**
 * Fetch all helpdesk groups.
 */
export const getGroupsApi = () => api.get('/helpdesk/groups');

/**
 * Create a new helpdesk group.
 * @param {object} data
 */
export const createGroupApi = (data) => api.post('/helpdesk/groups', data);

/**
 * Update an existing helpdesk group.
 * @param {number|string} id
 * @param {object} data
 */
export const updateGroupApi = (id, data) => api.put(`/helpdesk/groups/${id}`, data);

/**
 * Delete a helpdesk group.
 * @param {number|string} id
 */
export const deleteGroupApi = (id) => api.delete(`/helpdesk/groups/${id}`);
