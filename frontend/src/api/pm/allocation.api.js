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

// ── Allocation exceptions (over-capacity requests, approver-role decided) ────
// body: { userId, memberId?, allocationMode, hoursPerDay, allocationTotalHours,
//         allocationFrom, allocationTo, role?, reason }  → { member, approval }
export const requestAllocationExceptionApi = (projectId, body) =>
  api.post(`/pm/projects/${projectId}/allocation-exception`, body);

// params: { status?: 'pending' | 'approved' | 'rejected' }
export const listAllocationExceptionsApi = (params = {}) =>
  api.get('/pm/allocation-exceptions', { params });

// body: { action: 'approve' | 'reject', responseNote? }
/** Withdraw a pending exception request (requester or project manager). */
export const cancelAllocationExceptionApi = (approvalId) => api.delete(`/pm/allocation-exceptions/${approvalId}`);
export const decideAllocationExceptionApi = (approvalId, body) =>
  api.patch(`/pm/allocation-exceptions/${approvalId}`, body);

// ── Time-phased allocation segments (base /pm/projects/:id/members/:memberId) ─
// segment = { _id, memberId, projectId, userId, fromDate, toDate, allocationMode,
//             hoursPerDay, allocationTotalHours, hoursConfirmed, exceptionStatus,
//             exceptionApprovalId, note, exceptionApproval?:{ approvedBy?:{ name } } }
const segBase = (projectId, memberId) => `/pm/projects/${projectId}/members/${memberId}/segments`;

/** GET → data:[segment] */
export const listSegmentsApi = (projectId, memberId) =>
  api.get(segBase(projectId, memberId));

/** body: { fromDate, toDate, allocationMode, hoursPerDay, allocationTotalHours, note } → segment (409 conflict / 400 overlap) */
export const addSegmentApi = (projectId, memberId, body) =>
  api.post(segBase(projectId, memberId), body);

/** same body as addSegmentApi → segment */
export const updateSegmentApi = (projectId, memberId, segmentId, body) =>
  api.put(`${segBase(projectId, memberId)}/${segmentId}`, body);

export const removeSegmentApi = (projectId, memberId, segmentId) =>
  api.delete(`${segBase(projectId, memberId)}/${segmentId}`);

export const confirmSegmentApi = (projectId, memberId, segmentId) =>
  api.patch(`${segBase(projectId, memberId)}/${segmentId}/confirm`);

/** body: { fromDate } — ends every segment at fromDate−1, deletes future ones → { ended, removed } */
export const releaseMemberApi = (projectId, memberId, body) =>
  api.post(`/pm/projects/${projectId}/members/${memberId}/release`, body);

// ── Person × month grid ───────────────────────────────────────────────────────
/** params: { from:'YYYY-MM-DD', to:'YYYY-MM-DD' } → { months:[…], rows:[…] } */
export const getAllocationGridApi = (projectId, params = {}) =>
  api.get(`/pm/projects/${projectId}/allocation-grid`, { params });

/** body: { changes:[{ memberId, month:'YYYY-MM', hoursPerDay|null }] } → { applied, errors:[{ memberId, month, message, conflict? }] } */
export const applyAllocationGridApi = (projectId, body) =>
  api.post(`/pm/projects/${projectId}/allocation-grid`, body);

// ── History ───────────────────────────────────────────────────────────────────
/** params: { memberId? } → data:[{ _id, action, before, after, note, createdAt, by:{ name } }] */
export const getAllocationHistoryApi = (projectId, params = {}) =>
  api.get(`/pm/projects/${projectId}/allocation-history`, { params });
