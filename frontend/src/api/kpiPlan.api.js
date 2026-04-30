import api from './axios';

export const getKpiPlansApi = (params) => api.get('/kpi-plans', { params });
export const getKpiPlanByIdApi = (id) => api.get(`/kpi-plans/${id}`);
export const createKpiPlanApi = (data) => api.post('/kpi-plans', data);
export const updateKpiPlanApi = (id, data) => api.put(`/kpi-plans/${id}`, data);
export const updateKpiPlanStatusApi = (id, status) => api.patch(`/kpi-plans/${id}/status`, { status });
export const publishKpiPlanApi = (id) => api.post(`/kpi-plans/${id}/publish`);
export const addKpiPlanItemApi = (planId, data) => api.post(`/kpi-plans/${planId}/items`, data);
export const updateKpiPlanItemApi = (planId, itemId, data) => api.put(`/kpi-plans/${planId}/items/${itemId}`, data);
export const deleteKpiPlanItemApi = (planId, itemId) => api.delete(`/kpi-plans/${planId}/items/${itemId}`);
