import api from '../axios';

export const getTicketsApi        = (params)     => api.get('/helpdesk/tickets', { params });
export const getTicketByIdApi     = (id)         => api.get(`/helpdesk/tickets/${id}`);
export const createTicketApi      = (data)       => api.post('/helpdesk/tickets', data);
export const updateTicketApi      = (id, data)   => api.put(`/helpdesk/tickets/${id}`, data);
export const deleteTicketApi      = (id)         => api.delete(`/helpdesk/tickets/${id}`);
export const bulkAssignTicketsApi = (data)       => api.post('/helpdesk/tickets/bulk-assign', data);

/** @deprecated Legacy read-only group names — teams come from GET /helpdesk/teams. */
export const getGroupsApi         = ()           => api.get('/helpdesk/groups');
/** Legacy helpdesk projects (GET /helpdesk/projects); the ?groupId filter was removed server-side. */
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

// NOTE: user↔group mapping endpoints (GET/PUT /helpdesk/user-groups) were removed —
// the PUT routes now return 410 Gone. Team membership comes from users.managerId.

// Helpdesk ticket documents
export const getHdDocumentsApi       = (ticketId)        => api.get(`/helpdesk/tickets/${ticketId}/documents`);
export const uploadHdDocumentApi     = (ticketId, fd)    => api.post(`/helpdesk/tickets/${ticketId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteHdDocumentApi     = (ticketId, docId) => api.delete(`/helpdesk/tickets/${ticketId}/documents/${docId}`);
export const downloadHdDocumentUrl   = (ticketId, docId) => `/api/helpdesk/tickets/${ticketId}/documents/${docId}/download`;
