/**
 * StatusSelector — Visual card-style radio group for Meets / Exceeds / Below.
 * size="md" → full cards (default); size="sm" → compact pill buttons (used in table cells)
 */

const OPTIONS = [
  {
    value: 'Below',
    label: 'Below',
    icon: '✕',
    card: 'border-status-below-200 bg-status-below-50 hover:bg-status-below-100',
    selected: 'border-status-below-DEFAULT bg-status-below-100 ring-2 ring-status-below-200',
    text: 'text-status-below-700',
    pill: 'bg-red-100 text-red-700 hover:bg-red-200',
    pillSelected: 'bg-red-600 text-white',
  },
  {
    value: 'Meets',
    label: 'Meets',
    icon: '✓',
    card: 'border-status-meets-200 bg-status-meets-50 hover:bg-status-meets-100',
    selected: 'border-status-meets-DEFAULT bg-status-meets-100 ring-2 ring-status-meets-200',
    text: 'text-status-meets-700',
    pill: 'bg-amber-100 text-amber-700 hover:bg-amber-200',
    pillSelected: 'bg-amber-500 text-white',
  },
  {
    value: 'Exceeds',
    label: 'Exceeds',
    icon: '★',
    card: 'border-status-exceeds-200 bg-status-exceeds-50 hover:bg-status-exceeds-100',
    selected: 'border-status-exceeds-DEFAULT bg-status-exceeds-100 ring-2 ring-status-exceeds-200',
    text: 'text-status-exceeds-700',
    pill: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
    pillSelected: 'bg-emerald-600 text-white',
  },
];

export default function StatusSelector({ value, onChange, disabled = false, size = 'md' }) {
  if (size === 'sm') {
    return (
      <div className="flex gap-1">
        {OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(opt.value)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors
                ${isSelected ? opt.pillSelected : opt.pill}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title={opt.value}
            >
              {opt.icon} {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  // md — full card layout
  return (
    <div className="grid grid-cols-3 gap-3">
      {OPTIONS.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2
              transition-all duration-150
              ${isSelected ? opt.selected : `border-gray-200 bg-white hover:${opt.card}`}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className={`text-2xl mb-1 ${isSelected ? opt.text : 'text-gray-400'}`}>
              {opt.icon}
            </span>
            <span className={`text-sm font-semibold ${isSelected ? opt.text : 'text-gray-500'}`}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
