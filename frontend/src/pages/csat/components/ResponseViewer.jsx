// Renders per-question aggregate breakdown

const PCT = (n, total) => total ? Math.round((n / total) * 100) : 0;

function BarRow({ label, count, total }) {
  const pct = PCT(count, total);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 truncate max-w-xs">{label}</span>
        <span className="text-gray-400 ml-3 flex-shrink-0">{count} ({pct}%)</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-2 bg-emerald-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ResponseViewer({ question }) {
  const {
    questionText, helperText, questionType, totalResponses,
    avgScore, csatPercent, minValue, maxValue, minLabel, maxLabel,
    distribution, optionFrequency, textAnswers,
  } = question;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{questionText}</p>
          {helperText && <p className="text-xs text-gray-400 mt-0.5">{helperText}</p>}
        </div>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0 capitalize">
          {questionType}
        </span>
      </div>

      <p className="text-xs text-gray-400">{totalResponses} response{totalResponses !== 1 ? 's' : ''}</p>

      {totalResponses === 0 && (
        <p className="text-sm text-gray-400 italic">No responses yet</p>
      )}

      {/* Rating */}
      {questionType === 'rating' && totalResponses > 0 && (
        <div className="space-y-3">
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{avgScore ?? '—'}</p>
              <p className="text-xs text-gray-400">Avg score</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{csatPercent !== null ? `${csatPercent}%` : '—'}</p>
              <p className="text-xs text-gray-400">CSAT %</p>
            </div>
            {minLabel && maxLabel && (
              <div className="text-center">
                <p className="text-xs text-gray-400">{minLabel} → {maxLabel}</p>
                <p className="text-xs text-gray-300">({minValue}–{maxValue})</p>
              </div>
            )}
          </div>
          {distribution && (
            <div className="space-y-1.5">
              {Object.entries(distribution).map(([k, v]) => (
                <BarRow key={k} label={k} count={v} total={totalResponses} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Radio / Select / Checkbox */}
      {['radio', 'select', 'checkbox'].includes(questionType) && totalResponses > 0 && optionFrequency && (
        <div className="space-y-1.5">
          {Object.entries(optionFrequency)
            .sort((a, b) => b[1] - a[1])
            .map(([opt, cnt]) => (
              <BarRow key={opt} label={opt} count={cnt} total={totalResponses} />
            ))}
        </div>
      )}

      {/* Text */}
      {questionType === 'text' && textAnswers && textAnswers.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-2">
          {textAnswers.map((ans, i) => (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 border border-gray-100">
              {ans}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
