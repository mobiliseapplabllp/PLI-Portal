/**
 * CommitVsAchieveRow — Side-by-side comparison of commitment vs achievement.
 * Shows deviation warning when the two statuses differ.
 */

const STATUS_CONFIG = {
  Meets:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   icon: '✓', badge: 'bg-amber-100 text-amber-800' },
  Exceeds: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', icon: '★', badge: 'bg-emerald-100 text-emerald-800' },
  Below:   { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     icon: '✕', badge: 'bg-red-100 text-red-800' },
};

function StatusPanel({ label, date, status, comment }) {
  const cfg = STATUS_CONFIG[status] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', icon: '—', badge: 'bg-gray-100 text-gray-600' };
  return (
    <div className={`flex-1 rounded-lg border-2 p-3 ${cfg.bg} ${cfg.border}`}>
      <div className="text-xs text-gray-500 mb-1">{label}{date && <span className="ml-1 text-gray-400">({date})</span>}</div>
      {status ? (
        <>
          <span className={`inline-flex items-center gap-1 text-sm font-semibold ${cfg.text}`}>
            <span>{cfg.icon}</span> {status}
          </span>
          {comment && <p className="mt-1 text-xs text-gray-500 italic truncate" title={comment}>{comment}</p>}
        </>
      ) : (
        <span className="text-xs text-gray-400 italic">Not yet submitted</span>
      )}
    </div>
  );
}

export default function CommitVsAchieveRow({
  commitmentStatus,
  commitmentComment,
  commitmentDate,
  achievementStatus,
  achievementComment,
  achievementDate,
  className = '',
}) {
  const hasDeviation =
    commitmentStatus && achievementStatus && commitmentStatus !== achievementStatus;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-3 items-stretch">
        <StatusPanel
          label="Commitment"
          date={commitmentDate}
          status={commitmentStatus}
          comment={commitmentComment}
        />
        <div className="flex items-center text-gray-300 text-lg select-none">→</div>
        <StatusPanel
          label="Achievement"
          date={achievementDate}
          status={achievementStatus}
          comment={achievementComment}
        />
      </div>

      {hasDeviation && (
        <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="text-amber-500 text-sm mt-0.5">⚠</span>
          <p className="text-xs text-amber-700">
            <span className="font-medium">Deviation detected:</span> Committed{' '}
            <span className="font-semibold">{commitmentStatus}</span>, achieved{' '}
            <span className="font-semibold">{achievementStatus}</span>
            {achievementStatus === 'Below' && commitmentStatus !== 'Below'
              ? ' — please add an explanation in your notes.'
              : '.'}
          </p>
        </div>
      )}
    </div>
  );
}
