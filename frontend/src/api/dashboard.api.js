import api from './axios';

export const getEmployeeDashboardApi = () => api.get('/dashboard/employee');
export const getManagerDashboardApi = () => api.get('/dashboard/manager');
export const getAdminDashboardApi = () => api.get('/dashboard/admin');
