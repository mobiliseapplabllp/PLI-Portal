import { useEffect, useRef, useState } from 'react';
import api from '../../api/axios';

// ── Helpers ───────────────────────────────────────────────────────────────────
/** '' / null / non-numeric → null, otherwise Number(). Falsy-zero safe. */
const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (n) => Math.round(n * 10) / 10;
/** "4", "2.6" — never "4.0" */
const fmtH = (n) => String(round1(Number(n)));

/**
 * Display string for an allocation object (member / approval / ticket / allocation).
 *   per_day → "4 h/day · 50%"
 *   total   → "120h total · 2.6 h/day · 33%"
 * Reads hoursPerDay (or allocationHoursPerDay for tickets), allocationTotalHours, allocationMode.
 * Falls back to per_day formatting when the mode is missing.
 */
export function formatAllocation(obj, capacity = 8) {
  if (!obj) return '';
  const cap   = Number(capacity) > 0 ? Number(capacity) : 8;
  const mode  = obj.allocationMode === 'total' ? 'total' : 'per_day';
  const total = num(obj.allocationTotalHours);
  const hpd   = num(obj.hoursPerDay ?? obj.allocationHoursPerDay);
  const pct   = (h) => `${Math.round((h / cap) * 100)}%`;

  if (mode === 'total' && total != null) {
    const parts = [`${fmtH(total)}h total`];
    if (hpd != null) parts.push(`${fmtH(hpd)} h/day`, pct(hpd));
    return parts.join(' · ');
  }
  if (hpd == null) return '';
  return `${fmtH(hpd)} h/day · ${pct(hpd)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * Two-mode allocation input: "Hours per day" | "Total hours".
 *
 * Props
 *   value       { allocationMode, hoursPerDay, allocationTotalHours }
 *   onChange    (next) → parent stores the whole object
 *   from / to   YYYY-MM-DD or null — dates are owned by the parent form
 *   capacity    working hours/day used for the % line and the per-day max (default 8)
 *   maxPerDay   optional ceiling for the per-day input (defaults to capacity)
 *   defaultMode 'per_day' | 'total' — used when value.allocationMode is unset
 *   compact     tighter layout for inline edits
 *   disabled
 *   onDerived   ({ hoursPerDay, totalHours, workingDays }) — fires whenever the derived numbers change
 *   inputClassName  optional override for the number input (keeps each page's look)
 */
export default function AllocationTypeInput({
  value,
  onChange,
  from,
  to,
  capacity = 8,
  maxPerDay,
  defaultMode = 'per_day',
  compact = false,
  disabled = false,
  onDerived,
  inputClassName,
}) {
  const v        = value || {};
  const mode     = v.allocationMode === 'total' || v.allocationMode === 'per_day' ? v.allocationMode : defaultMode;
  const cap      = Number(capacity) > 0 ? Number(capacity) : 8;
  const perDayMax = Number(maxPerDay) > 0 ? Number(maxPerDay) : cap;
  const hpd      = num(v.hoursPerDay);
  const total    = num(v.allocationTotalHours);

  // ── Working days (GET /pm/config/calendar/working-days) ──────────────────
  const [calendar, setCalendar]       = useState(null);   // { from, to, workingDays, hoursPerDay, capacityHours }
  const [calError, setCalError]       = useState(null);
  const [calLoading, setCalLoading]   = useState(false);
  const lastDaysRef = useRef(null);                       // last known workingDays — survives date clears for mode conversion

  useEffect(() => {
    if (!from || !to) { setCalendar(null); setCalError(null); setCalLoading(false); return; }
    let alive = true;
    setCalLoading(true);
    const t = setTimeout(() => {
      api.get('/pm/config/calendar/working-days', { params: { from, to } })
        .then(res => {
          if (!alive) return;
          const data = res.data?.data ?? res.data ?? null;
          const days = num(data?.workingDays);
          setCalendar(data ? { ...data, workingDays: days } : null);
          setCalError(null);
          if (days != null && days > 0) lastDaysRef.current = days;
        })
        .catch(err => {
          if (!alive) return;
          setCalendar(null);
          setCalError(err.response?.data?.message || err.response?.data?.error?.message || 'Could not compute working days');
        })
        .finally(() => { if (alive) setCalLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [from, to]);

  const days = calendar?.workingDays != null && calendar.workingDays > 0 ? calendar.workingDays : null;

  // ── Derived numbers ───────────────────────────────────────────────────────
  let derivedPerDay = null;
  let derivedTotal  = null;
  if (mode === 'per_day') {
    derivedPerDay = hpd;
    if (hpd != null && days) derivedTotal = round1(hpd * days);
  } else {
    derivedTotal = total;
    if (total != null && days) derivedPerDay = round1(total / days);
  }
  const pct = derivedPerDay != null ? Math.round((derivedPerDay / cap) * 100) : null;

  const onDerivedRef = useRef(onDerived);
  onDerivedRef.current = onDerived;
  useEffect(() => {
    onDerivedRef.current?.({ hoursPerDay: derivedPerDay, totalHours: derivedTotal, workingDays: days });
  }, [derivedPerDay, derivedTotal, days]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const emit = (patch) => onChange?.({ ...v, allocationMode: mode, ...patch });

  const switchMode = (next) => {
    if (next === mode || disabled) return;
    const knownDays = days ?? lastDaysRef.current;
    if (next === 'total') {
      // per_day → total: h × days
      const converted = hpd != null && knownDays ? round1(hpd * knownDays) : null;
      onChange?.({ ...v, allocationMode: 'total', allocationTotalHours: converted, hoursPerDay: null });
    } else {
      // total → per_day: total ÷ days (1 decimal)
      const converted = total != null && knownDays ? round1(total / knownDays) : null;
      onChange?.({ ...v, allocationMode: 'per_day', hoursPerDay: converted, allocationTotalHours: null });
    }
  };

  const onNumberChange = (e) => {
    const n = e.target.value !== '' ? Number(e.target.value) : null;
    if (mode === 'per_day') emit({ hoursPerDay: n });
    else emit({ allocationTotalHours: n });
  };

  // ── Derived line ──────────────────────────────────────────────────────────
  let derivedLine = null;
  let derivedTone = 'text-gray-400';
  if (calError && from && to) {
    derivedLine = calError; derivedTone = 'text-red-500';
  } else if (!from || !to) {
    if (mode === 'total') { derivedLine = 'Total hours needs both a start and an end date'; derivedTone = 'text-amber-600'; }
    else                  { derivedLine = 'Add dates to see the total'; }
  } else if (calLoading && !calendar) {
    derivedLine = 'Calculating working days…';
  } else if (days) {
    const dayWord = `${days} working day${days === 1 ? '' : 's'}`;
    if (mode === 'per_day' && hpd != null) {
      derivedLine = `= ${fmtH(hpd * days)}h over ${dayWord} · ${pct}% of capacity`;
      derivedTone = 'text-gray-500';
    } else if (mode === 'total' && total != null) {
      derivedLine = `= ${fmtH(total / days)}h/day over ${dayWord} · ${pct}% of capacity`;
      derivedTone = pct > 100 ? 'text-amber-600' : 'text-gray-500';
    } else {
      derivedLine = `${dayWord} in range`;
    }
  } else if (calendar) {
    derivedLine = 'No working days in the selected range'; derivedTone = 'text-amber-600';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isPerDay  = mode === 'per_day';
  const inputVal  = isPerDay ? (v.hoursPerDay ?? '') : (v.allocationTotalHours ?? '');
  const segBtn    = (active) =>
    `${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} font-medium transition-colors ` +
    (active ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50') +
    (disabled ? ' opacity-60 cursor-not-allowed' : '');
  const inputCls  = inputClassName ||
    (compact
      ? 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm'
      : 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm');

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'} flex-wrap`}>
        <label className={`${compact ? 'text-xs' : 'text-xs font-medium'} text-gray-600`}>
          {isPerDay ? 'Hours / day' : 'Total hours'}
        </label>
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden divide-x divide-gray-300" role="group" aria-label="Allocation type">
          <button type="button" aria-pressed={isPerDay}  disabled={disabled} onClick={() => switchMode('per_day')} className={segBtn(isPerDay)}>Hours per day</button>
          <button type="button" aria-pressed={!isPerDay} disabled={disabled} onClick={() => switchMode('total')}   className={segBtn(!isPerDay)}>Total hours</button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="0.5"
          max={isPerDay ? perDayMax : 9999}
          step="0.5"
          value={inputVal}
          onChange={onNumberChange}
          disabled={disabled}
          placeholder={isPerDay ? 'e.g. 4' : 'e.g. 40'}
          aria-label={isPerDay ? 'Hours per day' : 'Total hours'}
          className={inputCls}
        />
        <span className={`${compact ? 'text-[11px]' : 'text-xs'} text-gray-400 whitespace-nowrap`}>
          {isPerDay ? `of ${fmtH(cap)}h` : 'hours'}
        </span>
      </div>
      {derivedLine && (
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} ${derivedTone}`}>{derivedLine}</p>
      )}
    </div>
  );
}
