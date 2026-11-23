import api from './axios';

export const getMyKpiDefinitionAccessApi = () => api.get('/kpi-definition-requests/my-access');
export const getKpiDefinitionRequestsApi = (params) => api.get('/kpi-definition-requests', { params });
export const approveKpiDefinitionRequestApi = (id, note) => api.post(`/kpi-definition-requests/${id}/approve`, { note });
export const rejectKpiDefinitionRequestApi = (id, note) => api.post(`/kpi-definition-requests/${id}/reject`, { note });
export const grantSubDefinerApi = (userId) => api.post('/kpi-definition-requests/sub-definers', { userId });
export const getMyGrantedDefinersApi = () => api.get('/kpi-definition-requests/sub-definers');
export const revokeMyGrantedDefinerApi = (userId) => api.delete(`/kpi-definition-requests/sub-definers/${userId}`);
