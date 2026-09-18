/**
 * Parse a value that may be a date-only string ('YYYY-MM-DD') as a LOCAL date.
 *
 * `new Date('2026-09-15')` is parsed as UTC midnight, which renders as the
 * PREVIOUS day everywhere with a negative UTC offset — never use it for display.
 * Anything that is not a bare YYYY-MM-DD (full ISO timestamps, Date objects) is
 * left to the normal Date parsing, which already carries a zone.
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {Date|null} null when the value is empty or unparseable
 */
export const parseLocalDate = (value) => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatScore = (score) => {
  if (score == null) return '—';
  return Number(score).toFixed(1);
};

export const getMonthName = (month) => {
  const names = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return names[month] || '';
};

export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
