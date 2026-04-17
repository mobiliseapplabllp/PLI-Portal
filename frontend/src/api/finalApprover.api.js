import api from './axios';

// Quarterly overview — list all employees + readiness for dept
export const getDeptQuarterlyStatusApi = (params) => api.get('/final-approver/quarterly', { params });

// Build auto-calc data for one employee's quarter
export const buildQuarterlyApprovalDataApi = (employeeId, fy, quarter) =>
  api.get(`/final-approver/quarterly/${employeeId}/${fy}/${quarter}`);

// Create or re-initialise draft quarterly approval with auto-calc pre-fill
export const initQuarterlyApprovalApi = (employeeId, fy, quarter) =>
  api.post(`/final-approver/quarterly/${employeeId}/${fy}/${quarter}/init`);

// Get one quarterly approval with all items
export const getQuarterlyApprovalApi = (id) => api.get(`/final-approver/approvals/${id}`);

// Submit (finalise) a quarterly approval
export const submitQuarterlyApprovalApi = (id, data) =>
  api.post(`/final-approver/approvals/${id}/submit`, data);

// List dept quarterly approvals
export const getDeptApprovalsApi = (params) => api.get('/final-approver/approvals', { params });
