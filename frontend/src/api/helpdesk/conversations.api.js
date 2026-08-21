import api from '../axios';

/**
 * Fetch all conversations (messages) for a ticket.
 * @param {number|string} ticketId
 */
export const getConversationsApi = (ticketId) =>
  api.get(`/helpdesk/tickets/${ticketId}/conversations`);

/**
 * Add a new conversation message to a ticket.
 * Builds FormData internally so that `isInternal` is always sent correctly.
 * @param {number|string} ticketId
 * @param {{ message: string, isInternal?: boolean, file?: File|null }} options
 */
export const addConversationApi = (ticketId, { message, isInternal = false, file = null }) => {
  const fd = new FormData();
  fd.append('message', message);
  fd.append('isInternal', String(isInternal));
  if (file) fd.append('file', file);
  return api.post(`/helpdesk/tickets/${ticketId}/conversations`, fd);
};

/**
 * Update an existing conversation message.
 * @param {number|string} id
 * @param {object} data
 */
export const updateConversationApi = (id, data) =>
  api.put(`/helpdesk/tickets/conversations/${id}`, data);

/**
 * Delete a conversation message.
 * @param {number|string} id
 */
export const deleteConversationApi = (id) => api.delete(`/helpdesk/tickets/conversations/${id}`);
