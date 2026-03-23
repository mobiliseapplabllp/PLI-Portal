import api from './axios';

export const getAssignmentsApi = (params) => api.get('/kpi-assignments', { params });
export const getAssignmentByIdApi = (id) => api.get(`/kpi-assignments/${id}`);
export const createAssignmentApi = (data) => api.post('/kpi-assignments', data);
export const updateAssignmentApi = (id, data) => api.put(`/kpi-assignments/${id}`, data);
export const assignToEmployeeApi = (id) => api.post(`/kpi-assignments/${id}/assign`);
export const employeeSubmitApi = (id, data) => api.post(`/kpi-assignments/${id}/employee-submit`, data);
export const managerReviewApi = (id, data) => api.post(`/kpi-assignments/${id}/manager-review`, data);
export const finalReviewApi = (id, data) => api.post(`/kpi-assignments/${id}/final-review`, data);
export const lockAssignmentApi = (id) => api.post(`/kpi-assignments/${id}/lock`);
export const unlockAssignmentApi = (id) => api.post(`/kpi-assignments/${id}/unlock`);
export const getTeamOverviewApi = (params) => api.get('/kpi-assignments/team-overview', { params });
export const getAdminOverviewApi = (params) => api.get('/kpi-assignments/admin-overview', { params });
export const reopenAssignmentApi = (id, targetStatus) => api.post(`/kpi-assignments/${id}/reopen`, { targetStatus });
export const cloneKpisApi = (data) => api.post('/kpi-assignments/clone', data);
export const bulkCloneKpisApi = (data) => api.post('/kpi-assignments/bulk-clone', data);
export const bulkImportKpisApi = (formData) => api.post('/kpi-assignments/bulk-import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const downloadKpiTemplate = () => api.get('/kpi-assignments/import-template', { responseType: 'blob' });
