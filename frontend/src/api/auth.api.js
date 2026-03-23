import api from './axios';

export const loginApi = (data) => api.post('/auth/login', data);
export const logoutApi = () => api.post('/auth/logout');
export const getMeApi = () => api.get('/auth/me');
export const changePasswordApi = (data) => api.post('/auth/change-password', data);
