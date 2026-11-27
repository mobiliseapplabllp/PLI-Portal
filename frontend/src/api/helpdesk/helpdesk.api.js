import api from '../axios';

export const getTicketsApi        = (params)     => api.get('/helpdesk/tickets', { params });
export const getTicketByIdApi     = (id)         => api.get(`/helpdesk/tickets/${id}`);
export const createTicketApi      = (data)       => api.post('/helpdesk/tickets', data);
export const updateTicketApi      = (id, data)   => api.put(`/helpdesk/tickets/${id}`, data);
export const deleteTicketApi      = (id)         => api.delete(`/helpdesk/tickets/${id}`);
export const bulkAssignTicketsApi = (data)       => api.post('/helpdesk/tickets/bulk-assign', data);

// Soft-deleted tickets (migration 067) — admin-only recycle bin.
export const getDeletedTicketsApi = (params)     => api.get('/helpdesk/tickets/deleted', { params });
export const restoreTicketApi     = (id)         => api.post(`/helpdesk/tickets/${id}/restore`);

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
export const updateHdOptionApi    = (id, data)   => api.put(`/helpdesk/options/${id}`, data);
export const deleteHdOptionApi    = (id)         => api.delete(`/helpdesk/options/${id}`);

// Admin-configurable SLA timing per priority (hd_sla_policies) — replaces
// the old hardcoded 4-hour "At Risk" window, and auto-computes a new
// ticket's dueDate from its priority when none is picked explicitly.
export const getSlaPoliciesApi    = ()           => api.get('/helpdesk/sla-policies');
export const updateSlaPolicyApi   = (id, data)   => api.put(`/helpdesk/sla-policies/${id}`, data);

// NOTE: user↔group mapping endpoints (GET/PUT /helpdesk/user-groups) were removed —
// the PUT routes now return 410 Gone. Team membership comes from users.managerId.

// Helpdesk ticket documents
export const getHdDocumentsApi       = (ticketId)        => api.get(`/helpdesk/tickets/${ticketId}/documents`);
export const uploadHdDocumentApi     = (ticketId, fd)    => api.post(`/helpdesk/tickets/${ticketId}/documents`, fd);
export const deleteHdDocumentApi     = (ticketId, docId) => api.delete(`/helpdesk/tickets/${ticketId}/documents/${docId}`);
export const downloadHdDocumentUrl   = (ticketId, docId) => `/api/helpdesk/tickets/${ticketId}/documents/${docId}/download`;
// Authenticated download — a plain <a href> to the URL above omits the Bearer
// token, so the endpoint 401s and the browser shows "File wasn't available".
export const downloadHdDocumentApi   = (ticketId, docId) =>
  api.get(`/helpdesk/tickets/${ticketId}/documents/${docId}/download`, { responseType: 'blob' });
