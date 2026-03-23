import { KPI_STATUS_LABELS, KPI_STATUS_COLORS, CYCLE_STATUS_COLORS } from '../../utils/constants';

export default function StatusBadge({ status, type = 'kpi' }) {
  const colorMap = type === 'cycle' ? CYCLE_STATUS_COLORS : KPI_STATUS_COLORS;
  const labelMap = type === 'kpi' ? KPI_STATUS_LABELS : {};

  const colorClass = colorMap[status] || 'bg-gray-100 text-gray-700';
  const label = labelMap[status] || status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
