import api from '../axios';

// Billing register — Finance/admin can act, leadership can read.
// filter: 'ready' | 'billed' | 'billable' | 'all'
export const getBillingRegisterApi = (params) => api.get('/pm/billing', { params });
export const exportBillingApi = (params) =>
  api.get('/pm/billing/export', { params, responseType: 'arraybuffer' });

export const markProjectBilledApi = (projectId, invoiceNumber, billedDate) =>
  api.patch(`/pm/billing/${projectId}/bill`, { invoiceNumber, billedDate });

export const unmarkProjectBilledApi = (projectId, reason) =>
  api.patch(`/pm/billing/${projectId}/unbill`, { reason });
