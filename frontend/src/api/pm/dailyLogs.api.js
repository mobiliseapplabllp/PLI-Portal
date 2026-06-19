import api from '../axios';

const base = (pid) => `/pm/projects/${pid}/daily-logs`;

export const getDailyLogsApi = (projectId, params) => api.get(base(projectId), { params });
export const getTodayLogApi = (projectId) => api.get(`${base(projectId)}/today`);
export const upsertTodayLogApi = (projectId, data) => api.post(base(projectId), data);
export const getDailyLogByIdApi = (projectId, logId) => api.get(`${base(projectId)}/${logId}`);
