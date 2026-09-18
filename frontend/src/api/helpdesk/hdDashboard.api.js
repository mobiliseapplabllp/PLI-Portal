import api from '../axios';

/**
 * Fetch overall helpdesk dashboard statistics (totals, averages, SLA).
 */
export const getDashboardStatsApi = () => api.get('/helpdesk/dashboard/stats');

/**
 * Fetch ticket counts grouped by status.
 */
export const getByStatusApi = () => api.get('/helpdesk/dashboard/by-status');

/**
 * Fetch ticket counts grouped by priority.
 */
export const getByPriorityApi = () => api.get('/helpdesk/dashboard/by-priority');

/**
 * Fetch ticket counts grouped by team (reporting manager).
 * Response data: [{ teamManagerId, teamName, total, pending }]
 * Legacy rows (tickets without a team manager) have teamManagerId null and
 * teamName like 'Group: <name>' or 'Unassigned'.
 */
export const getByTeamApi = () => api.get('/helpdesk/dashboard/by-team');

/**
 * Fetch ticket counts grouped by legacy helpdesk group.
 * @deprecated Use getByTeamApi — kept for compatibility only.
 */
export const getByGroupApi = () => api.get('/helpdesk/dashboard/by-group');

/**
 * Fetch monthly ticket volume trend data.
 */
export const getMonthlyTrendApi = () => api.get('/helpdesk/dashboard/monthly-trend');

/**
 * Fetch per-agent ticket counts (total + pending).
 */
export const getAgentStatsApi = () => api.get('/helpdesk/dashboard/agent-stats');

/**
 * Fetch ticket counts grouped by raised_by_team field.
 */
export const getRaisedByTeamApi = () => api.get('/helpdesk/dashboard/raised-by-team');

/**
 * Fetch per-project ticket counts.
 */
export const getProjectStatsApi = () => api.get('/helpdesk/dashboard/project-stats');

/**
 * Fetch ticket counts assigned to the current user.
 */
export const getMyStatsApi = () => api.get('/helpdesk/dashboard/my-stats');

/**
 * Fetch count of unassigned tickets.
 */
export const getUnassignedCountApi = () => api.get('/helpdesk/dashboard/unassigned-count');

/**
 * Fetch SLA breach statistics.
 */
export const getSlaStatsApi = () => api.get('/helpdesk/dashboard/sla-stats');

/**
 * Fetch last 7 days received vs completed ticket trend.
 */
export const getWeeklyTrendApi = () => api.get('/helpdesk/dashboard/weekly-trend');

/**
 * Fetch ticket counts broken down by mode field.
 */
export const getModeStatsApi = () => api.get('/helpdesk/dashboard/mode-stats');
