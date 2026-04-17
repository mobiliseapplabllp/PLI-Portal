/**
 * WeightageGauge — Dual animated bar gauge showing monthly + quarterly weightage totals.
 * Used in KPI Plan editor to show how much weightage has been allocated.
 */

export default function WeightageGauge({ monthly = 0, quarterly = 0, maxMonthly = 100, maxQuarterly = 100 }) {
  const monthlyPct = Math.min((monthly / maxMonthly) * 100, 100);
  const quarterlyPct = Math.min((quarterly / maxQuarterly) * 100, 100);

  const monthlyColor =
    monthly === maxMonthly ? 'bg-emerald-500' :
    monthly > maxMonthly ? 'bg-red-500' : 'bg-amber-400';

  const quarterlyColor =
    quarterly === maxQuarterly ? 'bg-emerald-500' :
    quarterly > maxQuarterly ? 'bg-red-500' : 'bg-blue-400';

  const monthlyTextColor =
    monthly === maxMonthly ? 'text-emerald-700' :
    monthly > maxMonthly ? 'text-red-700' : 'text-amber-700';

  const quarterlyTextColor =
    quarterly === maxQuarterly ? 'text-emerald-700' :
    quarterly > maxQuarterly ? 'text-red-700' : 'text-blue-700';

  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
      {/* Monthly */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-gray-600">Yearly Weightage</span>
          <span className={`text-xs font-bold ${monthlyTextColor}`}>
            {monthly}/{maxMonthly}%
            {monthly === maxMonthly && <span className="ml-1">✓</span>}
            {monthly > maxMonthly && <span className="ml-1">⚠ Exceeds limit</span>}
          </span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${monthlyColor}`}
            style={{ width: `${monthlyPct}%` }}
            title={`${monthly}% allocated`}
          />
        </div>
      </div>

      {/* Quarterly */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-medium text-gray-600">Quarterly Weightage</span>
          <span className={`text-xs font-bold ${quarterlyTextColor}`}>
            {quarterly}/{maxQuarterly}%
            {quarterly === maxQuarterly && <span className="ml-1">✓</span>}
            {quarterly > maxQuarterly && <span className="ml-1">⚠ Exceeds limit</span>}
          </span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${quarterlyColor}`}
            style={{ width: `${quarterlyPct}%` }}
            title={`${quarterly}% allocated`}
          />
        </div>
      </div>
    </div>
  );
}
