import api from '../axios';

const base = (pid) => `/pm/projects/${pid}/milestones`;

export const getMilestonesApi            = (projectId)                  => api.get(base(projectId));
export const createMilestoneApi          = (projectId, data)            => api.post(base(projectId), data);
export const createSubMilestoneApi       = (projectId, milestoneId, data) => api.post(`${base(projectId)}/${milestoneId}/sub`, data);
export const updateMilestoneApi          = (projectId, milestoneId, data) => api.put(`${base(projectId)}/${milestoneId}`, data);
export const deleteMilestoneApi          = (projectId, milestoneId)     => api.delete(`${base(projectId)}/${milestoneId}`);
export const updateMilestoneStatusApi    = (projectId, milestoneId, status) => api.patch(`${base(projectId)}/${milestoneId}/status`, { status });
export const updateMilestoneProgressApi  = (projectId, milestoneId, completionPercentage) => api.patch(`${base(projectId)}/${milestoneId}/progress`, { completionPercentage });

// Export / Import (flat routes, not nested under projectId)
export const exportMilestonesApi         = (params) => api.get('/pm/milestones/export', { params, responseType: 'blob' });
export const getMilestoneTemplateApi     = ()        => api.get('/pm/milestones/import/template', { responseType: 'blob' });
export const validateMilestoneImportApi  = (formData) => api.post('/pm/milestones/import/validate', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const commitMilestoneImportApi    = (rows)     => api.post('/pm/milestones/import/commit', { rows });
