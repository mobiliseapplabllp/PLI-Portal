import api from './axios';

export const getCyclesApi = (params) => api.get('/appraisal-cycles', { params });
export const createCycleApi = (data) => api.post('/appraisal-cycles', data);
export const updateCycleApi = (id, data) => api.put(`/appraisal-cycles/${id}`, data);
