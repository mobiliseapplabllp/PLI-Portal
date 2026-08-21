import api from '../axios';

/**
 * Fetch a paginated, filtered list of tickets.
 * @param {{ page?: number, pageSize?: number, status?: string, priority?: string, category?: string, groupId?: number, projectId?: number, search?: string, dateFrom?: string, dateTo?: string }} params
 */
export const getTicketsApi = (params) => api.get('/helpdesk/tickets', { params });

/**
 * Fetch a single ticket by its ID.
 * @param {number|string} id
 */
export const getTicketByIdApi = (id) => api.get(`/helpdesk/tickets/${id}`);

/**
 * Create a new ticket.
 * @param {object} data
 */
export const createTicketApi = (data) => api.post('/helpdesk/tickets', data);

/**
 * Update an existing ticket.
 * @param {number|string} id
 * @param {object} data
 */
export const updateTicketApi = (id, data) => api.put(`/helpdesk/tickets/${id}`, data);

/**
 * Delete a ticket.
 * @param {number|string} id
 */
export const deleteTicketApi = (id) => api.delete(`/helpdesk/tickets/${id}`);

/**
 * Bulk-assign multiple tickets to an agent.
 * @param {{ ticketIds: number[], assigneeId: number }} data
 */
export const bulkAssignApi = (data) => api.post('/helpdesk/tickets/bulk-assign', data);

/**
 * Fetch the audit/change history for a ticket.
 * @param {number|string} id
 */
export const getTicketHistoryApi = (id) => api.get(`/helpdesk/tickets/${id}/history`);

/**
 * Link one ticket to another with a given link type.
 * @param {number|string} id
 * @param {{ linkedTicketId: number, linkType: string }} data
 */
export const linkTicketApi = (id, data) => api.post(`/helpdesk/tickets/${id}/link`, data);

/**
 * Bulk-upload tickets from a parsed CSV row array.
 * @param {object[]} rows  Array of plain objects keyed by CSV header names.
 */
export const bulkUploadTicketsApi = (rows) => api.post('/helpdesk/tickets/bulk-upload', { rows });
