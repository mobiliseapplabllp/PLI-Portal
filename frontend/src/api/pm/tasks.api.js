import api from '../axios';

const base = (pid, mid) => `/pm/projects/${pid}/milestones/${mid}/tasks`;

export const getTasksApi = (projectId, milestoneId) => api.get(base(projectId, milestoneId));
export const createTaskApi = (projectId, milestoneId, data) => api.post(base(projectId, milestoneId), data);
export const updateTaskApi = (projectId, milestoneId, taskId, data) => api.put(`${base(projectId, milestoneId)}/${taskId}`, data);
export const deleteTaskApi = (projectId, milestoneId, taskId) => api.delete(`${base(projectId, milestoneId)}/${taskId}`);
export const updateTaskStatusApi = (projectId, milestoneId, taskId, status) => api.patch(`${base(projectId, milestoneId)}/${taskId}/status`, { status });
