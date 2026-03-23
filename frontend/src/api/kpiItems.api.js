import api from './axios';

export const createKpiItemApi = (data) => api.post('/kpi-items', data);
export const updateKpiItemApi = (id, data) => api.put(`/kpi-items/${id}`, data);
export const deleteKpiItemApi = (id) => api.delete(`/kpi-items/${id}`);
