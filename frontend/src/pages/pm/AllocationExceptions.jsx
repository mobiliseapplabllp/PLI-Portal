import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlineRefresh,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineInbox,
  HiOutlineClipboardCheck,
} from 'react-icons/hi';
import api from '../../api/axios';
import {
  listAllocationExceptionsApi,
  decideAllocationExceptionApi,
} from '../../api/pm/allocation.api';
import { formatAllocation } from '../../components/pm/AllocationTypeInput';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import { formatDate, formatDateTime } from '../../utils/formatters';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getId = (o) => o?._id || o?.id || '';
const errMsg = (e, fallback) =>
  e?.response?.data?.message || e?.response?.data?.error?.message || fallback;
const fmtH = (n) => String(Math.round((Number(n) || 0) * 10) / 10);
const REASON_LIMIT = 90;

const thCls = 'px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide';

const STATUS_CHIP = {
  pending:  'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-gray-100 text-gray-600 border-gray-200',
};

const TYPE_CHIP = {
  ticket:  'bg-blue-50 text-blue-700 border-blue-200',
  project: 'bg-gray-100 text-gray-600 border-gray-200',
};

/** Ticket vs project origin chip — same shape as StatusChip, one tone apart. */
function TypeChip({ kind }) {
  if (kind !== 'ticket' && kind !== 'project') return null;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium ${TYPE_CHIP[kind]}`}>
      {kind === 'ticket' ? 'Ticket' : 'Project'}
    </span>
  );
}

/**
 * What the request is FOR. A ticket-raised exception carries `ticket`
 * ({ _id, reqNumber, title }) and a null `project`; a project one carries
 * `project`. Never resolves to '—' once either block is present — an approver
 * must be able to tell two requests apart.
 */
const subjectOf = (r) => {
  const t = r?.ticket;
  if (t && (getId(t) || t.reqNumber || t.title)) {
    const req   = String(t.reqNumber || '').trim();
    const title = String(t.title || '').trim();
    return {
      kind:  'ticket',
      id:    getId(t),
      req:   req || null,
      title: title || null,
      // Head line: REQ number when there is one, else the title, else the id
      label: req || title || (getId(t) ? `Ticket ${getId(t)}` : 'Ticket'),
    };
  }
  const p = r?.project;
  if (p && (getId(p) || p.name)) {
    const name = String(p.name || '').trim();
    return {
      kind:  'project',
      id:    getId(p),
      req:   null,
      title: name || null,
      label: name || (getId(p) ? `Project ${getId(p)}` : 'Project'),
    };
  }
  return { kind: 'none', id: '', req: null, title: null, label: '—' };
};

function StatusChip({ status }) {
  const cls = STATUS_CHIP[status] || STATUS_CHIP.rejected;
  const label = status === 'rejected' ? 'Declined' : (status || '—').replace(/^\w/, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// Current load bar: peak vs capacity (bar clamps at 100%, label shows the true numbers)
function LoadBar({ load }) {
  const cap  = Number(load?.capacity) || 0;
  const peak = Number(load?.peakHours) || 0;
  if (!cap) return <span className="text-xs text-gray-400">—</span>;
  const ratio = peak / cap;
  const width = Math.min(100, Math.round(ratio * 100));
  const tone  = load?.isOverAllocated || ratio >= 1 ? 'bg-red-500'
              : ratio >= 0.8 ? 'bg-amber-500'
              : 'bg-emerald-500';
  return (
    <div className="min-w-[140px]" title={`Peak ${fmtH(peak)}h of ${fmtH(cap)}h/day · free ${fmtH(load?.freeHours)}h`}>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-gray-500 tabular-nums">
        peak {fmtH(peak)}h / {fmtH(cap)}h
        {Number(load?.freeHours) > 0 && <> · {fmtH(load.freeHours)}h free</>}
      </p>
    </div>
  );
}

function ReasonCell({ text }) {
  const [open, setOpen] = useState(false);
  const s = String(text || '').trim();
  if (!s) return <span className="text-xs text-gray-400">—</span>;
  const long = s.length > REASON_LIMIT;
  return (
    <div className="max-w-[260px] text-sm text-gray-700 whitespace-normal break-words">
      {open || !long ? s : `${s.slice(0, REASON_LIMIT).trimEnd()}…`}
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-1 text-xs font-medium text-emerald-700 hover:underline"
        >
          {open ? 'less' : 'more'}
        </button>
      )}
    </div>
  );
}

// ─── Decision modal ───────────────────────────────────────────────────────────
function DecisionModal({ target, onClose, onDone }) {
  const [note, setNote]     = useState('');
  const [busy, setBusy]     = useState(false);
  const row    = target?.row;
  const action = target?.action;
  const isReject = action === 'reject';

  useEffect(() => { setNote(''); }, [target]);

  if (!row) return null;
  const cap  = Number(row.load?.capacity) || 8;
  const subj = subjectOf(row);

  const submit = async () => {
    if (isReject && !note.trim()) return toast.error('A note is required when declining');
    setBusy(true);
    try {
      await decideAllocationExceptionApi(getId(row), { action, responseNote: note.trim() });
      toast.success(isReject ? 'Exception declined' : 'Exception approved');
      onDone(getId(row));
    } catch (e) {
      const status = e?.response?.status;
      toast.error(errMsg(e, 'Failed to record decision'));
      onDone(null, status);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={isReject ? 'Decline exception' : 'Approve exception'} size="sm">
      <div className="space-y-4">
        <div className="text-sm text-gray-700 space-y-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{row.user?.name || '—'}</span>
            <span>on</span>
            <span className="font-medium">{subj.label}</span>
            <TypeChip kind={subj.kind} />
          </p>
          {/* Ticket subject line — the REQ number alone does not say what it is for */}
          {subj.kind === 'ticket' && subj.title && subj.title !== subj.label && (
            <p className="text-xs text-gray-500 break-words">{subj.title}</p>
          )}
          <p className="tabular-nums">
            {formatAllocation(row, cap)} · {formatDate(row.fromDate)} – {formatDate(row.toDate)}
          </p>
          {Number(row.overloadHours) > 0 && (
            <p className="text-red-600 tabular-nums">+{fmtH(row.overloadHours)} h/day over capacity</p>
          )}
        </div>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">
            Note {isReject ? <span className="text-red-500">(required)</span> : <span className="text-gray-400">(optional)</span>}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            autoFocus
            placeholder={isReject ? 'Why is this being declined?' : 'Anything the requester should know'}
            className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || (isReject && !note.trim())}
            className={[
              'inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors',
              isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700',
            ].join(' ')}
          >
            {isReject ? <HiOutlineX className="w-4 h-4" /> : <HiOutlineCheck className="w-4 h-4" />}
            {busy ? 'Saving…' : isReject ? 'Decline' : 'Approve'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AllocationExceptions() {
  const navigate = useNavigate();
  const me     = useSelector((s) => s.auth.user);
  const myId   = getId(me);
  const myRole = me?.role;

  const [tab, setTab]         = useState('pending');   // 'pending' | 'decided'
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  // Legacy fallback only — current servers send canDecide on every row.
  const [approverRoles] = useState(null);
  const [deniedByServer, setDeniedByServer] = useState(false);
  const [decision, setDecision] = useState(null);           // { row, action }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listAllocationExceptionsApi({ status: 'all' });
      const d = res.data?.data;
      setRows(Array.isArray(d) ? d : []);
    } catch (e) {
      setError(errMsg(e, 'Failed to load allocation exceptions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const decided = useMemo(
    () => rows
      .filter((r) => r.status !== 'pending')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)),
    [rows],
  );

  // The SERVER decides who may act: every row carries canDecide / decideBlockedReason
  // (project.service.listAllocationExceptions). Older servers that don't send the flag
  // fall back to the previous role inference so the page still works.
  const serverFlags = useMemo(() => rows.some((r) => 'canDecide' in r), [rows]);
  const seesOthers  = useMemo(() => rows.some((r) => getId(r.requester) && getId(r.requester) !== myId), [rows, myId]);
  const mayDecide = (r) => (serverFlags
    ? r.canDecide === true
    : !deniedByServer && r.status === 'pending' && getId(r.requester) !== myId
      && (myRole === 'admin' || (Array.isArray(approverRoles) && approverRoles.includes(myRole)) || seesOthers));
  // Show the Actions column whenever ANY pending row is actionable, or to explain why not.
  const canApprove = !deniedByServer && (serverFlags
    ? pending.some((r) => r.canDecide === true || r.decideBlockedReason)
    : (myRole === 'admin' || (Array.isArray(approverRoles) && approverRoles.includes(myRole)) || seesOthers));

  const onDecided = (approvalId, httpStatus) => {
    if (approvalId) {
      setDecision(null);
      load();
      return;
    }
    if (httpStatus === 403) { setDeniedByServer(true); setDecision(null); }
  };

  const list = tab === 'pending' ? pending : decided;

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
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Allocation exceptions</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Requests to allocate someone beyond their daily capacity. Pending requests are not counted against capacity until approved.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 shrink-0"
        >
          <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {[
          { key: 'pending', label: 'Pending', count: pending.length },
          { key: 'decided', label: 'Decided', count: decided.length },
        ].map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
              ].join(' ')}
            >
              {t.label}
              {!loading && (
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
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

      {/* Table */}
      {!error && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg" />)}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={tab === 'pending' ? HiOutlineInbox : HiOutlineClipboardCheck}
              message={tab === 'pending' ? 'No pending exception requests' : 'No decided exception requests yet'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className={`${thCls} text-left`}>Person</th>
                    <th className={`${thCls} text-left`}>Project / Ticket</th>
                    <th className={`${thCls} text-left`}>Requested</th>
                    <th className={`${thCls} text-left`}>Window</th>
                    <th className={`${thCls} text-left`}>Overload</th>
                    <th className={`${thCls} text-left`}>Current load</th>
                    <th className={`${thCls} text-left`}>Requester</th>
                    <th className={`${thCls} text-left`}>Reason</th>
                    <th className={`${thCls} text-left`}>{tab === 'pending' ? 'Requested on' : 'Decision'}</th>
                    {tab === 'pending' && canApprove && <th className={`${thCls} text-right`}>Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list.map((r) => {
                    const id  = getId(r);
                    const cap = Number(r.load?.capacity) || 8;
                    const isOwn = !!myId && getId(r.requester) === myId;
                    const over = Number(r.overloadHours) || 0;
                    return (
                      <tr key={id} className="hover:bg-gray-50 align-top">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 whitespace-nowrap">{r.user?.name || '—'}</p>
                          {r.user?.email && <p className="text-xs text-gray-400">{r.user.email}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const subj = subjectOf(r);
                            // Ticket-raised request: REQ number (linked to the ticket) + title.
                            if (subj.kind === 'ticket') {
                              return (
                                <div className="space-y-1 max-w-[220px]">
                                  <TypeChip kind="ticket" />
                                  {subj.id ? (
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/helpdesk/tickets/${subj.id}`)}
                                      className="block text-emerald-700 hover:underline text-left font-medium"
                                      title={subj.title || subj.label}
                                    >
                                      {subj.label}
                                    </button>
                                  ) : (
                                    <p className="font-medium text-gray-800">{subj.label}</p>
                                  )}
                                  {subj.title && subj.title !== subj.label && (
                                    <p className="text-xs text-gray-500 whitespace-normal break-words" title={subj.title}>
                                      {subj.title}
                                    </p>
                                  )}
                                </div>
                              );
                            }
                            // Project request — unchanged behaviour, with the origin chip.
                            return r.project ? (
                              <div className="space-y-1">
                                <TypeChip kind="project" />
                                <button
                                  type="button"
                                  onClick={() => navigate(`/pm/projects/${getId(r.project)}`)}
                                  className="block text-emerald-700 hover:underline text-left"
                                >
                                  {r.project.name}
                                </button>
                              </div>
                            ) : '—';
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-800">
                          {formatAllocation(r, cap) || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 tabular-nums">
                          {formatDate(r.fromDate)} – {formatDate(r.toDate)}
                          {/* Segment (period) note — present once the request is bound to a segment */}
                          {(() => {
                            const note = r.segment?.note ?? r.segmentNote ?? null;
                            return note ? (
                              <p className="mt-0.5 text-xs text-gray-500 whitespace-normal break-words max-w-[200px]" title="Period note">“{String(note)}”</p>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {over > 0 ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold tabular-nums">
                              +{fmtH(over)} h/day over
                            </span>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3"><LoadBar load={r.load} /></td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {r.requester?.name || '—'}
                          {isOwn && <span className="ml-1 text-[11px] text-gray-400">(you)</span>}
                        </td>
                        <td className="px-4 py-3"><ReasonCell text={r.reason} /></td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {tab === 'pending' ? (
                            <span className="text-xs">{formatDateTime(r.createdAt)}</span>
                          ) : (
                            <div className="space-y-1">
                              <StatusChip status={r.status} />
                              <p className="text-xs text-gray-500">
                                {r.approver?.name ? `by ${r.approver.name} · ` : ''}{formatDateTime(r.updatedAt)}
                              </p>
                              {r.approverNote && (
                                <p className="text-xs text-gray-600 max-w-[220px] whitespace-normal break-words">“{r.approverNote}”</p>
                              )}
                            </div>
                          )}
                        </td>
                        {tab === 'pending' && canApprove && (
                          <td className="px-4 py-3">
                            {!mayDecide(r) ? (
                              <p className="text-right text-xs text-gray-400 whitespace-nowrap" title={r.decideBlockedReason || ''}>
                                {r.decideBlockedReason || (isOwn ? 'Own request' : '—')}
                              </p>
                            ) : (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setDecision({ row: r, action: 'approve' })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                                >
                                  <HiOutlineCheck className="w-3.5 h-3.5" /> Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDecision({ row: r, action: 'reject' })}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                                >
                                  <HiOutlineX className="w-3.5 h-3.5" /> Decline
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {decision && (
        <DecisionModal target={decision} onClose={() => setDecision(null)} onDone={onDecided} />
      )}
    </div>
  );
}
