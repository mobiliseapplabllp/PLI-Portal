import api from './axios';

// ── Client Organisations ──────────────────────────────────────────────────────
export const getClientOrgsApi      = (params) => api.get('/csat/client-organisations', { params });
export const getClientOrgApi       = (id)     => api.get(`/csat/client-organisations/${id}`);
export const createClientOrgApi    = (data)   => api.post('/csat/client-organisations', data);
export const updateClientOrgApi    = (id, data) => api.put(`/csat/client-organisations/${id}`, data);
export const deleteClientOrgApi    = (id)     => api.delete(`/csat/client-organisations/${id}`);

// ── Surveys ───────────────────────────────────────────────────────────────────
export const getSurveysApi   = (params) => api.get('/csat/surveys', { params });
export const getSurveyApi    = (id)     => api.get(`/csat/surveys/${id}`);
export const createSurveyApi = (data)   => api.post('/csat/surveys', data);
export const updateSurveyApi = (id, data) => api.put(`/csat/surveys/${id}`, data);
export const publishSurveyApi = (id)   => api.patch(`/csat/surveys/${id}/publish`);
export const archiveSurveyApi = (id)   => api.delete(`/csat/surveys/${id}`);

// ── Dispatches ────────────────────────────────────────────────────────────────
export const getDashboardApi            = ()          => api.get('/csat/dispatches/dashboard');
export const getDispatchesApi           = (params)    => api.get('/csat/dispatches', { params });
export const getDispatchDetailApi       = (id)        => api.get(`/csat/dispatches/${id}`);
export const createDispatchApi          = (data)      => api.post('/csat/dispatches', data);
export const closeDispatchApi           = (id)        => api.patch(`/csat/dispatches/${id}/close`);
export const getDispatchResponsesApi    = (id)        => api.get(`/csat/dispatches/${id}/responses`);
export const getRecipientResponsesApi   = (id, rId)  => api.get(`/csat/dispatches/${id}/responses/${rId}`);
export const exportDispatchApi          = (id)        => api.get(`/csat/dispatches/${id}/export`, { responseType: 'arraybuffer' });
export const resendEmailApi             = (recipientId) => api.patch(`/csat/dispatches/recipients/${recipientId}/resend`);

// ── Public Survey (no auth) ───────────────────────────────────────────────────
export const getPublicSurveyApi    = (token)       => api.get(`/public/survey/${token}`);
export const submitPublicSurveyApi = (token, data) => api.post(`/public/survey/${token}`, data);

// ── Survey Approvals ──────────────────────────────────────────────────────────
export const getApprovalsApi          = (params)    => api.get('/csat/approvals', { params });
export const getMyApprovalRequestsApi = (params)    => api.get('/csat/approvals/my-requests', { params });
export const getApprovalDetailApi     = (id)        => api.get(`/csat/approvals/${id}`);
export const approveDispatchApi       = (id, data)  => api.post(`/csat/approvals/${id}/approve`, data);
export const requestChangesApi        = (id, data)  => api.post(`/csat/approvals/${id}/request-changes`, data);
export const rejectDispatchApi        = (id, data)  => api.post(`/csat/approvals/${id}/reject`, data);
export const submitForApprovalApi     = (dispatchId)       => api.post(`/csat/dispatches/${dispatchId}/submit-approval`);
export const reviseDispatchApi        = (dispatchId, data) => api.put(`/csat/dispatches/${dispatchId}/revise`, data);
export const resubmitForApprovalApi   = (dispatchId)       => api.post(`/csat/dispatches/${dispatchId}/resubmit`);

// ── Client Employees ──────────────────────────────────────────────────────────
export const getClientEmployeesApi   = (orgId, params) => api.get(`/csat/client-organisations/${orgId}/employees`, { params });
export const createClientEmployeeApi = (orgId, data)   => api.post(`/csat/client-organisations/${orgId}/employees`, data);
export const updateClientEmployeeApi = (orgId, empId, data) => api.put(`/csat/client-organisations/${orgId}/employees/${empId}`, data);
export const deleteClientEmployeeApi = (orgId, empId) => api.delete(`/csat/client-organisations/${orgId}/employees/${empId}`);
