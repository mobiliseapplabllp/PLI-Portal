import api from '../axios';

const base = (pid, mid) => `/pm/projects/${pid}/milestones/${mid}/tasks`;

// All tasks assigned to the current user across all projects — single-query endpoint
export const getMyTasksApi = () => api.get('/pm/my-tasks');

// All tasks for a project (flat) — used to avoid N+1
export const getAllProjectTasksApi = (projectId) => api.get(`/pm/projects/${projectId}/tasks`);

export const getTasksApi = (projectId, milestoneId) => api.get(base(projectId, milestoneId));
export const createTaskApi = (projectId, milestoneId, data) => api.post(base(projectId, milestoneId), data);
export const updateTaskApi = (projectId, milestoneId, taskId, data) => api.put(`${base(projectId, milestoneId)}/${taskId}`, data);
export const deleteTaskApi = (projectId, milestoneId, taskId) => api.delete(`${base(projectId, milestoneId)}/${taskId}`);
export const updateTaskStatusApi = (projectId, milestoneId, taskId, status) => api.patch(`${base(projectId, milestoneId)}/${taskId}/status`, { status });
