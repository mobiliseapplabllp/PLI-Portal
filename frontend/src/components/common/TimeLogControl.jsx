/**
 * TimeLogControl — the ONE shared "actual hours" widget for any record
 * (helpdesk ticket, PM milestone / sub-milestone).
 *
 * Header : Estimated Xh · Logged Yh · Z%   (Estimated / % hidden when no estimate)
 * Body   : log form (date ≤ today, 0.25–24h in 0.25 steps, note) + entries list
 *          with inline edit / delete for the caller's own entries (admin: any).
 *
 * Estimate resolution:
 *   1. `estimatedHours` prop (explicit override)
 *   2. allocation.mode === 'total'   → allocation.totalHours
 *   3. allocation.hoursPerDay × working days from the WORKING CALENDAR
 *      (GET /pm/config/calendar/working-days?from&to) — weekends/holidays are
 *      decided by the server, never counted here.
 *
 * API: /time-entries (frontend/src/api/timeEntries.api.js). 4xx bodies from that
 * controller are flat `{ message }`; others may be `{ error: { message } }` — both read.
 *
 * Props
 *   entityType      'ticket' | 'milestone'
 *   entityId        ticket id / milestone UUID
 *   allocation?     { mode: 'per_day'|'total', totalHours, hoursPerDay, from, to }
 *   estimatedHours? number — overrides allocation
 *   compact?        bool — dense inline layout (board rows/cards)
 *   onTotalsChange? (loggedHours:number) => void — after every (re)load
 *   readOnly?       bool — hide log form and edit/delete
 *   onClose?        () => void — shows a close (X) button when given
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import {
  listTimeEntriesApi,
  createTimeEntryApi,
  updateTimeEntryApi,
  deleteTimeEntryApi,
} from '../../api/timeEntries.api';
import { HiOutlineClock, HiOutlinePencil, HiOutlineTrash, HiOutlineX } from 'react-icons/hi';

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today as YYYY-MM-DD in LOCAL time (never toISOString for date-only values). */
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Normalise a date-ish value to YYYY-MM-DD without timezone shifts. */
const toDateOnly = (v) => {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (v) => {
  const s = toDateOnly(v);
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtHours = (n) => {
  const v = round2(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
};
const posNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const errMsg = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || fallback;

/** Client-side mirror of the controller rules; returns an error string or ''. */
const validate = ({ date, hours }) => {
  const h = Number(hours);
  if (!date) return 'Pick a date';
  if (date > todayIso()) return 'Date cannot be in the future';
  if (hours === '' || !Number.isFinite(h) || h < 0.25 || h > 24) return 'Hours must be between 0.25 and 24';
  if (Math.abs(h * 4 - Math.round(h * 4)) > 1e-9) return 'Hours must be in 0.25 steps';
  return '';
};

const rid = (e) => e?._id ?? e?.id;
const ADMIN_ROLES = ['admin'];

// ── Component ────────────────────────────────────────────────────────────────
export default function TimeLogControl({
  entityType,
  entityId,
  allocation,
  estimatedHours,
  compact = false,
  onTotalsChange,
  readOnly = false,
  onClose,
}) {
  const user = useSelector((s) => s.auth?.user);
  const myId = String(user?._id ?? user?.id ?? '');
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const [entries, setEntries]     = useState(null);   // null = loading
  const [loadError, setLoadError] = useState('');
  const [form, setForm]           = useState(() => ({ date: todayIso(), hours: '1', note: '' }));
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState(null);
  const [editForm, setEditForm]   = useState({ date: '', hours: '', note: '' });
  const [rowError, setRowError]   = useState({ id: null, message: '' });
  const [busyId, setBusyId]       = useState(null);
  const [showAll, setShowAll]     = useState(false);

  // Keep the latest callback without making it a load dependency (parents pass inline fns).
  const totalsCbRef = useRef(onTotalsChange);
  useEffect(() => { totalsCbRef.current = onTotalsChange; }, [onTotalsChange]);

  // ── Load entries ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!entityType || entityId === undefined || entityId === null || entityId === '') return;
    try {
      const res = await listTimeEntriesApi(entityType, String(entityId));
      const data = res.data?.data ?? res.data ?? [];
      const list = Array.isArray(data) ? data : (Array.isArray(data?.entries) ? data.entries : []);
      setEntries(list);
      setLoadError('');
      totalsCbRef.current?.(round2(list.reduce((a, e) => a + (Number(e.hours) || 0), 0)));
    } catch (err) {
      setEntries((prev) => prev ?? []);
      setLoadError(errMsg(err, 'Failed to load time entries'));
    }
  }, [entityType, entityId]);

  useEffect(() => { setEntries(null); load(); }, [load]);

  // ── Estimate ──────────────────────────────────────────────────────────────
  const override   = posNum(estimatedHours);
  const mode       = allocation?.mode;
  const allocTotal = posNum(allocation?.totalHours);
  const hpd        = posNum(allocation?.hoursPerDay);
  const from       = toDateOnly(allocation?.from);
  const to         = toDateOnly(allocation?.to);
  const useTotal   = override == null && allocTotal != null && (mode === 'total' || mode == null);
  const needCalendar = override == null && !useTotal && mode !== 'total' && hpd != null && !!from && !!to && from <= to;

  const [workingDays, setWorkingDays] = useState(null);
  const [calError, setCalError]       = useState('');
  useEffect(() => {
    if (!needCalendar) { setWorkingDays(null); setCalError(''); return undefined; }
    let alive = true;
    api.get('/pm/config/calendar/working-days', { params: { from, to } })
      .then((res) => {
        if (!alive) return;
        const d = res.data?.data ?? res.data ?? {};
        const n = Number(d.workingDays);
        setWorkingDays(Number.isFinite(n) ? n : null);
        setCalError('');
      })
      .catch((err) => {
        if (!alive) return;
        setWorkingDays(null);
        setCalError(errMsg(err, 'Could not load the working calendar'));
      });
    return () => { alive = false; };
  }, [needCalendar, from, to]);

  const estimated = override != null
    ? round2(override)
    : useTotal
      ? round2(allocTotal)
      : needCalendar && workingDays
        ? round2(hpd * workingDays)
        : null;

  const logged = round2((entries || []).reduce((a, e) => a + (Number(e.hours) || 0), 0));
  const pct    = estimated ? Math.round((logged / estimated) * 100) : null;
  const pctCls = pct == null ? 'text-gray-400' : pct > 100 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-emerald-700';
  const barCls = pct > 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  // ── Mutations ─────────────────────────────────────────────────────────────
  const canTouch = (e) =>
    !readOnly && (isAdmin || (myId && (String(e.userId) === myId || String(e.createdById) === myId)));

  const handleLog = async (ev) => {
    ev?.preventDefault?.();
    const v = validate(form);
    if (v) { setFormError(v); return; }
    setFormError('');
    setSaving(true);
    try {
      const hours = Number(form.hours);
      await createTimeEntryApi({
        entityType,
        entityId: String(entityId),
        date: form.date,
        hours,
        note: form.note.trim() || null,
      });
      toast.success(`${fmtHours(hours)}h logged`);
      setForm((f) => ({ ...f, hours: '1', note: '' }));
      await load();
    } catch (err) {
      setFormError(errMsg(err, 'Failed to log time'));
    } finally { setSaving(false); }
  };

  const startEdit = (e) => {
    setEditId(rid(e));
    setEditForm({ date: toDateOnly(e.date) || '', hours: String(e.hours ?? ''), note: e.note || '' });
    setRowError({ id: null, message: '' });
  };

  const saveEdit = async (e) => {
    const id = rid(e);
    const v = validate(editForm);
    if (v) { setRowError({ id, message: v }); return; }
    setBusyId(id);
    try {
      await updateTimeEntryApi(id, {
        date: editForm.date,
        hours: Number(editForm.hours),
        note: editForm.note.trim() || null,
      });
      toast.success('Entry updated');
      setEditId(null);
      setRowError({ id: null, message: '' });
      await load();
    } catch (err) {
      setRowError({ id, message: errMsg(err, 'Failed to update entry') });
    } finally { setBusyId(null); }
  };

  const handleDelete = async (e) => {
    const id = rid(e);
    if (!window.confirm('Delete this time entry?')) return;
    setBusyId(id);
    try {
      await deleteTimeEntryApi(id);
      toast.success('Entry deleted');
      if (editId === id) setEditId(null);
      setRowError({ id: null, message: '' });
      await load();
    } catch (err) {
      setRowError({ id, message: errMsg(err, 'Failed to delete entry') });
    } finally { setBusyId(null); }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const field = compact
    ? 'text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400'
    : 'text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  const primaryBtn = compact
    ? 'px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors'
    : 'px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors';
  const txt = compact ? 'text-[11px]' : 'text-sm';

  const sorted = [...(entries || [])].sort((a, b) =>
    String(toDateOnly(b.date) || '').localeCompare(String(toDateOnly(a.date) || '')) ||
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const RECENT = 5;
  const visible = compact && !showAll ? sorted.slice(0, RECENT) : sorted;

  // ── Pieces ────────────────────────────────────────────────────────────────
  const header = (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? 'text-[11px]' : 'rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm gap-x-3'}`}>
      <span className={`inline-flex items-center gap-1 ${compact ? 'text-[10px] uppercase tracking-wider text-gray-400 font-semibold' : 'text-gray-500'}`}>
        <HiOutlineClock className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {compact && 'Time'}
      </span>
      {estimated != null && (
        <>
          <span className="text-gray-600">Estimated <span className="font-semibold text-gray-800">{fmtHours(estimated)}h</span></span>
          <span className="text-gray-300">·</span>
        </>
      )}
      <span className="text-gray-600">Logged <span className="font-semibold text-gray-800">{entries == null ? '…' : `${fmtHours(logged)}h`}</span></span>
      {pct != null && entries != null && (
        <>
          <span className="text-gray-300">·</span>
          <span className={`font-semibold ${pctCls}`}>{pct}%</span>
        </>
      )}
      {calError && <span className="text-amber-600" title={calError}>(estimate unavailable: {calError})</span>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Close"
        >
          <HiOutlineX className="w-3.5 h-3.5" />
        </button>
      )}
      {!compact && estimated != null && pct != null && (
        <div className="basis-full h-1.5 rounded-full bg-gray-200 overflow-hidden mt-1">
          <div className={`h-full rounded-full ${barCls}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
    </div>
  );

  const today = todayIso();
  const logForm = readOnly ? null : (
    <form
      onSubmit={handleLog}
      className={compact ? 'space-y-1' : 'border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50 space-y-2'}
    >
      {!compact && <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Log time</p>}
      <div className={`flex flex-wrap items-end ${compact ? 'gap-1.5' : 'gap-3'}`}>
        <div>
          {!compact && <label className="text-xs text-gray-500 block mb-1">Date</label>}
          <input
            type="date"
            value={form.date}
            max={today}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={`${field} ${compact ? 'w-32' : ''}`}
            title="Date (today or earlier)"
          />
        </div>
        <div className="flex items-center gap-1">
          <div>
            {!compact && <label className="text-xs text-gray-500 block mb-1">Hours</label>}
            <input
              type="number"
              min="0.25" max="24" step="0.25"
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
              className={`${field} ${compact ? 'w-16' : 'w-24'} text-center`}
              title="Hours (0.25 steps)"
            />
          </div>
          {compact && <span className="text-xs text-gray-400">h</span>}
        </div>
        <div className={compact ? '' : 'flex-1 min-w-[160px]'}>
          {!compact && <label className="text-xs text-gray-500 block mb-1">Note</label>}
          <input
            type="text"
            value={form.note}
            maxLength={500}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder={compact ? 'Note (optional)' : 'What did you work on? (optional)'}
            className={`${field} ${compact ? 'w-44' : 'w-full'}`}
          />
        </div>
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving ? 'Saving…' : compact ? 'Log' : 'Log time'}
        </button>
      </div>
      {formError && <p className="text-xs text-red-600">{formError}</p>}
    </form>
  );

  const editRow = (e) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value={editForm.date}
        max={today}
        onChange={(ev) => setEditForm((f) => ({ ...f, date: ev.target.value }))}
        className={`${field} w-32`}
      />
      <input
        type="number"
        min="0.25" max="24" step="0.25"
        value={editForm.hours}
        onChange={(ev) => setEditForm((f) => ({ ...f, hours: ev.target.value }))}
        className={`${field} w-16 text-center`}
      />
      <input
        type="text"
        value={editForm.note}
        maxLength={500}
        onChange={(ev) => setEditForm((f) => ({ ...f, note: ev.target.value }))}
        placeholder="Note"
        className={`${field} flex-1 min-w-[120px]`}
      />
      <button
        type="button"
        onClick={() => saveEdit(e)}
        disabled={busyId === rid(e)}
        className="px-2 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
      >
        {busyId === rid(e) ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => { setEditId(null); setRowError({ id: null, message: '' }); }}
        className="px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
      >
        Cancel
      </button>
    </div>
  );

  const actions = (e) => canTouch(e) && (
    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
      <button
        type="button"
        onClick={() => startEdit(e)}
        disabled={busyId === rid(e)}
        className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-colors"
        title="Edit entry"
      >
        <HiOutlinePencil className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
      <button
        type="button"
        onClick={() => handleDelete(e)}
        disabled={busyId === rid(e)}
        className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
        title="Delete entry"
      >
        <HiOutlineTrash className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </button>
    </span>
  );

  let list;
  if (entries == null) {
    list = <p className={`${txt} text-gray-400 ${compact ? '' : 'text-center py-6'}`}>Loading time entries…</p>;
  } else if (sorted.length === 0) {
    list = <p className={`${txt} text-gray-400 ${compact ? '' : 'text-center py-6'}`}>No time logged yet.</p>;
  } else if (compact) {
    list = (
      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md bg-white">
        {visible.map((e) => {
          const id = rid(e);
          return (
            <li key={id} className="px-2 py-1 text-[11px]">
              {editId === id ? editRow(e) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-20 flex-shrink-0">{fmtDate(e.date)}</span>
                  <span className="font-semibold text-gray-700 w-10 flex-shrink-0">{fmtHours(e.hours)}h</span>
                  <span className="text-gray-500 truncate">{e.userName || e.user?.name || '—'}</span>
                  {e.note && <span className="text-gray-400 truncate">· {e.note}</span>}
                  <span className="ml-auto">{actions(e)}</span>
                </div>
              )}
              {rowError.id === id && rowError.message && <p className="text-red-600 mt-0.5">{rowError.message}</p>}
            </li>
          );
        })}
        {sorted.length > RECENT && (
          <li className="px-2 py-1 text-[11px]">
            <button type="button" onClick={() => setShowAll((s) => !s)} className="text-emerald-700 hover:underline">
              {showAll ? 'Show recent only' : `Show all ${sorted.length} entries`}
            </button>
          </li>
        )}
      </ul>
    );
  } else {
    list = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">User</th>
              <th className="py-2 pr-3 font-semibold text-right">Hours</th>
              <th className="py-2 pr-3 font-semibold">Note</th>
              <th className="py-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => {
              const id = rid(e);
              return (
                <tr key={id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                  {editId === id ? (
                    <td colSpan={5} className="py-2">
                      {editRow(e)}
                      {rowError.id === id && rowError.message && <p className="text-xs text-red-600 mt-1">{rowError.message}</p>}
                    </td>
                  ) : (
                    <>
                      <td className="py-2 pr-3 text-gray-700 whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td className="py-2 pr-3 text-gray-700">{e.userName || e.user?.name || '—'}</td>
                      <td className="py-2 pr-3 text-right font-medium text-gray-800 whitespace-nowrap">{fmtHours(e.hours)}h</td>
                      <td className="py-2 pr-3 text-gray-500">
                        {e.note || <span className="text-gray-300">—</span>}
                        {rowError.id === id && rowError.message && <p className="text-xs text-red-600 mt-1">{rowError.message}</p>}
                      </td>
                      <td className="py-2 text-right">{actions(e)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {header}
      {logForm}
      {loadError && (
        <p className={`${txt} text-red-600`}>
          {loadError}{' '}
          <button type="button" onClick={load} className="underline hover:no-underline">Retry</button>
        </p>
      )}
      {list}
    </div>
  );
}
