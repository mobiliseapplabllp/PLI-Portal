import api from '../axios';

/**
 * Download the helpdesk import Excel template (.xlsx).
 * Fetches the binary blob, triggers a browser file-save dialog, then cleans up.
 */
export const downloadHdImportTemplateApi = async () => {
  const res = await api.get('/helpdesk/tickets/template/import', { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data]));
  const a   = document.createElement('a');
  a.href     = url;
  a.download = 'helpdesk-import-template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return res;
};

/**
 * Export filtered tickets as an Excel file (.xlsx).
 * Accepts the same filter params as getTicketsApi.
 * Triggers a browser file-save dialog automatically.
 *
 * @param {{ status?: string, priority?: string, category?: string, search?: string, dateFrom?: string, dateTo?: string }} params
 */
export const exportTicketsApi = async (params = {}) => {
  const res     = await api.get('/helpdesk/tickets/export', { params, responseType: 'blob' });
  const dateStr = new Date().toISOString().slice(0, 10);
  const url     = URL.createObjectURL(new Blob([res.data]));
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `helpdesk-tickets-${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return res;
};
