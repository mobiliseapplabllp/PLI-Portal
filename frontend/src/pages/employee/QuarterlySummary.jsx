import { useEffect, useState } from 'react';
import { getQuarterlyReportApi } from '../../api/reports.api';
import { useSelector } from 'react-redux';
import PageHeader from '../../components/common/PageHeader';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { formatScore, getMonthName } from '../../utils/formatters';
import { getCurrentFinancialYear, QUARTER_MAP } from '../../utils/constants';

const RATING_COLORS = {
  Exceptional: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-400', bar: 'bg-green-500' },
  'Exceeds Expectations': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-400', bar: 'bg-blue-500' },
  'Meets Expectations': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-400', bar: 'bg-yellow-500' },
  'Needs Improvement': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400', bar: 'bg-orange-500' },
  'Below Expectations': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-400', bar: 'bg-red-500' },
};

function getRatingColor(label) {
  if (!label) return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', bar: 'bg-gray-400' };
  // Match partial label for flexibility
  for (const [key, colors] of Object.entries(RATING_COLORS)) {
    if (label.toLowerCase().includes(key.toLowerCase().split(' ')[0].toLowerCase())) {
      return colors;
    }
  }
  return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', bar: 'bg-gray-400' };
}

export default function QuarterlySummary() {
  const { user } = useSelector((state) => state.auth);
  const [filters, setFilters] = useState(() => {
    const now = new Date();
    return { financialYear: getCurrentFinancialYear(now), quarter: QUARTER_MAP[now.getMonth() + 1] || 'Q1' };
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (filters.financialYear && filters.quarter) {
      setLoading(true);
      getQuarterlyReportApi({ ...filters, employee: user._id })
        .then((res) => {
          const myData = res.data.data?.find((d) => d.employee?._id === user._id);
          setData(myData || null);
        })
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }
  }, [filters, user._id]);

  const ratingColors = getRatingColor(data?.pliRecommendation?.label);

  // Calculate progress position within the slab
  const getProgressPercent = () => {
    if (!data?.pliRecommendation || data.quarterlyScore == null) return 0;
    const { minScore, maxScore } = data.pliRecommendation;
    const range = maxScore - minScore;
    if (range <= 0) return 100;
    const position = ((data.quarterlyScore - minScore) / range) * 100;
    return Math.min(100, Math.max(0, position));
  };

  return (
    <div>
      <PageHeader title="Quarterly Summary" subtitle="View your quarterly performance and PLI recommendation" />
      <FilterBar filters={filters} onChange={setFilters} showMonth={false} />

      {loading ? (
        <LoadingSpinner />
      ) : data ? (
        <div className="space-y-6">
          {/* Month Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(data.monthlyScores).map(([month, score]) => {
              const status = data.monthlyStatuses?.[month];
              const isLocked = status === 'locked';
              return (
                <div key={month} className={`rounded-xl border-2 p-5 transition-all ${isLocked ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{getMonthName(Number(month))}</h4>
                    {status && <StatusBadge status={status} />}
                  </div>
                  <p className={`text-3xl font-bold ${isLocked ? 'text-gray-900' : 'text-gray-400'}`}>
                    {score != null ? formatScore(score) : 'Pending'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {isLocked ? 'Finalized' : status ? 'In progress' : 'No assignment'}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Summary Card */}
          <div className={`rounded-xl border-2 ${ratingColors.border} ${ratingColors.bg} p-6`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Quarterly Score */}
              <div className="text-center md:text-left">
                <p className="text-sm font-medium text-gray-500 mb-1">Quarterly Score</p>
                <p className="text-5xl font-bold text-gray-900">
                  {data.quarterlyScore != null ? formatScore(data.quarterlyScore) : '—'}
                </p>
              </div>

              {/* PLI Rating */}
              {data.pliRecommendation ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500 mb-1">PLI Rating</p>
                  <span className={`inline-block px-4 py-2 rounded-full text-lg font-bold ${ratingColors.bg} ${ratingColors.text} border ${ratingColors.border}`}>
                    {data.pliRecommendation.label}
                  </span>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500 mb-1">PLI Rating</p>
                  <p className="text-lg text-gray-400">Not available</p>
                </div>
              )}

              {/* PLI Payout */}
              {data.pliRecommendation ? (
                <div className="text-center md:text-right">
                  <p className="text-sm font-medium text-gray-500 mb-1">PLI Payout</p>
                  <p className={`text-5xl font-bold ${ratingColors.text}`}>
                    {data.pliRecommendation.payoutPercentage}%
                  </p>
                </div>
              ) : (
                <div className="text-center md:text-right">
                  <p className="text-sm font-medium text-gray-500 mb-1">PLI Payout</p>
                  <p className="text-lg text-gray-400">—</p>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {data.pliRecommendation && (
              <div className="mt-6">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{data.pliRecommendation.minScore}</span>
                  <span>Score position within slab</span>
                  <span>{data.pliRecommendation.maxScore}</span>
                </div>
                <div className="w-full bg-white/60 rounded-full h-3 overflow-hidden border border-gray-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${ratingColors.bar}`}
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Warning */}
          {!data.allMonthsLocked && (
            <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">Partial Results</p>
                <p className="text-sm text-yellow-700">
                  Not all months in this quarter have been finalized and locked. The quarterly score shown is based on available data and may change.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center text-gray-400 py-8">
          No quarterly data available for the selected period.
        </div>
      )}
    </div>
  );
}
