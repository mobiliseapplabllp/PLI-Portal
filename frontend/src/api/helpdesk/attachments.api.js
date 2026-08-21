import api from '../axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Upload a file attachment for a ticket.
 * Sends as multipart/form-data; axios sets the boundary automatically.
 * @param {number|string} ticketId
 * @param {File} file
 */
export const uploadAttachmentApi = (ticketId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/helpdesk/tickets/${ticketId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Delete an attachment by its ID.
 * @param {number|string} id
 */
export const deleteAttachmentApi = (id) => api.delete(`/helpdesk/attachments/${id}`);

/**
 * Build the direct URL for an attachment by its stored filename.
 * Returns a string — no HTTP request is made.
 * @param {string} storedName
 * @returns {string}
 */
export const getAttachmentUrl = (storedName) =>
  `${API_URL}/helpdesk/attachments/${storedName}`;
