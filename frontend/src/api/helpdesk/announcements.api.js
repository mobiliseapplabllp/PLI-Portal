import api from '../axios';

/**
 * Fetch all helpdesk announcements.
 */
export const getAnnouncementsApi = () => api.get('/helpdesk/announcements');

/**
 * Create a new helpdesk announcement.
 * @param {object} data
 */
export const createAnnouncementApi = (data) => api.post('/helpdesk/announcements', data);

/**
 * Update an existing helpdesk announcement.
 * @param {number|string} id
 * @param {object} data
 */
export const updateAnnouncementApi = (id, data) =>
  api.put(`/helpdesk/announcements/${id}`, data);

/**
 * Delete a helpdesk announcement.
 * @param {number|string} id
 */
export const deleteAnnouncementApi = (id) => api.delete(`/helpdesk/announcements/${id}`);
