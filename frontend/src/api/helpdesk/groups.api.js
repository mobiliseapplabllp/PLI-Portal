import api from '../axios';

/**
 * Fetch all helpdesk groups (legacy, read-only).
 *
 * Helpdesk groups are retired — teams now come from the employee master
 * (GET /helpdesk/teams, GET /helpdesk/teams/:managerId/members). This GET is
 * kept only so old tickets can still display their legacy group name.
 *
 * create/update/delete group endpoints return 410 Gone and were removed here.
 */
export const getGroupsApi = () => api.get('/helpdesk/groups');
