/**
 * AllocationGrid — person × month grid of a project's allocation segments.
 *
 * Props
 *   projectId     string
 *   project       { startDate, endDate } — default range
 *   capacity      working hours per day (default 8) — fallback when the API omits it
 *   canManage     bool — enables click-to-edit
 *   onOpenMember  (memberRow, month) => void — host opens the AllocationDrawer
 *
 * Data: GET  /pm/projects/:id/allocation-grid?from&to
 *         → { months:[{ key:'YYYY-MM', label, workingDays, capacityHours }],
 *             rows:[{ memberId, userId, name, role, cells:[{ month, hoursPerDay|null,
 *                     segmentId|null, mixed, exceptionStatus, conflict, peakHours }] }] }
 *       POST /pm/projects/:id/allocation-grid { changes:[{ memberId, month, hoursPerDay|null }] }
 *         → { applied, errors:[{ memberId, month, message, conflict? }] }
 *
 * Keyboard: Tab moves between cells; Enter / F2 starts editing; in the input
 * Enter saves, Esc cancels, Tab saves and moves on.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineRefresh } from 'react-icons/hi';
import { getAllocationGridApi, applyAllocationGridApi } from '../../api/pm/allocation.api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const ym = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const addMonths = (yyyymm, n) => {
  const [y, m] = yyyymm.split('-').map(Number);
  return ym(new Date(y, m - 1 + n, 1));
};
const firstDay = (yyyymm) => `${yyyymm}-01`;
const lastDay = (yyyymm) => {
  const [y, m] = yyyymm.split('-').map(Number);
  return `${yyyymm}-${pad2(new Date(y, m, 0).getDate())}`;
};
const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : null);
const fmtH = (h) => String(Math.round((Number(h) || 0) * 10) / 10);
const errMsg = (err, fallback) =>
  err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || fallback;

const defaultRange = (project) => {
  const start = monthOf(project?.startDate);
  const end = monthOf(project?.endDate);
  const now = ym(new Date());
  if (start && end && start <= end) return { from: start, to: end };
  const from = start || now;
  return { from, to: end && end >= from ? end : addMonths(from, 5) };
};

/** free (no load) / ok (≤ capacity) / over (> capacity) — from the busiest day in the month */
const bandOf = (peak, capacity) => {
  const p = Number(peak) || 0;
  if (p <= 0) return 'free';
  return p > capacity + 1e-9 ? 'over' : 'ok';
};
const BAND_CLS = {
  free: 'bg-white text-gray-400',
  ok:   'bg-emerald-50 text-emerald-800',
  over: 'bg-red-50 text-red-700',
};
const BAND_LEGEND = [
  { key: 'free', label: 'Free', swatch: 'bg-white border-gray-300' },
  { key: 'ok',   label: '≤ capacity', swatch: 'bg-emerald-50 border-emerald-200' },
  { key: 'over', label: 'Over capacity', swatch: 'bg-red-50 border-red-200' },
];

// ── Cell ──────────────────────────────────────────────────────────────────────
function Cell({ row, cell, capacity, canManage, editing, onStartEdit, onCommit, onCancel, error, onOpenMember }) {
  const inputRef = useRef(null);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setVal(cell.hoursPerDay != null ? String(cell.hoursPerDay) : '');
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const band = bandOf(cell.peakHours, capacity);
  const hasHours = cell.hoursPerDay != null && Number(cell.hoursPerDay) > 0;
  const text = cell.mixed ? 'mixed' : hasHours ? fmtH(cell.hoursPerDay) : '';
  const title = [
    `${row.name} · ${cell.month}`,
    cell.mixed ? 'Several periods in this month' : hasHours ? `${fmtH(cell.hoursPerDay)} h/day on this project` : 'No hours on this project',
    cell.peakHours != null ? `Busiest day (all work): ${fmtH(cell.peakHours)}h / ${fmtH(capacity)}h` : null,
    cell.conflict ? 'Over capacity on at least one day' : null,
    cell.exceptionStatus === 'pending' ? 'Exception pending' : cell.exceptionStatus === 'approved' ? 'Exception approved' : null,
  ].filter(Boolean).join('\n');

  const commit = async () => {
    if (saving) return;
    const next = val === '' ? null : Number(val);
    if (next != null && (!Number.isFinite(next) || next < 0)) { toast.error('Enter a valid number of hours'); return; }
    const same = (next == null && cell.hoursPerDay == null) || (next != null && cell.hoursPerDay != null && Number(cell.hoursPerDay) === next && !cell.mixed);
    if (same) { onCancel(); return; }
    setSaving(true);
    try { await onCommit(next); }
    finally { setSaving(false); }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    else if (e.key === 'Tab') { commit(); /* let focus move on */ }
  };

  const onCellKeyDown = (e) => {
    if (!canManage) return;
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); onStartEdit(); }
  };

  return (
    <td className={`relative border-b border-r border-gray-100 p-0 align-top ${BAND_CLS[band]}`}>
      {editing ? (
        <div className="p-1">
          <input
            ref={inputRef}
            type="number"
            min="0"
            max={capacity}
            step="0.5"
            value={val}
            disabled={saving}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={`${row.name} hours per day for ${cell.month}`}
            className="w-full min-w-[64px] border border-blue-400 rounded px-1.5 py-1 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      ) : (
        <div
          role={canManage ? 'button' : undefined}
          tabIndex={0}
          title={title}
          onClick={canManage ? onStartEdit : undefined}
          onKeyDown={onCellKeyDown}
          className={`min-h-[40px] px-2 py-1.5 flex items-center justify-between gap-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400 ${canManage ? 'cursor-pointer hover:brightness-95' : ''}`}
        >
          <span className={cell.mixed ? 'italic text-xs' : 'font-medium'}>{text}</span>
          <span className="flex items-center gap-1 shrink-0">
            {cell.exceptionStatus === 'pending' && (
              <span className="text-[9px] px-1 rounded-full border bg-amber-100 text-amber-800 border-amber-200" title="Exception pending">⏳</span>
            )}
            {cell.exceptionStatus === 'approved' && (
              <span className="text-[9px] px-1 rounded-full border bg-purple-100 text-purple-800 border-purple-200" title="Exception approved">✔</span>
            )}
            {cell.conflict && <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Over capacity" aria-label="Over capacity" />}
          </span>
        </div>
      )}
      {error && (
        <div className="px-2 pb-1.5 text-[11px] text-red-700 bg-red-50 border-t border-red-200" role="alert">
          <p className="pt-1 leading-snug">{error.message}</p>
          {error.conflict?.peak != null && (
            <p className="text-red-600">peak {fmtH(error.conflict.peak)}h / {fmtH(error.conflict.capacity ?? capacity)}h</p>
          )}
          <button type="button" onClick={() => onOpenMember?.(row, cell.month)} className="underline font-medium mt-0.5">
            Open period…
          </button>
        </div>
      )}
    </td>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AllocationGrid({ projectId, project, capacity = 8, canManage = false, onOpenMember }) {
  const [range, setRange] = useState(() => defaultRange(project));
  const [data, setData] = useState(null);      // { months, rows }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { memberId, month }
  const [cellErrors, setCellErrors] = useState({}); // `${memberId}|${month}` → { message, conflict }

  const cap = Number(capacity) > 0 ? Number(capacity) : 8;
  const rangeValid = !!range.from && !!range.to && range.from <= range.to;

  const load = useCallback(async () => {
    if (!projectId || !rangeValid) return;
    setLoading(true); setError(null);
    try {
      const res = await getAllocationGridApi(projectId, { from: firstDay(range.from), to: lastDay(range.to) });
      const d = res.data?.data ?? res.data ?? {};
      setData({ months: Array.isArray(d.months) ? d.months : [], rows: Array.isArray(d.rows) ? d.rows : [] });
    } catch (err) {
      setError(errMsg(err, 'Could not load the allocation grid'));
    } finally {
      setLoading(false);
    }
  }, [projectId, range.from, range.to, rangeValid]);

  useEffect(() => { load(); }, [load]);

  const keyOf = (memberId, month) => `${memberId}|${month}`;

  const commitCell = async (row, cell, hoursPerDay) => {
    const key = keyOf(row.memberId, cell.month);
    setCellErrors((m) => { const n = { ...m }; delete n[key]; return n; });
    try {
      const res = await applyAllocationGridApi(projectId, { changes: [{ memberId: row.memberId, month: cell.month, hoursPerDay }] });
      const d = res.data?.data ?? res.data ?? {};
      const errs = Array.isArray(d.errors) ? d.errors : [];
      if (errs.length) {
        const e = errs[0];
        setCellErrors((m) => ({ ...m, [key]: { message: e.message || 'Could not apply change', conflict: e.conflict || null } }));
      } else {
        toast.success(hoursPerDay == null ? `Cleared ${row.name} for ${cell.month}` : `${row.name}: ${fmtH(hoursPerDay)} h/day in ${cell.month}`);
        setEditing(null);
      }
      await load();
    } catch (err) {
      const body = err?.response?.data;
      const conflict = err?.response?.status === 409 ? body?.conflict || null : null;
      setCellErrors((m) => ({ ...m, [key]: { message: errMsg(err, 'Could not apply change'), conflict } }));
    }
  };

  const months = data?.months || [];
  const rows = data?.rows || [];
  const capacityOf = (monthObj) => {
    // API capacityHours is the month total; per-day capacity = total / workingDays when both exist.
    const wd = Number(monthObj?.workingDays);
    const ch = Number(monthObj?.capacityHours);
    return wd > 0 && ch > 0 ? Math.round((ch / wd) * 10) / 10 : cap;
  };
  const monthCap = useMemo(() => Object.fromEntries(months.map((m) => [m.key, capacityOf(m)])), [months, cap]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCls = 'border border-gray-300 rounded px-2 py-1 text-sm';

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          From
          <input type="month" className={`${inputCls} block`} value={range.from} max={range.to || undefined}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input type="month" className={`${inputCls} block`} value={range.to} min={range.from || undefined}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
        <button type="button" onClick={() => setRange(defaultRange(project))}
          className="px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50">
          Project dates
        </button>
        <button type="button" onClick={load} disabled={loading || !rangeValid}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <HiOutlineRefresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        {/* Legend */}
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
          {BAND_LEGEND.map((b) => (
            <span key={b.key} className="inline-flex items-center gap-1">
              <span className={`inline-block w-3 h-3 rounded border ${b.swatch}`} /> {b.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> conflict</span>
          <span className="inline-flex items-center gap-1"><span className="text-[9px] px-1 rounded-full border bg-amber-100 text-amber-800 border-amber-200">⏳</span> pending</span>
          <span className="inline-flex items-center gap-1"><span className="text-[9px] px-1 rounded-full border bg-purple-100 text-purple-800 border-purple-200">✔</span> exception</span>
          <span className="italic">mixed</span> = several periods
        </div>
      </div>

      {!rangeValid && <p className="text-xs text-amber-600">Pick a valid month range (From ≤ To).</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={load} className="underline">Retry</button>
        </div>
      )}
      {loading && !data && (
        <div className="space-y-2" aria-busy="true">
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 bg-gray-100 rounded animate-pulse" />
        </div>
      )}
      {data && rows.length === 0 && !error && (
        <div className="border border-dashed border-gray-300 rounded-lg px-3 py-6 text-center text-sm text-gray-400">
          No team members on this project yet.
        </div>
      )}

      {data && rows.length > 0 && (
        <div className={`overflow-x-auto border border-gray-200 rounded-lg ${loading ? 'opacity-60' : ''}`}>
          <table className="min-w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 text-left px-3 py-2 border-b border-r border-gray-200 font-semibold text-gray-700 min-w-[180px]">
                  Member
                </th>
                {months.map((m) => (
                  <th key={m.key} className="px-2 py-2 border-b border-r border-gray-100 text-center font-medium text-gray-700 min-w-[84px]">
                    <div>{m.label || m.key}</div>
                    <div className="text-[10px] font-normal text-gray-400">
                      {m.workingDays != null ? `${m.workingDays} wd` : ''}{m.capacityHours != null ? ` · ${fmtH(m.capacityHours)}h` : ''}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const byMonth = Object.fromEntries((row.cells || []).map((c) => [c.month, c]));
                return (
                  <tr key={row.memberId}>
                    <th scope="row" className="sticky left-0 z-10 bg-white text-left px-3 py-1.5 border-b border-r border-gray-200 font-normal">
                      <button
                        type="button"
                        onClick={() => onOpenMember?.(row, null)}
                        className="text-left w-full hover:text-emerald-700"
                        title="Open allocation"
                      >
                        <div className="font-medium text-gray-900 truncate">{row.name}</div>
                        <div className="text-[11px] text-gray-500 truncate">{row.role || '—'}</div>
                      </button>
                    </th>
                    {months.map((m) => {
                      const cell = byMonth[m.key] || { month: m.key, hoursPerDay: null, segmentId: null, mixed: false, exceptionStatus: 'none', conflict: false, peakHours: 0 };
                      const key = keyOf(row.memberId, m.key);
                      const isEditing = editing?.memberId === row.memberId && editing?.month === m.key;
                      return (
                        <Cell
                          key={key}
                          row={row}
                          cell={cell}
                          capacity={monthCap[m.key] ?? cap}
                          canManage={canManage && cell.exceptionStatus !== 'pending'}
                          editing={isEditing}
                          onStartEdit={() => { setEditing({ memberId: row.memberId, month: m.key }); }}
                          onCommit={(h) => commitCell(row, cell, h)}
                          onCancel={() => setEditing(null)}
                          error={cellErrors[key] || null}
                          onOpenMember={(r, month) => { setCellErrors((e) => { const n = { ...e }; delete n[key]; return n; }); onOpenMember?.(r, month); }}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canManage && data && rows.length > 0 && (
        <p className="text-[11px] text-gray-400">
          Click a cell (or press Enter on it) to set hours/day for that month. Enter saves, Esc cancels. Leave empty to remove the month's hours.
        </p>
      )}
    </div>
  );
}
