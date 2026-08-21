import api from '../axios';

/**
 * Fetch all helpdesk approvals.
 */
export const getApprovalsApi = () => api.get('/helpdesk/approvals');

/**
 * Request approval for a ticket.
 * @param {number|string} ticketId
 * @param {{ approverId: number }} data
 */
export const requestApprovalApi = (ticketId, data) =>
  api.post(`/helpdesk/approvals/${ticketId}/request`, data);

/**
 * Get the current approval status for a ticket.
 * @param {number|string} ticketId
 */
export const getApprovalStatusApi = (ticketId) =>
  api.get(`/helpdesk/approvals/${ticketId}/status`);

/**
 * Cancel / delete an approval request.
 * @param {number|string} id
 */
export const cancelApprovalApi = (id) => api.delete(`/helpdesk/approvals/${id}`);
