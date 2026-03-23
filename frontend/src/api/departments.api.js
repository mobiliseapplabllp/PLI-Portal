import api from './axios';

export const getDepartmentsApi = (params) => api.get('/departments', { params });
export const createDepartmentApi = (data) => api.post('/departments', data);
export const updateDepartmentApi = (id, data) => api.put(`/departments/${id}`, data);
