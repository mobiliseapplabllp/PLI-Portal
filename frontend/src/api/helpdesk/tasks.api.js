import api from '../axios';

/**
 * Fetch all tasks associated with a ticket.
 * @param {number|string} ticketId
 */
export const getTasksApi = (ticketId) => api.get(`/helpdesk/tickets/${ticketId}/tasks`);

/**
 * Create a new task under a ticket.
 * @param {number|string} ticketId
 * @param {object} data
 */
export const createTaskApi = (ticketId, data) =>
  api.post(`/helpdesk/tickets/${ticketId}/tasks`, data);

/**
 * Update an existing task.
 * @param {number|string} id
 * @param {object} data
 */
export const updateTaskApi = (id, data) => api.put(`/helpdesk/tasks/${id}`, data);

/**
 * Delete a task.
 * @param {number|string} id
 */
export const deleteTaskApi = (id) => api.delete(`/helpdesk/tasks/${id}`);
