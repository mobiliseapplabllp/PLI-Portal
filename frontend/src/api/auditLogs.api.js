import api from './axios';

export const getAuditLogsApi = (params) => api.get('/audit-logs', { params });
