export default function RatingScale({ min = 1, max = 5, minLabel, maxLabel, value, onChange, disabled }) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const total = steps.length;

  const getColor = (n) => {
    if (value !== n) return null;
    const pos = (n - min) / Math.max(total - 1, 1);
    if (pos <= 0.33) return { bg: 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-200' };
    if (pos <= 0.66) return { bg: 'bg-amber-500 border-amber-500 text-white shadow-sm shadow-amber-200' };
    return { bg: 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-200' };
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {steps.map((n) => {
          const active = value === n;
          const colorCls = active ? getColor(n)?.bg : '';
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange && onChange(n)}
              className={`w-11 h-11 rounded-xl border-2 text-sm font-bold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
                ${active
                  ? colorCls
                  : 'border-gray-200 text-gray-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 bg-white'
                }
                ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105 active:scale-95'}
              `}
              aria-label={`Rating ${n}`}
              aria-pressed={active}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-gray-400 font-medium px-0.5">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            {minLabel || ''}
          </span>
          <span className="flex items-center gap-1">
            {maxLabel || ''}
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          </span>
        </div>
      )}
    </div>
  );
}
