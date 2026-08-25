import api from '../axios';

// Project documents
export const getProjectDocumentsApi    = (projectId)       => api.get(`/pm/projects/${projectId}/documents`);
export const uploadProjectDocumentApi  = (projectId, formData) => api.post(`/pm/projects/${projectId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteProjectDocumentApi  = (projectId, docId) => api.delete(`/pm/projects/${projectId}/documents/${docId}`);
export const downloadProjectDocumentUrl = (projectId, docId) => `/api/pm/projects/${projectId}/documents/${docId}/download`;

// Milestone documents
export const getMilestoneDocumentsApi    = (projectId, milestoneId)         => api.get(`/pm/projects/${projectId}/milestones/${milestoneId}/documents`);
export const uploadMilestoneDocumentApi  = (projectId, milestoneId, formData) => api.post(`/pm/projects/${projectId}/milestones/${milestoneId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteMilestoneDocumentApi  = (projectId, milestoneId, docId)  => api.delete(`/pm/projects/${projectId}/milestones/${milestoneId}/documents/${docId}`);
export const downloadMilestoneDocumentUrl = (projectId, milestoneId, docId) => `/api/pm/projects/${projectId}/milestones/${milestoneId}/documents/${docId}/download`;
