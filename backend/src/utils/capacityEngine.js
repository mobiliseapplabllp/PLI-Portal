/**
 * Capacity Engine — hours/day allocation, per-day conflict detection,
 * calendar-aware capacity.
 *
 * The single source of truth for "is this person over capacity, and when?"
 * and "how many working hours does this month hold?"
 *
 * ── Calendar ───────────────────────────────────────────────────────────────
 * Every function takes a `calendar`:
 *   { hoursPerDay: 8,
 *     workingSaturdays: [2, 4],          // which Saturdays of the month are working (1–5)
 *     holidays: Set<'YYYY-MM-DD'> }      // non-optional holidays only
 *
 * Rules, in order:
 *   1. Sunday is never a working day (hard rule, not configurable)
 *   2. A Saturday works only if its ordinal (1st..5th) is in workingSaturdays
 *   3. A holiday is never a working day
 *   4. Everything else is a working day
 *
 * A bare number is still accepted as the calendar for backward compatibility
 * (Phase 0 callers): it means { hoursPerDay: n, all Saturdays working, no holidays }.
 *
 * ── Dates ──────────────────────────────────────────────────────────────────
 * All date maths is LOCAL time. Never use toISOString() for a calendar date —
 * on an IST server it shifts every date back one day.
 */

const DAY_MS = 86400000;

const toDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
  const out = new Date(y, m - 1, d);
  return Number.isNaN(out.getTime()) ? null : out;
};
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };

/** Accept a number (Phase 0) or a calendar object; always return a full calendar. */
function normaliseCalendar(c) {
  if (c == null) return { hoursPerDay: 8, workingSaturdays: [1, 2, 3, 4, 5], holidays: new Set() };
  if (typeof c === 'number' || typeof c === 'string') {
    return { hoursPerDay: Number(c) || 8, workingSaturdays: [1, 2, 3, 4, 5], holidays: new Set() };
  }
  const sats = Array.isArray(c.workingSaturdays) ? c.workingSaturdays.map(Number) : [1, 2, 3, 4, 5];
  const hol  = c.holidays instanceof Set ? c.holidays
             : new Set(Array.isArray(c.holidays) ? c.holidays.map(h => (typeof h === 'string' ? h : h.date).slice(0, 10)) : []);
  return { hoursPerDay: Number(c.hoursPerDay) || 8, workingSaturdays: sats, holidays: hol };
}

/** 1 for the first Saturday of the month, 2 for the second, … up to 5. */
const saturdayOrdinal = (date) => Math.ceil(date.getDate() / 7);

function isWorkingDay(date, calendar) {
  const cal = normaliseCalendar(calendar);
  const dow = date.getDay();
  if (dow === 0) return false;                                          // Sunday — always off
  if (dow === 6 && !cal.workingSaturdays.includes(saturdayOrdinal(date))) return false;
  if (cal.holidays.has(iso(date))) return false;
  return true;
}

/** Why a given day is off — for the calendar preview. */
function dayKind(date, calendar) {
  const cal = normaliseCalendar(calendar);
  const dow = date.getDay();
  if (dow === 0) return 'sunday';
  if (cal.holidays.has(iso(date))) return 'holiday';
  if (dow === 6) return cal.workingSaturdays.includes(saturdayOrdinal(date)) ? 'working' : 'saturday-off';
  return 'working';
}

/**
 * Capacity for one calendar month.
 * @param year  e.g. 2026   @param month  1–12
 */
function getMonthlyCapacity(year, month, calendar) {
  const cal = normaliseCalendar(calendar);
  const first = new Date(year, month - 1, 1);
  const last  = new Date(year, month, 0);
  const out = { year, month, hoursPerDay: cal.hoursPerDay, daysInMonth: last.getDate(),
                workingDays: 0, sundays: 0, saturdaysOff: 0, saturdaysOn: 0, holidays: [], totalHours: 0 };
  for (let t = first.getTime(); t <= last.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const kind = dayKind(d, cal);
    if (kind === 'working') { out.workingDays++; if (d.getDay() === 6) out.saturdaysOn++; }
    else if (kind === 'sunday') out.sundays++;
    else if (kind === 'saturday-off') out.saturdaysOff++;
    else if (kind === 'holiday') out.holidays.push(iso(d));
  }
  out.totalHours = Math.round(out.workingDays * cal.hoursPerDay * 10) / 10;
  return out;
}

/** True when the allocation is active on the given date. */
function activeOn(alloc, date) {
  const from = toDate(alloc.allocationFrom) || today();
  const to   = toDate(alloc.allocationTo);
  return date >= from && (to === null || date <= to);
}

/**
 * Daily load across a window, working days only.
 * Returns [{ date, hours, allocations }].
 */
function dailyLoad(allocations, from, to, calendar) {
  const cal   = normaliseCalendar(calendar);
  const start = toDate(from) || today();
  const end   = toDate(to) || new Date(start.getTime() + 90 * DAY_MS);
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (!isWorkingDay(d, cal)) continue;
    const active = allocations.filter(a => a.hoursPerDay != null && activeOn(a, d));
    out.push({
      date: iso(d),
      hours: Math.round(active.reduce((s, a) => s + Number(a.hoursPerDay), 0) * 10) / 10,
      allocations: active,
    });
  }
  return out;
}

/** Collapse consecutive over-capacity days into ranges (bridging non-working gaps). */
function toRanges(days) {
  const ranges = [];
  for (const d of days) {
    const last = ranges[ranges.length - 1];
    const cur  = toDate(d.date);
    if (last && (cur.getTime() - toDate(last.to).getTime()) <= 3 * DAY_MS) {
      last.to = d.date;
      last.peak = Math.max(last.peak, d.hours);
      last.days++;
    } else {
      ranges.push({ from: d.date, to: d.date, peak: d.hours, days: 1 });
    }
  }
  return ranges;
}

const fmtShort = (s) => toDate(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/**
 * Would adding/changing one allocation push a person over capacity on any
 * working day in its window?
 * @returns { ok, overDays, ranges, peak, remaining, capacity, message }
 */
function checkConflict(existing, proposed, calendar) {
  const cal = normaliseCalendar(calendar);
  const cap = cal.hoursPerDay;
  const load = dailyLoad([...existing, proposed], proposed.allocationFrom, proposed.allocationTo, cal);

  const over = load.filter(d => d.hours > cap + 0.001);
  const peak = load.reduce((m, d) => Math.max(m, d.hours), 0);
  const busiestExisting = dailyLoad(existing, proposed.allocationFrom, proposed.allocationTo, cal)
    .reduce((m, d) => Math.max(m, d.hours), 0);
  const remaining = Math.max(0, Math.floor((cap - busiestExisting) * 2) / 2);   // round DOWN to 0.5

  if (!over.length) return { ok: true, overDays: 0, ranges: [], peak, remaining, capacity: cap, message: null };

  const ranges = toRanges(over);
  const rangeTxt = ranges.map(r => r.from === r.to ? fmtShort(r.from) : `${fmtShort(r.from)}–${fmtShort(r.to)}`).join(', ');
  return {
    ok: false, overDays: over.length, ranges, peak, remaining, capacity: cap,
    message:
      `Over capacity on ${over.length} working day${over.length === 1 ? '' : 's'} (${rangeTxt}): ${peak}h / ${cap}h. ` +
      (remaining > 0
        ? `Reduce to ${remaining} hrs/day, shorten the period, or choose someone else.`
        : `No hours free in this period — shift the dates or choose someone else.`),
  };
}

/** Summary of a person's load for the availability card. */
function summarise(allocations, calendar, from, to, horizonDays = 30) {
  const cal   = normaliseCalendar(calendar);
  const cap   = cal.hoursPerDay;
  const start = toDate(from) || today();
  const end   = toDate(to) || new Date(start.getTime() + horizonDays * DAY_MS);
  const load  = dailyLoad(allocations, start, end, cal);
  if (!load.length) {
    return { capacity: cap, peakHours: 0, avgHours: 0, freeHours: cap, isOverAllocated: false, nextFreeDate: iso(start), projectCount: 0 };
  }
  const peak = load.reduce((m, d) => Math.max(m, d.hours), 0);
  const avg  = load.reduce((s, d) => s + d.hours, 0) / load.length;
  const firstFree = load.find(d => d.hours < cap);
  const projectIds = new Set(allocations.filter(a => a.hoursPerDay != null).map(a => a.projectId));
  return {
    capacity: cap,
    peakHours: Math.round(peak * 10) / 10,
    avgHours:  Math.round(avg * 10) / 10,
    freeHours: Math.max(0, Math.round((cap - peak) * 10) / 10),
    isOverAllocated: peak > cap + 0.001,
    nextFreeDate: firstFree ? firstFree.date : null,
    projectCount: projectIds.size,
  };
}

/**
 * One person's month, broken down per allocation.
 *
 * Because capacity varies by month (holidays, Saturday policy), a fixed
 * hours/day commitment yields a different monthly figure — and a different % —
 * every month. So hours and % are computed per allocation per month, never stored.
 *
 * Each allocation may carry any extra fields (source, refId, name, …) — they
 * are echoed onto its line untouched.
 *
 * @returns {
 *   year, month,
 *   capacity: { workingDays, hoursPerDay, totalHours, holidays:[] },
 *   lines: [{ ...alloc, workingDaysInMonth, hours, pct }],   // one per allocation active in the month
 *   totalHours, totalPct, avgHoursPerDay,
 *   peakHoursPerDay, peakDates:[up to 5], overDays,
 *   isOverAllocated,            // any single working day > hoursPerDay
 *   band: 'free'|'ok'|'high'|'over'
 * }
 */
function monthBreakdown(allocations, year, month, calendar) {
  const cal = normaliseCalendar(calendar);
  const capacity = getMonthlyCapacity(year, month, cal);
  const first = new Date(year, month - 1, 1);
  const last  = new Date(year, month, 0);

  const active = allocations.filter(a => a.hoursPerDay != null);
  const perAlloc = new Map(active.map(a => [a, { days: 0 }]));
  const daily = [];   // { date, hours }

  for (let t = first.getTime(); t <= last.getTime(); t += DAY_MS) {
    const d = new Date(t);
    if (!isWorkingDay(d, cal)) continue;
    let dayHours = 0;
    for (const a of active) {
      if (activeOn(a, d)) { perAlloc.get(a).days++; dayHours += Number(a.hoursPerDay); }
    }
    daily.push({ date: iso(d), hours: Math.round(dayHours * 10) / 10 });
  }

  const lines = active
    .map(a => {
      const days = perAlloc.get(a).days;
      if (!days) return null;                                         // not active this month
      const hours = Math.round(days * Number(a.hoursPerDay) * 10) / 10;
      return {
        ...a,
        hoursPerDay: Number(a.hoursPerDay),
        workingDaysInMonth: days,
        hours,
        pct: capacity.totalHours ? Math.round((hours / capacity.totalHours) * 1000) / 10 : 0,
      };
    })
    .filter(Boolean)
    .sort((x, y) => y.hours - x.hours);

  const totalHours = Math.round(lines.reduce((s, l) => s + l.hours, 0) * 10) / 10;
  const totalPct   = capacity.totalHours ? Math.round((totalHours / capacity.totalHours) * 1000) / 10 : 0;
  const peak       = daily.reduce((m, d) => Math.max(m, d.hours), 0);
  const overDaysL  = daily.filter(d => d.hours > cal.hoursPerDay + 0.001);
  const avg        = daily.length ? daily.reduce((s, d) => s + d.hours, 0) / daily.length : 0;
  const isOver     = overDaysL.length > 0;

  const band = isOver || totalPct >= 100 ? 'over'
             : totalPct >= 80            ? 'high'
             : totalPct >= 50            ? 'ok'
             :                             'free';

  return {
    year, month, capacity, lines,
    totalHours, totalPct,
    avgHoursPerDay: Math.round(avg * 10) / 10,
    peakHoursPerDay: Math.round(peak * 10) / 10,
    peakDates: overDaysL.slice(0, 5).map(d => d.date),
    overDays: overDaysL.length,
    isOverAllocated: isOver,
    band,
  };
}

/** Number of working days in an inclusive date window. */
function workingDaysBetween(from, to, calendar) {
  const cal = normaliseCalendar(calendar);
  const start = toDate(from), end = toDate(to);
  if (!start || !end || end < start) return 0;
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) if (isWorkingDay(new Date(t), cal)) n++;
  return n;
}

/**
 * Resolve what the user typed into the one value the engine runs on.
 *
 * input: { allocationMode:'per_day'|'total', hoursPerDay?, allocationTotalHours?,
 *          allocationFrom?, allocationTo? }
 *
 * per_day → hoursPerDay is the truth (0.5 steps, ≤ capacity); total is derived
 *           when both dates exist.
 * total   → both dates required; hoursPerDay = total ÷ working days, kept to
 *           0.1 so the total stays exact (no 0.5-step rule here).
 *
 * Returns { ok:true, mode, hoursPerDay, totalHours, workingDays }
 *      or { ok:false, error }.  Never throws.
 */
function resolveAllocation(input, calendar) {
  const cal  = normaliseCalendar(calendar);
  const cap  = cal.hoursPerDay;
  const mode = input.allocationMode === 'total' ? 'total' : 'per_day';
  const from = input.allocationFrom || null, to = input.allocationTo || null;

  if (mode === 'total') {
    if (!from || !to) return { ok: false, error: 'Total hours needs both a start and an end date' };
    if (toDate(to) < toDate(from)) return { ok: false, error: 'End date is before start date' };
    const total = Number(input.allocationTotalHours);
    if (!Number.isFinite(total) || total < 0.5 || total > 9999) return { ok: false, error: 'Total hours must be between 0.5 and 9999' };
    const wd = workingDaysBetween(from, to, cal);
    if (wd === 0) return { ok: false, error: 'There are no working days in the selected period' };
    const hpd = Math.round((total / wd) * 10) / 10;
    if (hpd < 0.1) return { ok: false, error: `${total}h over ${wd} working days is less than 0.1 h/day — shorten the period or increase the hours` };
    return { ok: true, mode, hoursPerDay: hpd, totalHours: Math.round(total * 10) / 10, workingDays: wd };
  }

  const hpd = Number(input.hoursPerDay);
  if (!Number.isFinite(hpd) || hpd < 0.5 || hpd > cap || Math.round(hpd * 2) !== hpd * 2) {
    return { ok: false, error: `hoursPerDay must be between 0.5 and ${cap} in steps of 0.5` };
  }
  const wd = from && to ? workingDaysBetween(from, to, cal) : null;
  return { ok: true, mode, hoursPerDay: hpd, totalHours: wd != null ? Math.round(hpd * wd * 10) / 10 : null, workingDays: wd };
}

/** Derived percentage for display — never stored. */
const toPct = (hoursPerDay, calendar) => {
  const cap = normaliseCalendar(calendar).hoursPerDay;
  return hoursPerDay == null ? null : Math.round((Number(hoursPerDay) / cap) * 1000) / 10;
};

module.exports = {
  normaliseCalendar, isWorkingDay, dayKind, saturdayOrdinal, getMonthlyCapacity,
  dailyLoad, checkConflict, summarise, monthBreakdown, toPct, toDate, iso,
  workingDaysBetween, resolveAllocation,
};
