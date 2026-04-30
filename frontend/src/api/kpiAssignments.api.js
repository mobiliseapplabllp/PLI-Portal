import api from './axios';

export const getAssignmentsApi = (params) => api.get('/kpi-assignments', { params });
export const getAssignmentByIdApi = (id) => api.get(`/kpi-assignments/${id}`);
export const createAssignmentApi = (data) => api.post('/kpi-assignments', data);
export const updateAssignmentApi = (id, data) => api.put(`/kpi-assignments/${id}`, data);
export const assignToEmployeeApi = (id) => api.post(`/kpi-assignments/${id}/assign`);
export const commitKpiApi = (id, items) => api.post(`/kpi-assignments/${id}/commit`, { items });
export const saveDraftApi = (id, items) => api.post(`/kpi-assignments/${id}/save-draft`, { items });
export const approveCommitmentApi = (id) => api.post(`/kpi-assignments/${id}/approve-commitment`);
export const rejectCommitmentApi = (id, rejectionComment) => api.post(`/kpi-assignments/${id}/reject-commitment`, { rejectionComment });
export const reviewCommitmentApi = (id, items) => api.post(`/kpi-assignments/${id}/review-commitment`, { items });

// Employee achievement submit — supports optional file attachment via FormData
export const employeeSubmitApi = (id, items, file) => {
  if (file) {
    const fd = new FormData();
    fd.append('items', JSON.stringify(items));
    fd.append('attachment', file);
    return api.post(`/kpi-assignments/${id}/employee-submit`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.post(`/kpi-assignments/${id}/employee-submit`, { items });
};

// Manager review submit — supports optional file attachment via FormData
export const managerReviewApi = (id, items, file) => {
  if (file) {
    const fd = new FormData();
    fd.append('items', JSON.stringify(items));
    fd.append('attachment', file);
    return api.post(`/kpi-assignments/${id}/manager-review`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }
  return api.post(`/kpi-assignments/${id}/manager-review`, { items });
};

// finalReviewApi removed — replaced by finalApprover quarterly approval flow
export const lockAssignmentApi = (id) => api.post(`/kpi-assignments/${id}/lock`);
export const unlockAssignmentApi = (id) => api.post(`/kpi-assignments/${id}/unlock`);
export const getTeamOverviewApi = (params) => api.get('/kpi-assignments/team-overview', { params });
export const getAdminOverviewApi = (params) => api.get('/kpi-assignments/admin-overview', { params });
export const reopenAssignmentApi = (id, targetStatus) => api.post(`/kpi-assignments/${id}/reopen`, { targetStatus });
export const cloneKpisApi = (data) => api.post('/kpi-assignments/clone', data);
export const bulkCloneKpisApi = (data) => api.post('/kpi-assignments/bulk-clone', data);
export const bulkImportKpisApi = (formData) => api.post('/kpi-assignments/bulk-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const downloadKpiTemplate = () => api.get('/kpi-assignments/import-template', { responseType: 'blob' });
export const downloadEmployeeAttachmentApi = (id) => api.get(`/kpi-assignments/${id}/employee-attachment`, { responseType: 'blob' });
export const downloadManagerAttachmentApi = (id) => api.get(`/kpi-assignments/${id}/manager-attachment`, { responseType: 'blob' });
