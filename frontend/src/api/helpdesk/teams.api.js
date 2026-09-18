import api from '../axios';

/**
 * Helpdesk "teams" = reporting managers + their active direct reports
 * (sourced from the employee master, never helpdesk groups).
 *
 * GET /helpdesk/teams
 *   → data: [{ _id, name, email, designation, departmentName, memberCount }]
 * @param {object} [params] optional { departmentId }
 */
export const listTeamsApi = (params) => api.get('/helpdesk/teams', { params });

/**
 * GET /helpdesk/teams/:managerId/members
 *   → data: { manager: { _id, name, email },
 *             members: [{ _id, name, email, designation, role, isManager }] }  (manager first)
 * @param {string} managerId
 */
/** All PM projects for ticket creation (not membership-filtered). params: { includeClosed, search } */
export const listPmProjectsForTicketsApi = (params) => api.get('/helpdesk/pm-projects', { params });
export const getTeamMembersApi = (managerId) => api.get(`/helpdesk/teams/${managerId}/members`);
