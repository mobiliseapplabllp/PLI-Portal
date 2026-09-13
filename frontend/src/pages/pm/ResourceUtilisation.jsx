import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineRefresh,
  HiOutlineSearch,
  HiOutlineX,
  HiOutlineExclamation,
} from 'react-icons/hi';
import { getUtilisationApi, getUserUtilisationApi } from '../../api/pm/utilisation.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_MONTHS = 12;

const pad2 = (n) => String(n).padStart(2, '0');
const toYm = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const parseYm = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  return { y, m };
};
const addMonths = (ym, n) => {
  const { y, m } = parseYm(ym);
  const d = new Date(y, m - 1 + n, 1);
  return toYm(d);
};
const monthIndex = (ym) => {
  const { y, m } = parseYm(ym);
  return y * 12 + (m - 1);
};
const monthSpan = (from, to) => monthIndex(to) - monthIndex(from) + 1;
const monthLabel = (ym) => {
  const { y, m } = parseYm(ym);
  if (!y || !m) return ym || '';
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
const dayLabel = (iso) => {
  // 'YYYY-MM-DD' → '21 Sep'
  const [, m, d] = String(iso || '').split('-').map(Number);
  if (!m || !d) return iso || '';
  return `${d} ${MONTH_NAMES[m - 1]}`;
};
const fmtHours = (x) => Math.round((Number(x) || 0) * 10) / 10;
const fmtPct = (x) => Math.round(Number(x) || 0);
const getId = (u) => u?._id || u?.id || u?.userId || '';
const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const BAND_CELL = {
  free: 'bg-gray-50 text-gray-500',
  ok:   'bg-emerald-50 text-emerald-700',
  high: 'bg-amber-50 text-amber-700',
  over: 'bg-red-50 text-red-700',
};
const BAND_BAR = {
  free: 'bg-gray-400',
  ok:   'bg-emerald-500',
  high: 'bg-amber-500',
  over: 'bg-red-500',
};
const BAND_LABEL = {
  free: 'Free (<50%)',
  ok:   'OK (50–79%)',
  high: 'High (80–99%)',
  over: 'Over (≥100% or any day over capacity)',
};

const inputCls =
  'px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white';
const thCls = 'px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide';

// ─── Stat tile ────────────────────────────────────────────────────────────────
function StatTile({ label, value, accent = 'text-gray-900', hint }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Heat-map cell ────────────────────────────────────────────────────────────
function HeatCell({ cell, onOpen }) {
  if (!cell) {
    return (
      <td className="px-2 py-2 text-center text-xs text-gray-300 border-l border-gray-100">—</td>
    );
  }
  const band = BAND_CELL[cell.band] ? cell.band : 'free';
  const peakOnly = cell.isOverAllocated && cell.totalPct < 100;
  return (
    <td className="p-1 border-l border-gray-100 align-middle">
      <button
        type="button"
        onClick={onOpen}
        title={`${fmtPct(cell.totalPct)}% — ${fmtHours(cell.totalHours)}h (PM ${fmtHours(cell.pmHours)}h · HD ${fmtHours(cell.hdHours)}h)`}
        className={[
          'relative w-full min-w-[84px] rounded-lg px-2 py-2 text-center transition-shadow',
          'focus:outline-none focus:ring-2 focus:ring-emerald-500 hover:shadow-sm',
          BAND_CELL[band],
        ].join(' ')}
      >
        {peakOnly && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500"
            title={`Over capacity on ${cell.overDays} day(s) — peak ${fmtHours(cell.peakHoursPerDay)}h`}
            aria-label={`Over capacity on ${cell.overDays} day(s) — peak ${fmtHours(cell.peakHoursPerDay)}h`}
          />
        )}
        <span className="block text-sm font-bold tabular-nums">{fmtPct(cell.totalPct)}%</span>
        <span className="block text-[11px] text-gray-500 tabular-nums">{fmtHours(cell.totalHours)}h</span>
      </button>
    </td>
  );
}

// ─── Drill-down slide-over ────────────────────────────────────────────────────
function DrillDown({ target, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [detail, setDetail]   = useState(null);
  const closeBtnRef = useRef(null);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError('');
    try {
      const res = await getUserUtilisationApi(target.userId, target.month);
      setDetail(res.data.data);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load utilisation detail');
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    closeBtnRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!target) return null;

  const cap        = detail?.capacity || {};
  const capHours   = Number(cap.totalHours) || 0;
  const totalHours = Number(detail?.totalHours) || 0;
  const band       = BAND_BAR[detail?.band] ? detail.band : 'free';
  const barPct     = capHours > 0 ? Math.min(100, (totalHours / capHours) * 100) : 0;
  const lines      = Array.isArray(detail?.lines) ? detail.lines : [];
  const totDays    = lines.reduce((s, l) => s + (Number(l.workingDaysInMonth) || 0), 0);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="util-drill-title">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 id="util-drill-title" className="text-lg font-bold text-gray-900 truncate">
              {detail?.user?.name || target.name}
            </h2>
            <p className="text-sm text-gray-500">
              {monthLabel(target.month)}
              {detail?.user?.designation ? ` · ${detail.user.designation}` : ''}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            title="Close"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-2/3" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-24 bg-gray-100 rounded-xl" />
              <div className="h-40 bg-gray-100 rounded-xl" />
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <p className="text-sm text-red-700">{error}</p>
              <button
                type="button"
                onClick={load}
                className="text-sm font-medium text-red-700 hover:underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && detail && (
            <>
              {/* Capacity */}
              <div>
                <p className="text-sm text-gray-600">
                  <span className="tabular-nums">{cap.workingDays ?? 0}</span> working days ×{' '}
                  <span className="tabular-nums">{fmtHours(cap.hoursPerDay)}</span>h ={' '}
                  <span className="font-semibold text-gray-900 tabular-nums">{fmtHours(capHours)}h</span>
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${BAND_BAR[band]}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${BAND_CELL[band].split(' ')[1]}`}>
                    {fmtPct(detail.totalPct)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 tabular-nums">
                  {fmtHours(totalHours)}h committed · PM {fmtHours(detail.pmHours)}h · Helpdesk {fmtHours(detail.hdHours)}h
                  {' · '}avg {fmtHours(detail.avgHoursPerDay)}h/day
                </p>
              </div>

              {/* Over-capacity callout */}
              {detail.isOverAllocated && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <HiOutlineExclamation className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-red-700">
                        Over capacity on {detail.overDays} day{detail.overDays === 1 ? '' : 's'} — peak{' '}
                        <span className="tabular-nums">{fmtHours(detail.peakHoursPerDay)}</span>h/day
                      </p>
                      {Array.isArray(detail.peakDates) && detail.peakDates.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {detail.peakDates.map((d) => (
                            <span
                              key={d}
                              className="inline-flex px-2 py-0.5 rounded-full bg-white border border-red-200 text-xs text-red-700 tabular-nums"
                            >
                              {dayLabel(d)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Lines */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {lines.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-gray-500 text-center">No allocations this month</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className={`${thCls} text-left`}>Source</th>
                          <th className={`${thCls} text-left`}>Name</th>
                          <th className={`${thCls} text-right`}>h/day</th>
                          <th className={`${thCls} text-right`}>Days</th>
                          <th className={`${thCls} text-right`}>Hours</th>
                          <th className={`${thCls} text-right`}>%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {lines.map((l, i) => (
                          <tr key={`${l.source}-${l.refId ?? i}`} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <span
                                className={[
                                  'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                                  l.source === 'helpdesk'
                                    ? 'bg-sky-50 text-sky-700'
                                    : 'bg-emerald-50 text-emerald-700',
                                ].join(' ')}
                              >
                                {l.source === 'helpdesk' ? 'Helpdesk' : 'Project'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-gray-900 truncate">{l.name}</span>
                                {l.isEstimated && (
                                  <span
                                    className="inline-flex px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-medium uppercase tracking-wide shrink-0"
                                    title="Hours are estimated"
                                  >
                                    estimated
                                  </span>
                                )}
                              </div>
                              {l.status && <p className="text-xs text-gray-400">{l.status}</p>}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtHours(l.hoursPerDay)}h</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{l.workingDaysInMonth ?? 0}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-medium">{fmtHours(l.hours)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{fmtPct(l.pct)}%</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-200">
                        <tr>
                          <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={3}>Total</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 font-semibold">{totDays}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-bold">{fmtHours(totalHours)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-900 font-bold">{fmtPct(detail.totalPct)}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResourceUtilisation() {
  const navigate = useNavigate();

  const nowYm = useMemo(() => toYm(new Date()), []);
  const [from, setFrom] = useState(nowYm);
  const [to, setTo]     = useState(addMonths(nowYm, 5));

  const [search, setSearch]       = useState('');
  const [bandFilter, setBandFilter] = useState('all');
  const [summaryMonth, setSummaryMonth] = useState(nowYm);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [data, setData]       = useState({ calendar: null, months: [], users: [] });
  const [drill, setDrill]     = useState(null);

  // Normalise range: swap if reversed, clamp to MAX_MONTHS
  const applyRange = useCallback((nextFrom, nextTo) => {
    let f = nextFrom, t = nextTo;
    if (!f || !t) return;
    if (monthIndex(t) < monthIndex(f)) [f, t] = [t, f];
    if (monthSpan(f, t) > MAX_MONTHS) t = addMonths(f, MAX_MONTHS - 1);
    setFrom(f);
    setTo(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getUtilisationApi({ from, to });
      const d = res.data.data || {};
      setData({
        calendar: d.calendar || null,
        months: Array.isArray(d.months) ? d.months : [],
        users: Array.isArray(d.users) ? d.users : [],
      });
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load resource utilisation');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // Keep summaryMonth inside the range
  useEffect(() => {
    if (monthIndex(summaryMonth) < monthIndex(from) || monthIndex(summaryMonth) > monthIndex(to)) {
      setSummaryMonth(from);
    }
  }, [from, to, summaryMonth]);

  const { months, users } = data;
  const summary = useMemo(() => {
    const m = months.find((x) => x.month === summaryMonth) || months[0];
    return m?.summary || null;
  }, [months, summaryMonth]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q) {
        const hay = `${u.name || ''} ${u.email || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (bandFilter !== 'all') {
        const cell = (u.cells || []).find((c) => c.month === summaryMonth);
        if (!cell || cell.band !== bandFilter) return false;
      }
      return true;
    });
  }, [users, search, bandFilter, summaryMonth]);

  const openDrill = useCallback((u, month) => {
    setDrill({ userId: getId(u), name: u.name, month });
  }, []);
  const closeDrill = useCallback(() => setDrill(null), []);

  const colCount = months.length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate('/pm')}
          className="mt-0.5 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          title="Back to PM Dashboard"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resource Utilisation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Hours committed vs monthly capacity — projects and helpdesk together
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">From</span>
            <input
              type="month"
              value={from}
              onChange={(e) => applyRange(e.target.value, to)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</span>
            <input
              type="month"
              value={to}
              onChange={(e) => applyRange(from, e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Search</span>
            <div className="relative">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email"
                className={`${inputCls} w-full pl-9`}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Band</span>
            <select
              value={bandFilter}
              onChange={(e) => setBandFilter(e.target.value)}
              className={inputCls}
            >
              <option value="all">All</option>
              <option value="over">Over</option>
              <option value="high">High</option>
              <option value="ok">OK</option>
              <option value="free">Free</option>
            </select>
          </label>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
          >
            <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Up to {MAX_MONTHS} months. Band filter applies to the summary month selected below.
          {data.calendar && (
            <>
              {' '}Calendar: {fmtHours(data.calendar.hoursPerDay)}h/day
              {data.calendar.workingSaturdays ? ', Saturdays working' : ''}.
            </>
          )}
        </p>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={load}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-red-200 text-red-700 hover:bg-red-100 transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary strip */}
      {!error && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Summary for</span>
            <select
              value={summaryMonth}
              onChange={(e) => setSummaryMonth(e.target.value)}
              className={inputCls}
              disabled={months.length === 0}
            >
              {months.length === 0 && <option value={summaryMonth}>{monthLabel(summaryMonth)}</option>}
              {months.map((m) => (
                <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {loading ? (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 animate-pulse">
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                  <div className="h-7 bg-gray-100 rounded w-1/3 mt-2" />
                </div>
              ))
            ) : (
              <>
                <StatTile
                  label="Avg utilisation"
                  value={`${fmtPct(summary?.avgPct)}%`}
                  hint={`${summary?.userCount ?? 0} people`}
                />
                <StatTile label="Over-allocated" value={summary?.overCount ?? 0} accent="text-red-600" hint="≥100% or any day over" />
                <StatTile label="High 80–99%" value={summary?.highCount ?? 0} accent="text-amber-600" />
                <StatTile label="Free <50%" value={summary?.freeCount ?? 0} accent="text-gray-500" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Heat map */}
      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className={`${thCls} text-left sticky left-0 bg-gray-50 z-10 min-w-[220px]`}>Person</th>
                  {loading && months.length === 0
                    ? [0, 1, 2, 3, 4, 5].map((i) => (
                        <th key={i} className="px-4 py-3 border-l border-gray-100">
                          <div className="h-3 bg-gray-100 rounded w-16 mx-auto animate-pulse" />
                        </th>
                      ))
                    : months.map((m) => (
                        <th key={m.month} className="px-3 py-2 text-center border-l border-gray-100 whitespace-nowrap">
                          <span className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            {monthLabel(m.month)}
                          </span>
                          <span className="block text-[11px] font-normal text-gray-400 normal-case tabular-nums">
                            {m.workingDays}d · {fmtHours(m.totalHours)}h
                          </span>
                        </th>
                      ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  [0, 1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3 sticky left-0 bg-white z-10">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100" />
                          <div className="space-y-1.5">
                            <div className="h-3 bg-gray-100 rounded w-28" />
                            <div className="h-2.5 bg-gray-100 rounded w-16" />
                          </div>
                        </div>
                      </td>
                      {Array.from({ length: Math.max(colCount, 6) }).map((_, j) => (
                        <td key={j} className="p-1 border-l border-gray-100">
                          <div className="h-12 rounded-lg bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={colCount + 1} className="px-4 py-12 text-center text-sm text-gray-500">
                      No users
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount + 1} className="px-4 py-12 text-center text-sm text-gray-500">
                      No people match
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => {
                    const uid = getId(u);
                    const cellByMonth = new Map((u.cells || []).map((c) => [c.month, c]));
                    return (
                      <tr key={uid} className="group hover:bg-gray-50">
                        <td className="px-4 py-2 sticky left-0 bg-white group-hover:bg-gray-50 z-10">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                              {initialOf(u.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {u.designation || u.role || ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        {months.map((m) => (
                          <HeatCell
                            key={m.month}
                            cell={cellByMonth.get(m.month)}
                            onOpen={() => openDrill(u, m.month)}
                          />
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-t border-gray-200 text-xs text-gray-600">
            {['free', 'ok', 'high', 'over'].map((b) => (
              <span key={b} className="inline-flex items-center gap-1.5">
                <span className={`inline-block w-3.5 h-3.5 rounded border border-gray-200 ${BAND_CELL[b].split(' ')[0]}`} />
                {BAND_LABEL[b]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              Red dot: under 100% overall but over capacity on at least one day
            </span>
          </div>
        </div>
      )}

      {drill && <DrillDown target={drill} onClose={closeDrill} />}
    </div>
  );
}
