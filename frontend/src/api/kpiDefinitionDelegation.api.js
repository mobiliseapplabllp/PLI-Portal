import api from './axios';

// Admin-only — grant/revoke KPI Definer rights, assign/remove department Approver.
export const getKpiDefinersApi = () => api.get('/kpi-definition-delegation/definers');
export const grantKpiDefinerApi = (userId) => api.post('/kpi-definition-delegation/definers', { userId });
export const revokeKpiDefinerApi = (userId) => api.delete(`/kpi-definition-delegation/definers/${userId}`);

export const getKpiDefinitionApproversApi = () => api.get('/kpi-definition-delegation/approvers');
export const assignKpiDefinitionApproverApi = (departmentId, userId) =>
  api.put(`/kpi-definition-delegation/approvers/${departmentId}`, { userId });
export const removeKpiDefinitionApproverApi = (departmentId) =>
  api.delete(`/kpi-definition-delegation/approvers/${departmentId}`);
