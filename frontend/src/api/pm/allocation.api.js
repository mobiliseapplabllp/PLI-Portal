import api from '../axios';

export const getUserAvailabilityApi = (userId, params = {}) =>
  api.get(`/pm/users/${userId}/availability`, { params });

export const requestAllocationApprovalApi = (data) =>
  api.post(`/pm/projects/${data.projectId}/allocation-approval`, data);

export const getProjectAllocationApprovalsApi = (projectId) =>
  api.get(`/pm/projects/${projectId}/allocation-approvals`);

export const respondToAllocationApprovalApi = (projectId, approvalId, data) =>
  api.patch(`/pm/projects/${projectId}/allocation-approvals/${approvalId}`, data);

export const getMembersAvailabilityApi = (projectId) =>
  api.get(`/pm/projects/${projectId}/members/availability`);
