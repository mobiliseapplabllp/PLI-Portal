import api from '../axios';

export const getPmSettingsApi = () => api.get('/pm/settings');
export const updatePmSettingsApi = (data) => api.put('/pm/settings', data);
