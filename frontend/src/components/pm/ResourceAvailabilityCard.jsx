import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import {
  HiOutlineExclamation,
  HiOutlineCalendar,
  HiOutlineUserGroup,
} from 'react-icons/hi';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SkeletonBar({ className = '' }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div
      className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-3"
      aria-busy="true"
      aria-label="Loading resource availability"
    >
      <SkeletonBar className="h-4 w-40" />
      <SkeletonBar className="h-2 w-full" />
      <SkeletonBar className="h-3 w-3/4" />
    </div>
  );
}

function AssignmentRow({ asgn }) {
  return (
    <li className="flex items-center gap-2 text-xs text-gray-700">
      {/* Mini proportional bar */}
      <div
        className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0"
        aria-hidden="true"
      >
        <div
          className="h-full bg-blue-400 rounded-full"
          style={{ width: `${Math.min(asgn.allocationPct, 100)}%` }}
        />
      </div>

      {/* Project name */}
      <span className="font-medium text-gray-700 truncate min-w-0 flex-1">
        {asgn.projectName}
      </span>

      {/* Assumed label */}
      {asgn.isAssumed100 && (
        <span className="text-gray-400 italic text-[10px] shrink-0">(assumed)</span>
      )}

      {/* Percentage */}
      <span className="shrink-0 font-semibold text-gray-600 tabular-nums">
        {asgn.allocationPct}%
      </span>

      {/* Date range */}
      <span
        className="shrink-0 text-gray-400 flex items-center gap-0.5"
        title={`${fmtDate(asgn.fromDate)} to ${fmtDate(asgn.toDate)}`}
      >
        <HiOutlineCalendar className="w-3 h-3" aria-hidden="true" />
        <span>{fmtDateShort(asgn.fromDate)}</span>
        <span aria-hidden="true">→</span>
        <span>{fmtDateShort(asgn.toDate)}</span>
      </span>
    </li>
  );
}

function SuggestionCard({ suggestion, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(suggestion)}
      className={[
        'text-left w-full bg-white border border-gray-200 rounded-lg p-3',
        'cursor-pointer hover:border-blue-300 hover:shadow-sm',
        'transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-blue-400/40',
      ].join(' ')}
      aria-label={suggestion.label}
    >
      <p className="text-xs font-semibold text-gray-800 mb-1">{suggestion.label}</p>
      <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{suggestion.description}</p>
      <span className="inline-block text-[11px] font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-0.5">
        {suggestion.buttonLabel}
      </span>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
/**
 * ResourceAvailabilityCard
 *
 * Shows the current allocation workload for a user being added to a project.
 * Fetches GET /pm/users/:userId/availability and renders committed vs free
 * capacity, current assignments, and conflict-resolution suggestions when
 * the projected total would exceed 100%.
 *
 * Props:
 *   userId            — the user being added (string)
 *   fromDate          — ISO date of new assignment start (string | null)
 *   toDate            — ISO date of new assignment end (string | null)
 *   newPct            — allocationPct of the new assignment (number | null)
 *   onSuggestionSelect — called with the suggestion object the user clicks
 */
export default function ResourceAvailabilityCard({
  userId,
  fromDate,
  toDate,
  newPct = 0,
  onSuggestionSelect,
}) {
  const [data,    setData]    = useState(null);
  // Initialise to true when userId is already known so the component starts in
  // the loading skeleton state rather than briefly flashing "No allocation data".
  const [loading, setLoading] = useState(!!userId);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!userId) { setData(null); return; }
    setLoading(true);
    setError(null);

    const params = {};
    if (fromDate) params.fromDate = fromDate;
    if (toDate)   params.toDate   = toDate;

    api.get(`/pm/users/${userId}/availability`, { params })
      .then(res  => setData(res.data?.data ?? null))
      .catch(()  => setError('Could not load availability'))
      .finally(() => setLoading(false));
  }, [userId, fromDate, toDate]);

  // ── Guard: nothing to show ────────────────────────────────────────────────
  if (!userId) return null;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton />;

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-2 text-sm text-gray-500">
        <HiOutlineExclamation className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </div>
    );
  }

  // ── No data state ─────────────────────────────────────────────────────────
  if (!data || data.hasNoData) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-2.5 text-sm text-gray-400">
        <span className="text-base leading-none" aria-hidden="true">⚪</span>
        <span>No allocation data available for this user</span>
      </div>
    );
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const {
    totalCommitted    = 0,
    freeCapacity      = 0,
    allocations: currentAssignments = [],
    nextFreeDate,
    suggestions       = [],
  } = data;

  const effectiveNewPct = newPct ?? 0;
  const projectedTotal  = totalCommitted + effectiveNewPct;
  const isOverAllocated = projectedTotal > 100;

  // Main bar color: green → amber → red
  const committedBarColor =
    totalCommitted > 100 ? 'bg-red-500'   :
    totalCommitted > 80  ? 'bg-amber-500' :
                           'bg-emerald-500';

  const projectedBarColor = isOverAllocated ? 'bg-red-400' : 'bg-indigo-400';

  // Card wrapper classes
  const cardCls = isOverAllocated
    ? 'bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4'
    : 'bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-4';

  return (
    <div className={cardCls} role="region" aria-label="Resource Availability">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <HiOutlineUserGroup className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
        <span className="text-xs font-semibold text-gray-700 tracking-wide uppercase">
          Resource Availability
        </span>
      </div>

      {/* ── Over-allocation warning banner ─────────────────────────────────── */}
      {isOverAllocated && (
        <div
          className="flex items-start gap-2 bg-amber-100 border border-amber-300 rounded-md px-3 py-2 text-sm text-amber-800"
          role="alert"
        >
          <HiOutlineExclamation className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            This person would be at{' '}
            <strong>{projectedTotal}%</strong> capacity for the selected dates.
          </span>
        </div>
      )}

      {/* ── Capacity summary ────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Legend dots */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${committedBarColor}`}
              aria-hidden="true"
            />
            <strong className="tabular-nums">{totalCommitted}%</strong>
            {' '}committed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" aria-hidden="true" />
            <strong className="tabular-nums">{Math.max(0, freeCapacity)}%</strong>
            {' '}free
          </span>
          {effectiveNewPct > 0 && (
            <span className="flex items-center gap-1.5 text-indigo-600">
              <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" aria-hidden="true" />
              +<strong className="tabular-nums">{effectiveNewPct}%</strong>
              {' '}new
            </span>
          )}
        </div>

        {/* Current commitment bar */}
        <div
          className="h-2 rounded-full overflow-hidden bg-gray-200"
          role="progressbar"
          aria-valuenow={totalCommitted}
          aria-valuemin={0}
          aria-valuemax={100}
          title={`${totalCommitted}% committed, ${Math.max(0, freeCapacity)}% free`}
        >
          <div
            className={`h-full transition-all duration-300 ${committedBarColor}`}
            style={{ width: `${Math.min(totalCommitted, 100)}%` }}
          />
        </div>

        {/* Projected total bar — shown only when a new allocation is entered */}
        {effectiveNewPct > 0 && (
          <div className="flex items-center gap-2">
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-100"
              role="progressbar"
              aria-valuenow={projectedTotal}
              aria-valuemin={0}
              aria-valuemax={100}
              title={`Projected total: ${projectedTotal}% after adding this assignment`}
            >
              <div
                className={`h-full transition-all duration-300 ${projectedBarColor}`}
                style={{ width: `${Math.min(projectedTotal, 100)}%` }}
              />
            </div>
            <span className={`text-[11px] font-medium tabular-nums shrink-0 ${
              isOverAllocated ? 'text-red-600' : 'text-indigo-600'
            }`}>
              {projectedTotal}% projected
            </span>
          </div>
        )}
      </div>

      {/* ── Current assignments ─────────────────────────────────────────────── */}
      {currentAssignments.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Current assignments
          </p>
          <ul className="space-y-2" role="list">
            {currentAssignments.map((asgn, idx) => (
              <AssignmentRow key={idx} asgn={asgn} />
            ))}
          </ul>
        </div>
      )}

      {/* ── Next free date ──────────────────────────────────────────────────── */}
      {nextFreeDate && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <HiOutlineCalendar className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
          Next free:{' '}
          <span className="font-medium text-gray-700">{fmtDate(nextFreeDate)}</span>
        </p>
      )}

      {/* ── Conflict resolution suggestions ────────────────────────────────── */}
      {isOverAllocated && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            Resolve conflict
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {suggestions.map((sug, idx) => (
              <SuggestionCard
                key={idx}
                suggestion={sug}
                onSelect={onSuggestionSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
