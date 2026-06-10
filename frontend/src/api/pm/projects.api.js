import api from '../axios';

export const getProjectsApi = (params) => api.get('/pm/projects', { params });
export const getProjectByIdApi = (id) => api.get(`/pm/projects/${id}`);
export const getProjectSummaryApi = (id) => api.get(`/pm/projects/${id}/summary`);
export const createProjectApi = (data) => api.post('/pm/projects', data);
export const updateProjectApi = (id, data) => api.put(`/pm/projects/${id}`, data);
export const deleteProjectApi = (id) => api.delete(`/pm/projects/${id}`);

// Members
export const getMembersApi = (projectId) => api.get(`/pm/projects/${projectId}/members`);
export const addMemberApi = (projectId, data) => api.post(`/pm/projects/${projectId}/members`, data);
export const updateMemberApi = (projectId, memberId, data) => api.put(`/pm/projects/${projectId}/members/${memberId}`, data);
export const removeMemberApi = (projectId, memberId) => api.delete(`/pm/projects/${projectId}/members/${memberId}`);

// Recipients
export const getRecipientsApi = (projectId) => api.get(`/pm/projects/${projectId}/recipients`);
export const addRecipientApi = (projectId, data) => api.post(`/pm/projects/${projectId}/recipients`, data);
export const removeRecipientApi = (projectId, recipientId) => api.delete(`/pm/projects/${projectId}/recipients/${recipientId}`);
