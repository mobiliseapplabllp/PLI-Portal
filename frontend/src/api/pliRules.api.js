import api from './axios';

export const getPliRulesApi = (params) => api.get('/pli-rules', { params });
export const createPliRuleApi = (data) => api.post('/pli-rules', data);
export const updatePliRuleApi = (id, data) => api.put(`/pli-rules/${id}`, data);
