import api from '../axios';

const base = (pid) => `/pm/projects/${pid}/milestones`;

export const getMilestonesApi = (projectId) => api.get(base(projectId));
export const createMilestoneApi = (projectId, data) => api.post(base(projectId), data);
export const updateMilestoneApi = (projectId, milestoneId, data) => api.put(`${base(projectId)}/${milestoneId}`, data);
export const deleteMilestoneApi = (projectId, milestoneId) => api.delete(`${base(projectId)}/${milestoneId}`);
export const updateMilestoneStatusApi = (projectId, milestoneId, status) => api.patch(`${base(projectId)}/${milestoneId}/status`, { status });
export const updateMilestoneProgressApi = (projectId, milestoneId, completionPercentage) => api.patch(`${base(projectId)}/${milestoneId}/progress`, { completionPercentage });
