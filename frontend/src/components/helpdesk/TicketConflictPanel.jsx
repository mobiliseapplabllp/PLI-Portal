/**
 * TicketConflictPanel.jsx
 *
 * The helpdesk twin of the PM ConflictPanel (pages/pm/ProjectDetail.jsx ~L363).
 * Rendered after a ticket create / update / assign answered HTTP 409 because the
 * agent would be over capacity. Same visual language as PM: red box, the ranges,
 * one-click fixes, and a "Request exception…" path.
 *
 * Props
 *   conflict            409 body `conflict`:
 *                       { overDays, ranges:[{from,to,peak,days}], peak, remaining, capacity,
 *                         suggestions:{ reduceTo, nextFreeDate, shortenTo, overloadHours },
 *                         canRequestException, exceptionMaxHoursPerDay }
 *                       Every key may be missing — `suggestions` falls back to `remaining`.
 *   capacity            fallback capacity (h/day) when the body carries none
 *   onApply(patch)      apply a suggestion to the caller's allocation form. Patches:
 *                         { allocationMode:'per_day', allocationHoursPerDay, allocationTotalHours:null }
 *                         { allocationFrom }  |  { allocationTo }
 *                       Omit to hide the fix buttons.
 *   onRequestException  opens the exception flow. Omit where there is no ticket id yet
 *                       (the create form) — pass `note` instead.
 *   note                extra line under the buttons (e.g. the create-form hint).
 *   compact             tighter padding for use inside a modal.
 */

import { parseLocalDate } from '../../utils/formatters';

const fmtH = (h) => Math.round((Number(h) || 0) * 10) / 10;

// Ranges are date-only ('YYYY-MM-DD'): parse LOCAL, or a negative UTC offset
// renders every boundary one day early.
const fmtRangeDate = (iso) => {
  if (!iso) return '?';
  try {
    const d = parseLocalDate(iso);
    if (!d) return String(iso).slice(0, 10);
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  } catch { return String(iso).slice(0, 10); }
};

/**
 * Normalise the 409 `conflict.suggestions` block (may be absent on older
 * servers). Falls back to `remaining` for the reduce option.
 * Mirrors conflictSuggestions() in pages/pm/ProjectDetail.jsx.
 */
export const ticketConflictSuggestions = (conflict) => {
  const s = conflict?.suggestions || {};
  const remaining = conflict?.remaining != null ? Number(conflict.remaining) : null;
  const reduceTo = s.reduceTo != null ? Number(s.reduceTo) : (remaining != null && remaining > 0 ? remaining : null);
  return {
    reduceTo:      reduceTo != null && reduceTo > 0 ? reduceTo : null,
    nextFreeDate:  s.nextFreeDate ? String(s.nextFreeDate).slice(0, 10) : null,
    shortenTo:     s.shortenTo    ? String(s.shortenTo).slice(0, 10)    : null,
    overloadHours: s.overloadHours != null ? Number(s.overloadHours) : null,
  };
};

export default function TicketConflictPanel({
  conflict,
  capacity,
  onApply,
  onRequestException,
  note = null,
  compact = false,
}) {
  if (!conflict) return null;

  const cap    = Number(conflict.capacity) > 0 ? Number(conflict.capacity) : capacity;
  const ranges = Array.isArray(conflict.ranges) ? conflict.ranges : [];
  const sugg   = ticketConflictSuggestions(conflict);
  const overDays = conflict.overDays ?? ranges.reduce((s, r) => s + (r.days || 0), 0);
  const canRequestException = conflict.canRequestException !== false;

  const btn = 'px-2.5 py-1 bg-white border border-red-300 text-red-700 rounded text-xs font-medium hover:bg-red-100 transition-colors';
  const hasFix = !!onApply && (sugg.reduceTo != null || sugg.nextFreeDate || sugg.shortenTo);
  const hasAny = hasFix || (onRequestException && canRequestException);

  return (
    <div
      className={`bg-red-50 border border-red-200 rounded-lg text-red-700 ${compact ? 'px-2.5 py-2 mt-2 text-xs' : 'px-3 py-2.5 my-3 text-sm'}`}
      role="alert"
    >
      <p className="font-semibold">
        Over capacity on {overDays} working day{overDays === 1 ? '' : 's'} — not saved
        {conflict.peak != null && cap != null && (
          <span className="font-normal text-red-600">
            {' '}· peak {fmtH(conflict.peak)}h / {fmtH(cap)}h
            {sugg.overloadHours != null && sugg.overloadHours > 0 ? ` (+${fmtH(sugg.overloadHours)}h)` : ''}
          </span>
        )}
      </p>

      {ranges.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-red-600">
          {ranges.map((r, i) => (
            <li key={i}>
              {fmtRangeDate(r.from)} – {fmtRangeDate(r.to)} · peak {fmtH(r.peak)}h / {fmtH(cap)}h
              {r.days ? ` · ${r.days} day${r.days === 1 ? '' : 's'}` : ''}
            </li>
          ))}
        </ul>
      )}

      {hasAny && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {sugg.reduceTo != null && onApply && (
            <button
              type="button"
              className={btn}
              onClick={() => onApply({
                allocationMode:       'per_day',
                allocationHoursPerDay: sugg.reduceTo,
                allocationTotalHours:  null,
              })}
            >
              Use {fmtH(sugg.reduceTo)} hrs/day
            </button>
          )}
          {sugg.nextFreeDate && onApply && (
            <button type="button" className={btn} onClick={() => onApply({ allocationFrom: sugg.nextFreeDate })}>
              Start on {fmtRangeDate(sugg.nextFreeDate)}
            </button>
          )}
          {sugg.shortenTo && onApply && (
            <button type="button" className={btn} onClick={() => onApply({ allocationTo: sugg.shortenTo })}>
              End on {fmtRangeDate(sugg.shortenTo)}
            </button>
          )}
          {onRequestException && canRequestException && (
            <button
              type="button"
              onClick={onRequestException}
              className="px-2.5 py-1 bg-amber-600 border border-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors"
            >
              Request exception…
            </button>
          )}
        </div>
      )}

      {conflict.exceptionMaxHoursPerDay != null && canRequestException && onRequestException && (
        <p className="text-[11px] text-red-600 mt-1.5">
          Exceptions can be approved up to {fmtH(conflict.exceptionMaxHoursPerDay)} h/day.
        </p>
      )}

      {note && <p className="text-[11px] text-red-600 mt-1.5">{note}</p>}
    </div>
  );
}
