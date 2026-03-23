import api from './axios';

export const getKpiTemplatesApi = (params) => api.get('/kpi-templates', { params });
export const createKpiTemplateApi = (data) => api.post('/kpi-templates', data);
export const updateKpiTemplateApi = (id, data) => api.put(`/kpi-templates/${id}`, data);
export const deleteKpiTemplateApi = (id) => api.delete(`/kpi-templates/${id}`);
