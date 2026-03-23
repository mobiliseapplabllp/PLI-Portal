import api from './axios';

export const getMonthlyReportApi = (params) => api.get('/reports/monthly', { params });
export const getQuarterlyReportApi = (params) => api.get('/reports/quarterly', { params });
export const getDepartmentReportApi = (params) => api.get('/reports/department', { params });
export const getPendingReportApi = (params) => api.get('/reports/pending', { params });
export const exportExcelApi = (params) => api.get('/reports/export/excel', { params, responseType: 'blob' });
export const exportPdfApi = (params) => api.get('/reports/export/pdf', { params, responseType: 'blob' });
