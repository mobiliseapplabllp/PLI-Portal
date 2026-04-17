/**
 * NumericChip — Small coloured pill showing +1, 0, or -1 values.
 * Used in the quarterly auto-calc table to display monthly status numerics.
 */
export default function NumericChip({ value, size = 'sm' }) {
  if (value == null) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono text-gray-300">—</span>;
  }

  const config =
    value > 0
      ? { label: '+1', classes: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300' }
      : value < 0
      ? { label: '−1', classes: 'bg-red-100 text-red-700 ring-1 ring-red-300' }
      : { label: '0', classes: 'bg-gray-100 text-gray-600 ring-1 ring-gray-300' };

  const sizeClass = size === 'xs' ? 'px-1 py-0 text-xs' : 'px-1.5 py-0.5 text-xs';

  return (
    <span className={`inline-flex items-center justify-center rounded font-mono font-bold ${sizeClass} ${config.classes}`}>
      {config.label}
    </span>
  );
}
