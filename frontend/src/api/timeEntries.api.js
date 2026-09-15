import api from './axios';

/**
 * Time entries — actual hours logged against any record.
 * entityType: 'ticket' | 'milestone' | 'project'
 * entityId:   ticket INT (as string) or milestone/project UUID
 */
export const listTimeEntriesApi    = (entityType, entityId) => api.get('/time-entries', { params: { entityType, entityId } });
export const createTimeEntryApi    = (data)                 => api.post('/time-entries', data);      // { entityType, entityId, date, hours, note, userId? }
export const updateTimeEntryApi    = (id, data)             => api.put(`/time-entries/${id}`, data);
export const deleteTimeEntryApi    = (id)                   => api.delete(`/time-entries/${id}`);
export const timeEntrySummaryApi   = (entityType, entityId) => api.get('/time-entries/summary', { params: { entityType, entityId } });
