import api from '../axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Upload a file attachment for a ticket.
 * Sends as multipart/form-data — Content-Type is deliberately NOT set here;
 * axios only auto-computes the required boundary when you let it detect the
 * FormData body itself. Setting this header manually (as this used to do,
 * despite the comment above claiming otherwise) breaks that and the server
 * can't parse the upload at all.
 * @param {number|string} ticketId
 * @param {File} file
 */
export const uploadAttachmentApi = (ticketId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post(`/helpdesk/tickets/${ticketId}/attachments`, formData);
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
