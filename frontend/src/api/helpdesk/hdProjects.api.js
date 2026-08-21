import api from '../axios';

/**
 * Fetch helpdesk projects.
 * @param {object} [params] - Optional query params, e.g. { groupId: 3 } to scope by team
 */
export const getHdProjectsApi = (params) => api.get('/helpdesk/projects', { params });

/**
 * Create a new helpdesk project.
 * @param {object} data
 */
export const createHdProjectApi = (data) => api.post('/helpdesk/projects', data);

/**
 * Update an existing helpdesk project.
 * @param {number|string} id
 * @param {object} data
 */
export const updateHdProjectApi = (id, data) => api.put(`/helpdesk/projects/${id}`, data);

/**
 * Delete a helpdesk project.
 * @param {number|string} id
 */
export const deleteHdProjectApi = (id) => api.delete(`/helpdesk/projects/${id}`);

/**
 * Regenerate the API token for a helpdesk project.
 * @param {number|string} id
 */
export const regenerateTokenApi = (id) =>
  api.post(`/helpdesk/projects/${id}/regenerate-token`);
