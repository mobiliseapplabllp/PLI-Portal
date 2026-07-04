import api from './axios';

export const getScoringConfigsApi = (params) => api.get('/scoring-configs', { params });
export const createScoringConfigApi = (data) => api.post('/scoring-configs', data);
export const updateScoringConfigApi = (id, data) => api.put(`/scoring-configs/${id}`, data);
