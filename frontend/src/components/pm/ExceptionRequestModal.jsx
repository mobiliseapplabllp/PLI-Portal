import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import { requestAllocationExceptionApi } from '../../api/pm/allocation.api';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtH = (h) => Math.round((Number(h) || 0) * 10) / 10;
const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(String(iso).slice(0, 10)));
  } catch { return String(iso).slice(0, 10); }
};
const MIN_REASON = 10;

/** Pull a human message out of any 4xx/5xx body (both `message` and `error.message` are used). */
const errMessage = (err, fallback) =>
  err?.response?.data?.message
  || err?.response?.data?.error?.message
  || err?.message
  || fallback;

/**
 * ExceptionRequestModal — ask an approver to allow an over-capacity allocation.
 *
 * Props
 *   open          bool
 *   onClose       () => void
 *   projectId     string
 *   member        { userId, userName, memberId?, segmentId?, allocationMode, hoursPerDay,
 *                   allocationTotalHours, allocationFrom, allocationTo, role }
 *                 segmentId — the allocation period (segment) the exception is for;
 *                 sent as `segmentId` in the POST body. Without it (new member / older
 *                 rows) the server creates the period from allocationFrom/To.
 *   conflict      409 body `conflict` (peak, capacity, remaining, overDays,
 *                 suggestions:{ overloadHours }, exceptionMaxHoursPerDay) — any key may be missing
 *   onRequested   (result:{ member, approval }) => void
 */
export default function ExceptionRequestModal({ open, onClose, projectId, member, conflict, onRequested }) {
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [touched,    setTouched]    = useState(false);

  // Reset the form each time the modal is opened for a (possibly different) member
  useEffect(() => {
    if (open) { setReason(''); setError(null); setTouched(false); setSubmitting(false); }
  }, [open, member?.userId, member?.segmentId]);

  const m = member || {};
  const c = conflict || {};

  const capacity  = Number(c.capacity) > 0 ? Number(c.capacity) : null;
  const peak      = c.peak != null ? Number(c.peak) : null;
  const remaining = c.remaining != null ? Number(c.remaining) : null;
  const cap       = Number(c.exceptionMaxHoursPerDay) > 0 ? Number(c.exceptionMaxHoursPerDay) : null;

  // Requested hrs/day. In 'total' mode the caller passes the derived hrs/day in
  // `hoursPerDay` for display only (the POST body sends allocationTotalHours).
  const requestedHours = useMemo(
    () => (m.hoursPerDay != null && m.hoursPerDay !== '' ? Number(m.hoursPerDay) : null),
    [m.hoursPerDay],
  );

  // Overload: prefer the server's figure, else peak − capacity
  const overload = c.suggestions?.overloadHours != null
    ? Number(c.suggestions.overloadHours)
    : (peak != null && capacity != null ? Math.max(0, peak - capacity) : null);

  const exceedsCap  = cap != null && requestedHours != null && requestedHours > cap;
  const reasonShort = reason.trim().length < MIN_REASON;
  const canSubmit   = !submitting && !exceedsCap && !reasonShort && m.userId && projectId;

  const handleSubmit = async () => {
    setTouched(true);
    if (reasonShort || exceedsCap) return;
    setSubmitting(true);
    setError(null);
    try {
      const mode = m.allocationMode === 'total' ? 'total' : 'per_day';
      const body = {
        userId:         m.userId,
        ...(m.memberId ? { memberId: m.memberId } : {}),
        ...(m.segmentId ? { segmentId: m.segmentId } : {}),
        allocationMode: mode,
        hoursPerDay:    mode === 'per_day' && m.hoursPerDay != null && m.hoursPerDay !== '' ? Number(m.hoursPerDay) : null,
        allocationTotalHours: mode === 'total' && m.allocationTotalHours != null && m.allocationTotalHours !== '' ? Number(m.allocationTotalHours) : null,
        allocationFrom: m.allocationFrom ? String(m.allocationFrom).slice(0, 10) : null,
        allocationTo:   m.allocationTo   ? String(m.allocationTo).slice(0, 10)   : null,
        ...(m.role ? { role: m.role } : {}),
        reason: reason.trim(),
      };
      const res = await requestAllocationExceptionApi(projectId, body);
      const result = res.data?.data ?? res.data ?? {};
      toast.success('Exception requested — awaiting approval');
      onRequested?.(result);
      onClose?.();
    } catch (err) {
      const status = err?.response?.status;
      const msg = errMessage(err, 'Failed to request exception');
      if (status && status < 500) setError(msg);
      else { setError(msg); toast.error(msg); }
    } finally {
      setSubmitting(false);
    }
  };

  const Stat = ({ label, value, tone = 'text-gray-800' }) => (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );

  return (
    <Modal open={open} onClose={submitting ? () => {} : onClose} title="Request allocation exception" size="md">
      <div className="space-y-4 text-sm">
        {/* Who / when */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          <p className="font-semibold text-amber-800">{m.userName || 'Team member'}</p>
          <p className="text-xs text-amber-700 mt-0.5">
            <span className="uppercase tracking-wide text-[10px] text-amber-600 font-medium mr-1">Period</span>
            {fmtDate(m.allocationFrom)} → {fmtDate(m.allocationTo)}
            {m.role ? <span className="text-amber-600"> · {m.role}</span> : null}
            {m.segmentId ? <span className="text-amber-600" title={`Segment ${m.segmentId}`}> · existing period</span> : <span className="text-amber-600"> · new period</span>}
          </p>
          <p className="text-xs text-amber-700 mt-1">
            An approver will be asked to allow this person to exceed their daily capacity for this window.
            Until it is decided the request is <strong>not counted</strong> against their other projects.
          </p>
        </div>

        {/* Numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label="Requested"
            value={requestedHours != null ? `${fmtH(requestedHours)} h/day` : '—'}
            tone={exceedsCap ? 'text-red-600' : 'text-gray-800'}
          />
          <Stat
            label="Peak vs capacity"
            value={peak != null && capacity != null ? `${fmtH(peak)}h / ${fmtH(capacity)}h` : (capacity != null ? `— / ${fmtH(capacity)}h` : '—')}
            tone={peak != null && capacity != null && peak > capacity ? 'text-red-600' : 'text-gray-800'}
          />
          <Stat
            label="Overload"
            value={overload != null ? `+${fmtH(overload)} h/day` : '—'}
            tone="text-red-600"
          />
          <Stat
            label="Exception cap"
            value={cap != null ? `${fmtH(cap)} h/day` : '—'}
          />
        </div>
        {remaining != null && (
          <p className="text-xs text-gray-500 -mt-2">
            Without an exception, only <strong>{fmtH(Math.max(0, remaining))} h/day</strong> fits in this window.
          </p>
        )}
        {exceedsCap && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
            Requested {fmtH(requestedHours)} h/day exceeds the exception cap of {fmtH(cap)} h/day. Reduce the hours before requesting.
          </p>
        )}
        {c.canRequestException === false && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
            Exceptions cannot be requested for this allocation.
          </p>
        )}

        {/* Reason */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Reason <span className="text-red-500">*</span>
            <span className="text-gray-400 font-normal"> (min {MIN_REASON} characters)</span>
          </label>
          <textarea
            value={reason}
            onChange={e => { setReason(e.target.value); setError(null); }}
            onBlur={() => setTouched(true)}
            rows={3}
            disabled={submitting}
            placeholder="Why does this person need to exceed capacity for this window?"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              touched && reasonShort ? 'border-red-400' : 'border-gray-200'
            }`}
          />
          {touched && reasonShort && (
            <p className="text-xs text-red-600 mt-1">
              {reason.trim().length === 0 ? 'A reason is required.' : `Add ${MIN_REASON - reason.trim().length} more character(s).`}
            </p>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || c.canRequestException === false}
            className="px-4 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Sending…' : 'Request exception'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
