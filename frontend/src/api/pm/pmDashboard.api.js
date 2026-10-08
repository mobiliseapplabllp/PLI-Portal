import api from '../axios';

/**
 * Download the PM dashboard as a styled .xlsx (Summary + Deadlines sheets).
 * The PM dashboard filters entirely client-side, so the CALLER sends its own
 * already-filtered summary — this just formats it, guaranteeing the file
 * matches exactly what's on screen. No dashboard filter logic lives here.
 *
 * @param {{ filters: string[], stats: object, deadlines: Array<object> }} payload
 */
export const exportPmDashboardApi = async (payload) => {
  const res     = await api.post('/pm/dashboard/export', payload, { responseType: 'blob' });
  const dateStr = new Date().toISOString().slice(0, 10);
  const url     = URL.createObjectURL(new Blob([res.data]));
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `pm-dashboard-${dateStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return res;
};
