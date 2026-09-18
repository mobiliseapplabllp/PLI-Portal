/**
 * AllocationDrawer — right-side panel that manages ONE project member's
 * time-phased allocation (segments / "periods").
 *
 * Props
 *   open                bool
 *   onClose             () => void                       Esc / overlay / × close it
 *   projectId           string
 *   project             { name, startDate, endDate }
 *   member              { _id, userId, role, user:{ name, email, designation } }
 *   capacity            working hours per day (default 8)
 *   canManage           bool — hides every write action when false
 *   memberRoles         [{ name }] — role list for the header select
 *   onRoleChange        (role) => void — host persists the role (PUT member)
 *   onRequestException  (segment, conflict) => void — host opens ExceptionRequestModal
 *   onChanged           () => void — called after every successful write (host refetches)
 *
 * Endpoints (api/pm/allocation.api.js): listSegmentsApi, addSegmentApi,
 * updateSegmentApi, removeSegmentApi, confirmSegmentApi, releaseMemberApi,
 * getAllocationHistoryApi.  API ids arrive as `_id`; we read `x._id ?? x.id`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineX, HiOutlinePlus, HiOutlineTrash, HiOutlineCheck, HiOutlineClock, HiOutlineChevronDown, HiOutlineChevronRight } from 'react-icons/hi';
import {
  listSegmentsApi, addSegmentApi, updateSegmentApi, removeSegmentApi,
  confirmSegmentApi, releaseMemberApi, getAllocationHistoryApi,
} from '../../api/pm/allocation.api';
import AllocationTypeInput, { formatAllocation } from './AllocationTypeInput';
import ResourceAvailabilityCard from './ResourceAvailabilityCard';
import SearchSelect from '../common/SearchSelect';
import Modal from '../common/Modal';

// ── Date helpers (all YYYY-MM-DD strings, local time) ─────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoOf = (v) => (v ? String(v).slice(0, 10) : null);
const todayISO = () => toISO(new Date());
const addDaysISO = (iso, n) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toISO(dt);
};
const fmtRangeDate = (iso) => {
  if (!iso) return '?';
  try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso)); }
  catch { return String(iso).slice(0, 10); }
};
const fmtDateLong = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(iso).slice(0, 10); }
};
const fmtDateTime = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(iso); }
};
const fmtH = (h) => String(Math.round((Number(h) || 0) * 10) / 10);
const idOf = (x) => x?._id ?? x?.id ?? null;
const errMsg = (err, fallback) =>
  err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || fallback;

// ── Conflict panel (local replica of ProjectDetail's ConflictPanel) ───────────
const conflictSuggestions = (conflict) => {
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

/** onApply(patch) receives { allocationMode, hoursPerDay, allocationTotalHours } | { fromDate } | { toDate } */
function SuggestionButtons({ suggestions, onApply, onRequestException, canRequestException = true }) {
  const { reduceTo, nextFreeDate, shortenTo } = suggestions || {};
  const btn = 'px-2.5 py-1 bg-white border border-red-300 text-red-700 rounded text-xs font-medium hover:bg-red-100 transition-colors';
  const hasAny = reduceTo != null || nextFreeDate || shortenTo || (onRequestException && canRequestException);
  if (!hasAny) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {reduceTo != null && onApply && (
        <button type="button" className={btn} onClick={() => onApply({ allocationMode: 'per_day', hoursPerDay: reduceTo, allocationTotalHours: null })}>
          Use {fmtH(reduceTo)} hrs/day
        </button>
      )}
      {nextFreeDate && onApply && (
        <button type="button" className={btn} onClick={() => onApply({ fromDate: nextFreeDate })}>
          Start on {fmtRangeDate(nextFreeDate)}
        </button>
      )}
      {shortenTo && onApply && (
        <button type="button" className={btn} onClick={() => onApply({ toDate: shortenTo })}>
          End on {fmtRangeDate(shortenTo)}
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
  );
}

function ConflictPanel({ conflict, capacity, onApply, onRequestException }) {
  if (!conflict) return null;
  const cap = Number(conflict.capacity) > 0 ? Number(conflict.capacity) : capacity;
  const ranges = Array.isArray(conflict.ranges) ? conflict.ranges : [];
  const sugg = conflictSuggestions(conflict);
  const overDays = conflict.overDays ?? ranges.reduce((s, r) => s + (r.days || 0), 0);
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg text-red-700 px-2.5 py-2 mt-2 text-xs" role="alert">
      <p className="font-semibold">
        Over capacity on {overDays} day{overDays === 1 ? '' : 's'}
        {sugg.overloadHours != null && sugg.overloadHours > 0 && (
          <span className="font-normal text-red-600"> · peak {fmtH(conflict.peak)}h / {fmtH(cap)}h (+{fmtH(sugg.overloadHours)}h)</span>
        )}
      </p>
      {ranges.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-red-600">
          {ranges.map((r, i) => (
            <li key={i}>{fmtRangeDate(r.from)} – {fmtRangeDate(r.to)} · peak {fmtH(r.peak)}h / {fmtH(cap)}h</li>
          ))}
        </ul>
      )}
      <SuggestionButtons
        suggestions={sugg}
        onApply={onApply}
        onRequestException={onRequestException}
        canRequestException={conflict.canRequestException !== false}
      />
    </div>
  );
}

// ── Chips ─────────────────────────────────────────────────────────────────────
function Chip({ tone = 'gray', title, children }) {
  const cls = {
    gray:   'bg-gray-100 text-gray-600 border-gray-200',
    amber:  'bg-amber-100 text-amber-800 border-amber-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    green:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

function SegmentChips({ segment, conflict, today }) {
  const chips = [];
  const to = isoOf(segment.toDate);
  const from = isoOf(segment.fromDate);
  if (from && to && from <= today && today <= to) chips.push(<Chip key="active" tone="green" title="Active today">active</Chip>);
  else if (to && to < today) chips.push(<Chip key="past" tone="gray" title="Ended">ended</Chip>);
  else if (from && from > today) chips.push(<Chip key="upcoming" tone="gray" title="Starts later">upcoming</Chip>);
  if (segment.hoursConfirmed === false) chips.push(<Chip key="est" tone="amber" title="Hours pre-filled from a legacy % — not yet confirmed">estimated</Chip>);
  if (segment.exceptionStatus === 'pending') chips.push(<Chip key="pend" tone="amber" title="Awaiting approver decision — not counted against capacity">⏳ pending exception</Chip>);
  if (segment.exceptionStatus === 'approved') {
    const by = segment.exceptionApproval?.approvedBy?.name ?? segment.exceptionApproval?.approver?.name ?? null;
    chips.push(<Chip key="appr" tone="purple" title="Approved over-capacity allocation">✔ exception approved{by ? ` (by ${by})` : ''}</Chip>);
  }
  if (conflict) chips.push(<Chip key="conf" tone="red" title="Server rejected this period: over capacity">conflict</Chip>);
  return chips.length ? <div className="flex flex-wrap gap-1">{chips}</div> : null;
}

// ── Row edit form ─────────────────────────────────────────────────────────────
const toForm = (s) => ({
  fromDate: isoOf(s?.fromDate) || '',
  toDate:   isoOf(s?.toDate) || '',
  allocationMode: s?.allocationMode === 'total' ? 'total' : 'per_day',
  hoursPerDay: s?.hoursPerDay != null ? Number(s.hoursPerDay) : null,
  allocationTotalHours: s?.allocationTotalHours != null ? Number(s.allocationTotalHours) : null,
  note: s?.note || '',
});

const validateForm = (f) => {
  if (!f.fromDate || !f.toDate) return 'Both dates are required';
  if (f.fromDate > f.toDate) return 'End date must be on or after the start date';
  if (f.allocationMode === 'total') {
    if (!(Number(f.allocationTotalHours) > 0)) return 'Total hours must be greater than 0';
  } else if (!(Number(f.hoursPerDay) > 0)) return 'Hours per day must be greater than 0';
  return null;
};

function SegmentEditor({ form, onChange, capacity, disabled, error, conflict, onApplySuggestion, onRequestException, onSave, onCancel, saving, projectStart, projectEnd }) {
  const dateCls = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm';
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-600">
          From
          {/* No project-start floor: a period may begin before the project's planned
              start, and clamping it greys out the whole calendar on past-dated projects. */}
          <input type="date" className={dateCls} value={form.fromDate} disabled={disabled}
            onChange={(e) => onChange({ fromDate: e.target.value })} />
        </label>
        <label className="text-xs text-gray-600">
          To
          {/* Only the start date bounds this — never the project end (see above). */}
          <input type="date" className={dateCls} value={form.toDate} min={form.fromDate || undefined} disabled={disabled}
            onChange={(e) => onChange({ toDate: e.target.value })} />
        </label>
      </div>
      {(() => {
        const before = projectStart && form.fromDate && form.fromDate < projectStart;
        const after  = projectEnd   && form.toDate   && form.toDate   > projectEnd;
        if (!before && !after) return null;
        return (
          <p className="text-[11px] text-amber-600">
            {before && `Starts before the project's planned start (${fmtDateLong(projectStart)}). `}
            {after && `Runs past the project's planned end (${fmtDateLong(projectEnd)}).`}
          </p>
        );
      })()}
      <AllocationTypeInput
        compact
        value={form}
        onChange={(next) => onChange(next)}
        from={form.fromDate || null}
        to={form.toDate || null}
        capacity={capacity}
        disabled={disabled}
      />
      <input
        type="text"
        maxLength={255}
        placeholder="Note (optional)"
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
        value={form.note}
        disabled={disabled}
        onChange={(e) => onChange({ note: e.target.value })}
      />
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      <ConflictPanel conflict={conflict} capacity={capacity} onApply={onApplySuggestion} onRequestException={onRequestException} />
      <div className="flex items-center gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={saving || disabled}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}
          className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
const ACTION_LABEL = {
  add: 'Period added', update: 'Period updated', remove: 'Period removed', confirm: 'Hours confirmed',
  exception_request: 'Exception requested', exception_approve: 'Exception approved',
  exception_reject: 'Exception rejected', exception_cancel: 'Exception withdrawn', release: 'Hours released',
};
const summarise = (snap) => {
  if (!snap || typeof snap !== 'object') return null;
  const parts = [];
  if (snap.fromDate || snap.toDate) parts.push(`${fmtRangeDate(snap.fromDate)} – ${fmtRangeDate(snap.toDate)}`);
  const alloc = formatAllocation(snap);
  if (alloc) parts.push(alloc);
  return parts.join(' · ') || null;
};

function HistoryList({ projectId, memberId, reloadKey }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !memberId) return undefined;
    let alive = true;
    setLoading(true); setError(null);
    getAllocationHistoryApi(projectId, { memberId })
      .then((res) => { if (alive) setRows(res.data?.data ?? res.data ?? []); })
      .catch((err) => { if (alive) setError(errMsg(err, 'Could not load history')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId, memberId, reloadKey]);

  if (loading && !rows) return <p className="text-xs text-gray-400 py-2">Loading history…</p>;
  if (error) return <p className="text-xs text-red-600 py-2">{error}</p>;
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-400 py-2">No history yet.</p>;
  return (
    <ul className="divide-y divide-gray-100">
      {rows.map((h) => {
        const before = summarise(h.before);
        const after = summarise(h.after);
        return (
          <li key={idOf(h) || `${h.action}-${h.createdAt}`} className="py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-800">{ACTION_LABEL[h.action] || h.action}</span>
              <span className="text-gray-400 whitespace-nowrap">{fmtDateTime(h.createdAt)}{h.by?.name ? ` · ${h.by.name}` : ''}</span>
            </div>
            {(before || after) && (
              <p className="text-gray-500 mt-0.5">
                {before && <span className={after ? 'line-through text-gray-400' : ''}>{before}</span>}
                {before && after && <span className="mx-1">→</span>}
                {after && <span>{after}</span>}
              </p>
            )}
            {h.note && <p className="text-gray-500 italic mt-0.5">{h.note}</p>}
          </li>
        );
      })}
    </ul>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AllocationDrawer({
  open,
  onClose,
  projectId,
  project,
  member,
  capacity = 8,
  canManage = false,
  memberRoles = [],
  onRoleChange,
  onRequestException,
  onChanged,
  focusSegmentId,   // opened from "Resolve"/"Open period…" — highlight & scroll to that period
}) {
  const memberId = idOf(member);
  const userId = member?.userId ?? member?.user?._id ?? member?.user?.id ?? null;
  const today = todayISO();
  const projectStart = isoOf(project?.startDate);
  const projectEnd = isoOf(project?.endDate);
  const cap = Number(capacity) > 0 ? Number(capacity) : 8;

  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [edits, setEdits] = useState({});        // id → form   ('new' for the add row)
  const [rowErrors, setRowErrors] = useState({}); // id → message
  const [conflicts, setConflicts] = useState({}); // id → 409 conflict body
  const [saving, setSaving] = useState({});      // id → bool
  const [busy, setBusy] = useState(false);       // quick actions / remove / confirm
  const [confirmDlg, setConfirmDlg] = useState(null); // { title, body, action:() => Promise }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const sorted = useMemo(
    () => [...segments].sort((a, b) => String(isoOf(a.fromDate)).localeCompare(String(isoOf(b.fromDate)))),
    [segments],
  );
  // Scroll the requested period into view once it is loaded, and ring it briefly.
  const focusRef = useRef(null);
  useEffect(() => {
    if (!open || !focusSegmentId || !segments.length) return;
    const el = focusRef.current;
    if (el?.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [open, focusSegmentId, segments]);

  const lastSegment = sorted.length ? sorted[sorted.length - 1] : null;
  const activeSegment = sorted.find((s) => isoOf(s.fromDate) <= today && today <= isoOf(s.toDate)) || null;
  const hasFutureHours = sorted.some((s) => isoOf(s.toDate) >= today);

  const load = useCallback(async () => {
    if (!projectId || !memberId) return;
    setLoading(true); setLoadError(null);
    try {
      const res = await listSegmentsApi(projectId, memberId);
      const list = res.data?.data ?? res.data ?? [];
      setSegments(Array.isArray(list) ? list : []);
    } catch (err) {
      setLoadError(errMsg(err, 'Could not load allocation periods'));
    } finally {
      setLoading(false);
    }
  }, [projectId, memberId]);

  // Reset + load when the drawer opens for a member
  useEffect(() => {
    if (!open) return;
    setEdits({}); setRowErrors({}); setConflicts({}); setSaving({}); setConfirmDlg(null); setHistoryOpen(false);
    load();
  }, [open, load]);

  // Esc closes (confirm dialog first, then the drawer)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirmDlg) { setConfirmDlg(null); return; }
      onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, confirmDlg, onClose]);

  const afterWrite = useCallback(() => {
    load();
    setHistoryKey((k) => k + 1);
    onChanged?.();
  }, [load, onChanged]);

  // ── Row helpers ───────────────────────────────────────────────────────────
  const setEdit = (id, patch) => setEdits((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));
  const clearRowState = (id) => {
    setEdits((m) => { const n = { ...m }; delete n[id]; return n; });
    setRowErrors((m) => { const n = { ...m }; delete n[id]; return n; });
    setConflicts((m) => { const n = { ...m }; delete n[id]; return n; });
    setSaving((m) => { const n = { ...m }; delete n[id]; return n; });
  };
  const startEdit = (s) => { const id = idOf(s); setEdits((m) => ({ ...m, [id]: toForm(s) })); };

  const startAdd = () => {
    const from = lastSegment ? addDaysISO(isoOf(lastSegment.toDate), 1) : today;
    const fromClamped = from < today ? today : from;
    let to = projectEnd && projectEnd >= fromClamped ? projectEnd : addDaysISO(fromClamped, 30);
    if (to < fromClamped) to = fromClamped;
    setEdits((m) => ({ ...m, new: { fromDate: fromClamped, toDate: to, allocationMode: 'per_day', hoursPerDay: 4, allocationTotalHours: null, note: '' } }));
  };

  const bodyOf = (f) => ({
    fromDate: f.fromDate,
    toDate: f.toDate,
    allocationMode: f.allocationMode,
    hoursPerDay: f.allocationMode === 'per_day' ? Number(f.hoursPerDay) : (f.hoursPerDay != null ? Number(f.hoursPerDay) : null),
    allocationTotalHours: f.allocationMode === 'total' ? Number(f.allocationTotalHours) : null,
    note: f.note?.trim() || null,
  });

  const saveRow = async (id) => {
    const form = edits[id];
    if (!form) return;
    const v = validateForm(form);
    if (v) { setRowErrors((m) => ({ ...m, [id]: v })); return; }
    setSaving((m) => ({ ...m, [id]: true }));
    setRowErrors((m) => ({ ...m, [id]: null }));
    setConflicts((m) => ({ ...m, [id]: null }));
    try {
      if (id === 'new') await addSegmentApi(projectId, memberId, bodyOf(form));
      else await updateSegmentApi(projectId, memberId, id, bodyOf(form));
      toast.success(id === 'new' ? 'Period added' : 'Period updated');
      clearRowState(id);
      afterWrite();
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 409 && data?.conflict) {
        setConflicts((m) => ({ ...m, [id]: data.conflict }));
        setRowErrors((m) => ({ ...m, [id]: data.message || data.error?.message || 'Allocation exceeds capacity' }));
      } else {
        setRowErrors((m) => ({ ...m, [id]: errMsg(err, 'Could not save period') }));
      }
      setSaving((m) => ({ ...m, [id]: false }));
    }
  };

  const applySuggestion = (id, patch) => {
    setEdit(id, patch);
    setConflicts((m) => ({ ...m, [id]: null }));
    setRowErrors((m) => ({ ...m, [id]: null }));
  };

  const requestException = (id, segment) => {
    const conflict = conflicts[id] || null;
    const form = edits[id];
    // Pass the edited values (what the user tried to save) merged over the stored segment.
    const seg = { ...(segment || {}), ...(form ? bodyOf(form) : {}), _id: id === 'new' ? null : id, memberId, userId, projectId };
    onRequestException?.(seg, conflict);
  };

  const removeRow = (s) => {
    const id = idOf(s);
    setConfirmDlg({
      title: 'Remove period',
      body: `Remove ${fmtRangeDate(s.fromDate)} – ${fmtRangeDate(s.toDate)} (${formatAllocation(s, cap) || 'no hours'})? This cannot be undone.`,
      action: async () => {
        await removeSegmentApi(projectId, memberId, id);
        toast.success('Period removed');
      },
    });
  };

  const confirmRow = async (s) => {
    const id = idOf(s);
    setBusy(true);
    try {
      await confirmSegmentApi(projectId, memberId, id);
      toast.success('Hours confirmed');
      afterWrite();
    } catch (err) { toast.error(errMsg(err, 'Failed to confirm hours')); }
    finally { setBusy(false); }
  };

  // ── Quick actions ─────────────────────────────────────────────────────────
  const endToday = () => setConfirmDlg({
    title: 'End allocation today',
    body: `${member?.user?.name || 'This member'} keeps hours through ${fmtDateLong(today)}. Periods starting after today are removed. Continue?`,
    action: async () => {
      const res = await releaseMemberApi(projectId, memberId, { fromDate: addDaysISO(today, 1) });
      const d = res.data?.data ?? res.data ?? {};
      toast.success(`Ended today${d.removed ? ` · ${d.removed} future period(s) removed` : ''}`);
    },
  });

  const extendToEnd = async () => {
    if (!lastSegment || !projectEnd) return;
    setBusy(true);
    try {
      await updateSegmentApi(projectId, memberId, idOf(lastSegment), { ...bodyOf(toForm(lastSegment)), toDate: projectEnd });
      toast.success(`Extended to ${fmtDateLong(projectEnd)}`);
      afterWrite();
    } catch (err) {
      const data = err?.response?.data;
      if (err?.response?.status === 409 && data?.conflict) {
        // Surface the conflict on that row in edit mode so the user can pick a suggestion.
        const id = idOf(lastSegment);
        setEdits((m) => ({ ...m, [id]: { ...toForm(lastSegment), toDate: projectEnd } }));
        setConflicts((m) => ({ ...m, [id]: data.conflict }));
        setRowErrors((m) => ({ ...m, [id]: data.message || data.error?.message || 'Allocation exceeds capacity' }));
      } else toast.error(errMsg(err, 'Could not extend period'));
    } finally { setBusy(false); }
  };

  const releaseAll = () => setConfirmDlg({
    title: 'Release all hours',
    body: `Release ${member?.user?.name || 'this member'} from ${project?.name || 'the project'} starting ${fmtDateLong(today)}? Current periods end yesterday; future periods are removed.`,
    action: async () => {
      const res = await releaseMemberApi(projectId, memberId, { fromDate: today });
      const d = res.data?.data ?? res.data ?? {};
      toast.success(`Hours released${d.ended != null || d.removed != null ? ` · ${d.ended ?? 0} ended, ${d.removed ?? 0} removed` : ''}`);
    },
  });

  const runConfirm = async () => {
    if (!confirmDlg) return;
    setBusy(true);
    try {
      await confirmDlg.action();
      setConfirmDlg(null);
      afterWrite();
    } catch (err) { toast.error(errMsg(err, 'Action failed')); }
    finally { setBusy(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!open) return null;

  const roleOptions = (memberRoles || []).map((r) => ({ value: r.name ?? r, label: r.name ?? r }));
  if (member?.role && !roleOptions.some((o) => o.value === member.role)) roleOptions.unshift({ value: member.role, label: member.role });
  const canExtend = !!lastSegment && !!projectEnd && isoOf(lastSegment.toDate) < projectEnd;
  const loadTo = addDaysISO(today, 30);
  const btnSm = 'px-2.5 py-1 rounded text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Manage allocation">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="absolute right-0 top-0 h-full w-full sm:w-[520px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 truncate">{project?.name || 'Project'}</p>
            <h3 className="text-base font-semibold text-gray-900 truncate">{member?.user?.name || 'Member'}</h3>
            <p className="text-xs text-gray-500 truncate">
              {[member?.user?.designation, member?.user?.email].filter(Boolean).join(' · ') || '—'}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">Role</span>
              {canManage && onRoleChange ? (
                <div className="w-56">
                  <SearchSelect
                    options={roleOptions}
                    value={member?.role || ''}
                    onChange={(v) => { if (v && v !== member?.role) onRoleChange(v); }}
                    placeholder="— Select role —"
                    allowClear={false}
                  />
                </div>
              ) : (
                <span className="text-xs font-medium text-gray-800">{member?.role || '—'}</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded" aria-label="Close">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Load strip — next 30 days across all projects + helpdesk */}
          <section>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Load · next 30 days ({fmtRangeDate(today)} – {fmtRangeDate(loadTo)})
            </p>
            {userId
              ? <ResourceAvailabilityCard userId={userId} fromDate={today} toDate={loadTo} newHoursPerDay={0} />
              : <p className="text-xs text-gray-400">No user linked to this member.</p>}
          </section>

          {/* Periods */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Allocation periods {segments.length ? `(${segments.length})` : ''}
              </p>
              {canManage && !edits.new && (
                <button type="button" onClick={startAdd} disabled={busy}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50">
                  <HiOutlinePlus className="w-3.5 h-3.5" /> Add period
                </button>
              )}
            </div>

            {loading && segments.length === 0 && (
              <div className="space-y-2" aria-busy="true">
                <div className="h-12 bg-gray-100 rounded animate-pulse" />
                <div className="h-12 bg-gray-100 rounded animate-pulse" />
              </div>
            )}
            {loadError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
                <span>{loadError}</span>
                <button type="button" onClick={load} className="underline">Retry</button>
              </div>
            )}
            {!loading && !loadError && segments.length === 0 && !edits.new && (
              <div className="border border-dashed border-gray-300 rounded-lg px-3 py-4 text-center text-xs text-gray-400">
                No allocation periods yet.
                {canManage && <> Click <button type="button" onClick={startAdd} className="text-emerald-700 font-medium underline">Add period</button> to allocate hours.</>}
              </div>
            )}

            <ul className="space-y-2">
              {/* New row */}
              {edits.new && (
                <li className="border border-emerald-300 bg-emerald-50/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-emerald-800 mb-2">New period</p>
                  <SegmentEditor
                    form={edits.new}
                    onChange={(patch) => setEdit('new', patch)}
                    capacity={cap}
                    projectStart={projectStart}
                    projectEnd={projectEnd}
                    error={rowErrors.new}
                    conflict={conflicts.new}
                    onApplySuggestion={(patch) => applySuggestion('new', patch)}
                    onRequestException={conflicts.new && onRequestException ? () => requestException('new', null) : undefined}
                    onSave={() => saveRow('new')}
                    onCancel={() => clearRowState('new')}
                    saving={!!saving.new}
                  />
                </li>
              )}

              {sorted.map((s) => {
                const id = idOf(s);
                const editing = !!edits[id];
                const isPending = s.exceptionStatus === 'pending';
                const rowConflict = conflicts[id] || null;
                const focused = focusSegmentId && String(focusSegmentId) === String(id);
                return (
                  <li
                    key={id}
                    ref={focused ? focusRef : undefined}
                    className={`border rounded-lg p-3 ${editing ? 'border-blue-300 bg-blue-50/30' : focused ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200'}`}
                  >
                    {editing ? (
                      <SegmentEditor
                        form={edits[id]}
                        onChange={(patch) => setEdit(id, patch)}
                        capacity={cap}
                        projectStart={projectStart}
                        projectEnd={projectEnd}
                        error={rowErrors[id]}
                        conflict={rowConflict}
                        onApplySuggestion={(patch) => applySuggestion(id, patch)}
                        onRequestException={rowConflict && onRequestException ? () => requestException(id, s) : undefined}
                        onSave={() => saveRow(id)}
                        onCancel={() => clearRowState(id)}
                        saving={!!saving[id]}
                      />
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900">
                              {fmtRangeDate(s.fromDate)} – {fmtRangeDate(s.toDate)}
                              <span className="text-gray-400 font-normal text-xs ml-1">{String(isoOf(s.toDate) || '').slice(0, 4)}</span>
                            </p>
                            <p className="text-xs text-gray-600">{formatAllocation(s, cap) || '—'}</p>
                            {s.note && <p className="text-[11px] text-gray-400 italic truncate">{s.note}</p>}
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1 shrink-0">
                              {s.hoursConfirmed === false && !isPending && (
                                <button type="button" title="Confirm hours" onClick={() => confirmRow(s)} disabled={busy}
                                  className={`${btnSm} bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50`}>
                                  <HiOutlineCheck className="w-3.5 h-3.5 inline -mt-0.5" /> Confirm
                                </button>
                              )}
                              <button type="button" onClick={() => startEdit(s)} disabled={busy || isPending}
                                title={isPending ? 'Not editable while an exception is pending' : 'Edit period'}
                                className={`${btnSm} bg-white border-gray-300 text-gray-700 hover:bg-gray-50`}>
                                Edit
                              </button>
                              <button type="button" onClick={() => removeRow(s)} disabled={busy || isPending} title="Remove period"
                                className={`${btnSm} bg-white border-red-200 text-red-600 hover:bg-red-50`}>
                                <HiOutlineTrash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <SegmentChips segment={s} conflict={rowConflict} today={today} />
                        {rowConflict && (
                          <ConflictPanel
                            conflict={rowConflict}
                            capacity={cap}
                            onApply={(patch) => { setEdits((m) => ({ ...m, [id]: { ...toForm(s), ...patch } })); setConflicts((m) => ({ ...m, [id]: null })); }}
                            onRequestException={onRequestException ? () => requestException(id, s) : undefined}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Quick actions */}
          {canManage && segments.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick actions</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={endToday} disabled={busy || !activeSegment}
                  title={activeSegment ? 'Set the active period to end today and remove future periods' : 'No period is active today'}
                  className={`${btnSm} bg-white border-gray-300 text-gray-700 hover:bg-gray-50`}>
                  End today
                </button>
                <button type="button" onClick={extendToEnd} disabled={busy || !canExtend}
                  title={!projectEnd ? 'Project has no end date' : canExtend ? `Extend the last period to ${fmtDateLong(projectEnd)}` : 'Already runs to the project end'}
                  className={`${btnSm} bg-white border-gray-300 text-gray-700 hover:bg-gray-50`}>
                  Extend to project end
                </button>
                <button type="button" onClick={releaseAll} disabled={busy || !hasFutureHours}
                  title={hasFutureHours ? 'End every period yesterday and remove future ones' : 'No current or future hours'}
                  className={`${btnSm} bg-white border-red-200 text-red-600 hover:bg-red-50`}>
                  Release all hours
                </button>
              </div>
            </section>
          )}

          {/* History (lazy) */}
          <section>
            <button type="button" onClick={() => setHistoryOpen((o) => !o)}
              className="w-full flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
              {historyOpen ? <HiOutlineChevronDown className="w-3.5 h-3.5" /> : <HiOutlineChevronRight className="w-3.5 h-3.5" />}
              <HiOutlineClock className="w-3.5 h-3.5" /> History
            </button>
            {historyOpen && (
              <div className="mt-1 border border-gray-200 rounded-lg px-3">
                <HistoryList projectId={projectId} memberId={memberId} reloadKey={historyKey} />
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Confirm dialog */}
      <Modal open={!!confirmDlg} onClose={() => !busy && setConfirmDlg(null)} title={confirmDlg?.title || ''} size="sm">
        <p className="text-sm text-gray-700">{confirmDlg?.body}</p>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={() => setConfirmDlg(null)} disabled={busy}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={runConfirm} disabled={busy}
            className="px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {busy ? 'Working…' : 'Confirm'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
