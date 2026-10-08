import api from '../axios';

/** Downloads the bulk-import Excel template (.xlsx: S.No, Client, Project Name). */
export const downloadBulkImportTemplateApi = async () => {
  const res = await api.get('/pm/projects/bulk-import/template', { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const a = document.createElement('a');
  a.href = url; a.download = 'bulk-import-projects-template.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return res;
};

/** Dry run — server parses + resolves the file, writes nothing. formData: { file }. */
export const validateBulkImportApi = (formData) =>
  api.post('/pm/projects/bulk-import/validate', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

/** Actually creates the client orgs + projects. payload: { rows, fileName }. */
export const confirmBulkImportApi = (payload) => api.post('/pm/projects/bulk-import/confirm', payload);

export const listBulkImportLogsApi = () => api.get('/pm/projects/bulk-import/logs');

export const undoBulkImportApi = (batchId) => api.post(`/pm/projects/bulk-import/${batchId}/undo`);
