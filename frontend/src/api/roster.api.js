import api from './axios';

// ── Weeks ─────────────────────────────────────────────────────────────────────
export const listRosterWeeksApi = (params) => api.get('/roster/weeks', { params });
// Get-or-create a week (omit saturdayDate for the upcoming Saturday) + auto-generate entries for my scope
export const createRosterWeekApi = (saturdayDate) => api.post('/roster/weeks', { saturdayDate });
export const getRosterWeekApi = (weekId, params) => api.get(`/roster/weeks/${weekId}`, { params });
export const publishRosterWeekApi = (weekId) => api.post(`/roster/weeks/${weekId}/publish`);
export const exportRosterWeekApi = (weekId) =>
  api.get(`/roster/weeks/${weekId}/export`, { responseType: 'arraybuffer' });

// ── Entries ───────────────────────────────────────────────────────────────────
// Pre-publish: sets planned+final. Post-publish: change per work requirement (reason required)
export const updateRosterEntryApi = (entryId, status, reason) =>
  api.put(`/roster/entries/${entryId}`, { status, reason });

// ── Dashboard / self / history / coverage ─────────────────────────────────────
export const getRosterDashboardApi = () => api.get('/roster/dashboard');
export const getMyRosterApi = () => api.get('/roster/my');
export const getRosterHistoryApi = (employeeId, params) => api.get(`/roster/history/${employeeId}`, { params });
export const getRosterCoverageApi = (params) => api.get('/roster/coverage', { params });

// Saturday trend matrix (employees × Saturdays) — visible to every role
export const getRosterTrendApi = (params) => api.get('/roster/trend', { params });
export const exportRosterTrendApi = (params) =>
  api.get('/roster/trend/export', { params, responseType: 'arraybuffer' });

// ── Swaps ─────────────────────────────────────────────────────────────────────
export const createSwapApi = (weekId, targetEmployeeId, reason) =>
  api.post(`/roster/weeks/${weekId}/swaps`, { targetEmployeeId, reason });
export const listSwapsApi = (params) => api.get('/roster/swaps', { params });
export const acceptSwapApi = (id) => api.post(`/roster/swaps/${id}/accept`);
export const decideSwapApi = (id, action, comment) => api.post(`/roster/swaps/${id}/decide`, { action, comment });
export const cancelSwapApi = (id) => api.post(`/roster/swaps/${id}/cancel`);

// ── Comp-offs ─────────────────────────────────────────────────────────────────
export const listCompOffsApi = (params) => api.get('/roster/comp-offs', { params });
export const availCompOffApi = (id, availedDate) => api.patch(`/roster/comp-offs/${id}/avail`, { availedDate });
