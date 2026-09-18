import api from '../axios';

/** Public widget tokens on the common PM project list. */
export const listWidgetSettingsApi    = ()            => api.get('/helpdesk/widget-settings');
export const enableWidgetApi          = (pmProjectId) => api.post(`/helpdesk/widget-settings/${pmProjectId}/enable`);
export const regenerateWidgetTokenApi = (pmProjectId) => api.post(`/helpdesk/widget-settings/${pmProjectId}/regenerate`);
export const disableWidgetApi         = (pmProjectId) => api.post(`/helpdesk/widget-settings/${pmProjectId}/disable`);
