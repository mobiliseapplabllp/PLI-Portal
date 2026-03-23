import api from './axios';

export const getNotificationsApi = (params) => api.get('/notifications', { params });
export const markAsReadApi = (id) => api.put(`/notifications/${id}/read`);
export const markAllAsReadApi = () => api.put('/notifications/read-all');
