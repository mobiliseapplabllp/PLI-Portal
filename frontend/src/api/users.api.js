import api from './axios';

export const getUsersApi = (params) => api.get('/users', { params });
export const getUserByIdApi = (id) => api.get(`/users/${id}`);
export const createUserApi = (data) => api.post('/users', data);
export const updateUserApi = (id, data) => api.put(`/users/${id}`, data);
export const getTeamApi = (managerId) => api.get(`/users/team/${managerId}`);
export const getDesignationsApi = () => api.get('/users/designations');
