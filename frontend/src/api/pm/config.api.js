import api from '../axios';

// ── Project Types ─────────────────────────────────────────────────────────────
export const getProjectTypesApi          = ()         => api.get('/pm/config/project-types');
export const createProjectTypeApi        = (data)     => api.post('/pm/config/project-types', data);
export const updateProjectTypeApi        = (id, data) => api.put('/pm/config/project-types/' + id, data);
export const deleteProjectTypeApi        = (id)       => api.delete('/pm/config/project-types/' + id);

// ── Statuses ─────────────────────────────────────────────────────────────────
export const getPmStatusesApi            = ()         => api.get('/pm/config/statuses');
export const createPmStatusApi           = (data)     => api.post('/pm/config/statuses', data);
export const updatePmStatusApi           = (id, data) => api.put('/pm/config/statuses/' + id, data);
export const deletePmStatusApi           = (id)       => api.delete('/pm/config/statuses/' + id);

// ── Milestone Templates ───────────────────────────────────────────────────────
export const getMilestoneTemplatesApi    = ()         => api.get('/pm/config/milestone-templates');
export const createMilestoneTemplateApi  = (data)     => api.post('/pm/config/milestone-templates', data);
export const updateMilestoneTemplateApi  = (id, data) => api.put('/pm/config/milestone-templates/' + id, data);
export const deleteMilestoneTemplateApi  = (id)       => api.delete('/pm/config/milestone-templates/' + id);
export const validateTemplateRangesApi   = (type)     => api.get('/pm/config/milestone-templates/' + encodeURIComponent(type) + '/validate');

// ── Member Roles ──────────────────────────────────────────────────────────────
export const getMemberRolesApi           = ()         => api.get('/pm/config/member-roles');
export const createMemberRoleApi         = (data)     => api.post('/pm/config/member-roles', data);
export const updateMemberRoleApi         = (id, data) => api.put('/pm/config/member-roles/' + id, data);
export const deleteMemberRoleApi         = (id)       => api.delete('/pm/config/member-roles/' + id);
