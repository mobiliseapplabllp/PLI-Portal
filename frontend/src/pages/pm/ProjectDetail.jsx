import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProjectById, clearActiveProject } from '../../store/pmSlice';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft, HiOutlinePencil, HiOutlineUserAdd,
  HiOutlineFlag, HiOutlineChartBar, HiOutlineUsers,
  HiOutlineCalendar, HiOutlineClipboardList, HiOutlineViewBoards,
  HiOutlinePaperClip, HiOutlineTrash, HiOutlineX, HiOutlineDocumentText,
  HiOutlineDownload, HiOutlineUpload, HiOutlinePlus,
  HiOutlineCash, HiOutlineCheckCircle, HiOutlineExclamationCircle,
  HiOutlineClipboard,
} from 'react-icons/hi';
import { updateProjectApi, addMemberApi, updateMemberApi, removeMemberApi } from '../../api/pm/projects.api';
import { cancelAllocationExceptionApi } from '../../api/pm/allocation.api';
// Member roles are now fetched from /pm/config/member-roles (admin-configurable)
import {
  getProjectDocumentsApi, uploadProjectDocumentApi,
  deleteProjectDocumentApi, downloadProjectDocumentUrl,
} from '../../api/pm/documents.api';
import { getTodayLogApi } from '../../api/pm/dailyLogs.api';
import { getUsersApi } from '../../api/users.api';
import { getPmStatusesApi, getMemberRolesApi } from '../../api/pm/config.api';
import api from '../../api/axios';
import { getUserUtilisationApi } from '../../api/pm/utilisation.api';
import { projectProgress } from '../../utils/pmProgress';
import ResourceAvailabilityCard from '../../components/pm/ResourceAvailabilityCard';
import AllocationApprovalPanel from '../../components/pm/AllocationApprovalPanel';
import AllocationTypeInput, { formatAllocation } from '../../components/pm/AllocationTypeInput';
import ExceptionRequestModal from '../../components/pm/ExceptionRequestModal';
import AllocationDrawer from '../../components/pm/AllocationDrawer';
import AllocationGrid from '../../components/pm/AllocationGrid';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLORS = {
  'Yet to Start': 'bg-gray-100 text-gray-700',
  'Active':       'bg-emerald-100 text-emerald-700',
  'On Hold':      'bg-yellow-100 text-yellow-700',
  'On Track':     'bg-blue-100 text-blue-700',
  'Cancelled':    'bg-red-100 text-red-700',
  'Delayed':      'bg-orange-100 text-orange-700',
  'Completed':    'bg-blue-100 text-blue-700',
  // legacy
  planning:       'bg-gray-100 text-gray-700',
  active:         'bg-emerald-100 text-emerald-700',
  on_hold:        'bg-yellow-100 text-yellow-700',
  completed:      'bg-blue-100 text-blue-700',
  cancelled:      'bg-red-100 text-red-700',
};
const MS_STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-emerald-100 text-emerald-700',
  delayed:     'bg-red-100 text-red-700',
  on_hold:     'bg-yellow-100 text-yellow-700',
  cancelled:   'bg-gray-100 text-gray-400',
};
const RAG_COLORS = { Green: 'bg-emerald-100 text-emerald-700', Amber: 'bg-yellow-100 text-yellow-700', Red: 'bg-red-100 text-red-700' };
const RAID_TYPE_COLORS = { Risk: 'bg-red-100 text-red-700', Assumption: 'bg-blue-100 text-blue-700', Issue: 'bg-orange-100 text-orange-700', Dependency: 'bg-purple-100 text-purple-700' };

const MANAGER_ROLES = ['admin', 'manager', 'senior_manager'];
const DOC_CATEGORIES = ['SOW / Client Contracts', 'Requirement Documents / BRD', 'Solution Architecture Documents', 'Technical Design Documentation', 'Others'];
const CATEGORY_COLORS = {
  'SOW / Client Contracts': 'bg-blue-100 text-blue-700',
  'Requirement Documents / BRD': 'bg-purple-100 text-purple-700',
  'Solution Architecture Documents': 'bg-emerald-100 text-emerald-700',
  'Technical Design Documentation': 'bg-orange-100 text-orange-700',
  'Others': 'bg-gray-100 text-gray-600',
};
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

const formatBytes = (n) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// ── Sub-resource helpers ──────────────────────────────────────────────────────
const statusReportApi = {
  list:   (pid)      => api.get(`/pm/projects/${pid}/status-reports`),
  create: (pid, d)   => api.post(`/pm/projects/${pid}/status-reports`, d),
  update: (pid, id, d) => api.put(`/pm/projects/${pid}/status-reports/${id}`, d),
  del:    (pid, id)  => api.delete(`/pm/projects/${pid}/status-reports/${id}`),
};
const raidApi = {
  list:   (pid, params) => api.get(`/pm/projects/${pid}/raid`, { params }),
  create: (pid, d)      => api.post(`/pm/projects/${pid}/raid`, d),
  update: (pid, id, d)  => api.put(`/pm/projects/${pid}/raid/${id}`, d),
  del:    (pid, id)     => api.delete(`/pm/projects/${pid}/raid/${id}`),
};
const financialApi = {
  get:    (pid)    => api.get(`/pm/projects/${pid}/financial`),
  upsert: (pid, d) => api.put(`/pm/projects/${pid}/financial`, d),
};
const closureApi = {
  get:    (pid)    => api.get(`/pm/projects/${pid}/closure`),
  upsert: (pid, d) => api.put(`/pm/projects/${pid}/closure`, d),
  close:  (pid)    => api.post(`/pm/projects/${pid}/closure/close`),
};

// ── Hours-based allocation helpers ───────────────────────────────────────────
const fmtH = (h) => Math.round((Number(h) || 0) * 10) / 10;

// ── Monthly utilisation (Phase 2) ─────────────────────────────────────────────
const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (ym) => {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return 'This month';
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const UTIL_BAND_CLS = {
  free: 'bg-gray-100 text-gray-600 border-gray-200',
  ok:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  over: 'bg-red-50 text-red-700 border-red-200',
};
/**
 * One member's committed hours for the selected calendar month, across ALL
 * projects + helpdesk. Shared by the Team tab card and list views so they
 * never drift. Distinct from the 30-day "Overall capacity" availability block.
 */
function MonthUtilChip({ cell, loading, month, compact = false }) {
  if (!cell) {
    return loading
      ? <div className={`h-4 bg-gray-100 rounded-full animate-pulse ${compact ? 'w-20' : 'w-28'}`} />
      : null;
  }
  const band = UTIL_BAND_CLS[cell.band] ? cell.band : 'free';
  const over = !!cell.isOverAllocated;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${UTIL_BAND_CLS[band]}`}
      title={`${monthLabel(month)} — Projects ${fmtH(cell.pmHours)}h · Operations ${fmtH(cell.hdHours)}h`}
    >
      {!compact && <span className="text-[10px] uppercase tracking-wide opacity-70">{monthLabel(month)}</span>}
      <span>{fmtH(cell.totalHours)}h · {Math.round(Number(cell.totalPct) || 0)}%</span>
      {over && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"
          title={`Over capacity on ${cell.overDays} day(s) — peak ${fmtH(cell.peakHoursPerDay)}h`}
        />
      )}
    </span>
  );
}
const fmtRangeDate = (iso) => {
  if (!iso) return '?';
  try { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso)); }
  catch { return String(iso).slice(0, 10); }
};

// ── Allocation segments (time-phased periods per member) ─────────────────────
const isoDay = (d) => (d ? String(d).slice(0, 10) : null);
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * A member's segments, normalised to { _id, fromDate, toDate, hoursPerDay, … }
 * and sorted by fromDate. Older servers return no `segments` — synthesise one
 * from the mirrored member-level fields so every reader keeps working.
 */
const memberSegments = (m) => {
  if (!m) return [];
  let segs = Array.isArray(m.segments) ? m.segments : null;
  if (!segs) {
    if (m.hoursPerDay == null && m.allocationTotalHours == null) return [];
    segs = [{
      _id: null,
      fromDate: m.allocationFrom, toDate: m.allocationTo,
      allocationMode: m.allocationMode, hoursPerDay: m.hoursPerDay, allocationTotalHours: m.allocationTotalHours,
      hoursConfirmed: m.hoursConfirmed, exceptionStatus: m.exceptionStatus, exceptionApprovalId: m.exceptionApprovalId,
      exceptionApproval: m.exceptionApproval, isEstimated: m.isEstimated,
    }];
  }
  return segs
    .map(s => ({ ...s, _id: s._id ?? s.id ?? s.segmentId ?? null, fromDate: isoDay(s.fromDate ?? s.allocationFrom), toDate: isoDay(s.toDate ?? s.allocationTo) }))
    .sort((a, b) => String(a.fromDate || '').localeCompare(String(b.fromDate || '')));
};

/** The segment whose exception state matters most for a row: pending > approved > none. */
const worstExceptionSegment = (m) => {
  const segs = memberSegments(m);
  return segs.find(s => s.exceptionStatus === 'pending')
      || segs.find(s => s.exceptionStatus === 'approved')
      || null;
};
const memberHasPendingException = (m) =>
  m?.exceptionStatus === 'pending' || memberSegments(m).some(s => s.exceptionStatus === 'pending');
const memberHasEstimate = (m) =>
  m?.hoursConfirmed === false || m?.isEstimated || memberSegments(m).some(s => s.hoursConfirmed === false || s.isEstimated);

/** "N h/day now · until dd Mon" / "N h/day from dd Mon · until dd Mon" / "Ended dd Mon" / "No allocation". */
const segmentSummary = (m) => {
  const segs = memberSegments(m);
  if (segs.length === 0) return 'No allocation';
  const t = todayIso();
  const active = segs.find(s => (!s.fromDate || s.fromDate <= t) && (!s.toDate || s.toDate >= t));
  if (active) return `${fmtH(active.hoursPerDay)} h/day now · until ${active.toDate ? fmtRangeDate(active.toDate) : 'open'}`;
  const next = segs.find(s => s.fromDate && s.fromDate > t);
  if (next) return `${fmtH(next.hoursPerDay)} h/day from ${fmtRangeDate(next.fromDate)} · until ${next.toDate ? fmtRangeDate(next.toDate) : 'open'}`;
  const last = segs[segs.length - 1];
  return `Ended ${last.toDate ? fmtRangeDate(last.toDate) : '—'}`;
};

const SEG_BAR_CLS = {
  pending:   'bg-amber-200 text-amber-900 border-amber-300',
  approved:  'bg-purple-200 text-purple-900 border-purple-300',
  estimated: 'bg-emerald-100 text-emerald-800 border-emerald-300 border-dashed',
  normal:    'bg-emerald-500 text-white border-emerald-600',
};
const segTone = (s) => (s.exceptionStatus === 'pending' ? 'pending'
  : s.exceptionStatus === 'approved' ? 'approved'
  : (s.hoursConfirmed === false || s.isEstimated) ? 'estimated' : 'normal');

/**
 * Compact horizontal strip of a member's segments across the project window
 * (widened to the min/max of the segments). Bars are labelled "N h/day" and
 * coloured by exception state / estimate; a thin line marks today.
 */
function SegmentTimeline({ member, project, compact = false }) {
  const segs = memberSegments(member).filter(s => s.fromDate && s.toDate);
  if (segs.length === 0) return <div className={`${compact ? 'h-3' : 'h-4'} rounded bg-gray-100`} title="No allocation" />;
  const dates = segs.flatMap(s => [s.fromDate, s.toDate]).concat([isoDay(project?.startDate), isoDay(project?.endDate)]).filter(Boolean).sort();
  const start = new Date(dates[0]).getTime();
  const end   = Math.max(new Date(dates[dates.length - 1]).getTime(), start + 86400000);
  const span  = end - start;
  const pctOf = (iso) => Math.min(100, Math.max(0, ((new Date(iso).getTime() - start) / span) * 100));
  const t = todayIso();
  const todayPct = t >= dates[0] && t <= dates[dates.length - 1] ? pctOf(t) : null;
  const h = compact ? 'h-3' : 'h-4';
  return (
    <div className="space-y-0.5">
      <div className={`relative ${h} rounded bg-gray-100 overflow-hidden`} aria-label="Allocation periods">
        {segs.map((s, i) => {
          const left  = pctOf(s.fromDate);
          const right = pctOf(new Date(new Date(s.toDate).getTime() + 86400000).toISOString().slice(0, 10));
          const width = Math.max(1.5, right - left);
          const tone  = segTone(s);
          return (
            <div
              key={s._id ?? i}
              className={`absolute top-0 bottom-0 rounded-sm border flex items-center justify-center overflow-hidden text-[9px] font-semibold leading-none ${SEG_BAR_CLS[tone]}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${fmtRangeDate(s.fromDate)} – ${fmtRangeDate(s.toDate)} · ${fmtH(s.hoursPerDay)} h/day${tone === 'pending' ? ' · pending exception' : tone === 'approved' ? ' · approved exception' : tone === 'estimated' ? ' · estimated' : ''}`}
            >
              {width >= 12 && <span className="truncate px-0.5">{fmtH(s.hoursPerDay)} h/day</span>}
            </div>
          );
        })}
        {todayPct != null && (
          <div className="absolute top-0 bottom-0 w-px bg-red-500/80" style={{ left: `${todayPct}%` }} title={`Today · ${fmtRangeDate(t)}`} />
        )}
      </div>
      {!compact && (
        <div className="flex justify-between text-[9px] text-gray-400 tabular-nums">
          <span>{fmtRangeDate(dates[0])}</span>
          <span>{fmtRangeDate(dates[dates.length - 1])}</span>
        </div>
      )}
    </div>
  );
}

/** Chip for a member row's allocation-exception state, read from the 'worst' segment (pending > approved). */
function ExceptionChip({ member, compact = false }) {
  const seg = worstExceptionSegment(member);
  const st = seg?.exceptionStatus ?? member?.exceptionStatus;
  if (st !== 'pending' && st !== 'approved') return null;
  const approverName =
    seg?.exceptionApproval?.approver?.name
    ?? seg?.exceptionApproval?.approvedBy?.name
    ?? member.exceptionApproval?.approver?.name
    ?? member.exceptionApproval?.approvedBy?.name
    ?? member.exceptionApprover?.name
    ?? null;
  const cls = st === 'pending'
    ? 'bg-amber-100 text-amber-800 border-amber-200'
    : 'bg-purple-100 text-purple-800 border-purple-200';
  const label = st === 'pending'
    ? 'Pending exception'
    : `Exception approved${approverName ? ` (by ${approverName})` : ''}`;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap ${compact ? 'text-[10px]' : 'text-xs'} ${cls}`}
      title={st === 'pending' ? 'Awaiting approver decision — not counted against capacity and not editable until decided' : 'Approved over-capacity allocation'}
    >
      {st === 'pending' ? '⏳ ' : '✔ '}{label}
    </span>
  );
}

/**
 * Normalise the 409 `conflict.suggestions` block (may be absent on older
 * servers). Falls back to `remaining` for the reduce option.
 */
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

/**
 * Suggestion buttons shared by the ConflictPanel and the preview modal's
 * "Resolve" popover. `onApply(patch)` receives a form patch such as
 * { allocationMode:'per_day', hoursPerDay } / { allocationFrom } / { allocationTo }.
 */
function SuggestionButtons({ suggestions, onApply, onRequestException, canRequestException = true, tone = 'red' }) {
  const { reduceTo, nextFreeDate, shortenTo } = suggestions || {};
  const btn = tone === 'red'
    ? 'px-2.5 py-1 bg-white border border-red-300 text-red-700 rounded text-xs font-medium hover:bg-red-100 transition-colors'
    : 'px-2.5 py-1 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-100 transition-colors';
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
        <button type="button" className={btn} onClick={() => onApply({ allocationFrom: nextFreeDate })}>
          Start on {fmtRangeDate(nextFreeDate)}
        </button>
      )}
      {shortenTo && onApply && (
        <button type="button" className={btn} onClick={() => onApply({ allocationTo: shortenTo })}>
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

/**
 * Red panel rendered under a member form after the server returned HTTP 409.
 *   onApply(patch)        — apply a suggestion to the form (see SuggestionButtons)
 *   onRequestException()  — open the ExceptionRequestModal for this form
 *   onUseRemaining(h)     — legacy: still honoured when onApply is not given
 */
function ConflictPanel({ conflict, capacity, onUseRemaining, onApply, onRequestException, compact = false }) {
  if (!conflict) return null;
  const cap = Number(conflict.capacity) > 0 ? Number(conflict.capacity) : capacity;
  const ranges = Array.isArray(conflict.ranges) ? conflict.ranges : [];
  const sugg = conflictSuggestions(conflict);
  const apply = onApply || (onUseRemaining ? (patch) => { if (patch.hoursPerDay != null) onUseRemaining(patch.hoursPerDay); } : null);
  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg text-red-700 ${compact ? 'px-2.5 py-2 mt-2 text-xs' : 'px-3 py-2.5 mb-3 text-sm'}`} role="alert">
      <p className="font-semibold">
        Over capacity on {conflict.overDays ?? ranges.reduce((s, r) => s + (r.days || 0), 0)} day{(conflict.overDays ?? 0) === 1 ? '' : 's'}
        {sugg.overloadHours != null && sugg.overloadHours > 0 && (
          <span className="font-normal text-red-600"> · peak {fmtH(conflict.peak)}h / {fmtH(cap)}h (+{fmtH(sugg.overloadHours)}h)</span>
        )}
      </p>
      {ranges.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-red-600">
          {ranges.map((r, i) => (
            <li key={i}>{fmtRangeDate(r.from)} – {fmtRangeDate(r.to)} · peak {fmtH(r.peak)}h / {fmtH(cap)}h</li>
          ))}
        </ul>
      )}
      <SuggestionButtons
        suggestions={sugg}
        onApply={apply}
        onRequestException={onRequestException}
        canRequestException={conflict.canRequestException !== false}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const { activeProject: project, projectLoading, projectError } = useSelector(s => s.pm);
  const { user } = useSelector(s => s.auth);
  const uid = String(user?._id || user?.id || '');
  // Declared early (moved up from further down) — a useEffect's dependency
  // array is evaluated synchronously during render, at its call site, not
  // inside the (later-executing) effect callback. Referencing canManage in a
  // dependency array from BEFORE this declaration threw "Cannot access
  // 'canManage' before initialization" (temporal dead zone), even though
  // referencing it inside an effect BODY would have been fine via closure.
  const canManage = MANAGER_ROLES.includes(user?.role) || (project && String(project.managerId) === String(uid));

  const [activeTab,     setActiveTab]     = useState('overview');
  const [allUsers,      setAllUsers]      = useState([]);
  const [clientOrgs,    setClientOrgs]    = useState([]);
  const [pmStatuses,    setPmStatuses]    = useState([]);
  const [memberRoles,   setMemberRoles]   = useState([]);
  const [addingMember,  setAddingMember]  = useState(false);
  const [memberForm,    setMemberForm]    = useState({ userId: '', role: '', allocationMode: 'per_day', hoursPerDay: null, allocationTotalHours: null, allocationFrom: null, allocationTo: null });
  const [memberConflict, setMemberConflict] = useState(null);      // 409 conflict for the add form
  const [memberDerived,  setMemberDerived]  = useState({ hoursPerDay: null, totalHours: null, workingDays: null }); // from AllocationTypeInput (total ÷ working days)
  // Allocation drawer: { memberId, focusSegmentId? } | null — the member row is
  // re-read from the project on every render so the drawer sees fresh segments.
  const [drawer, setDrawer] = useState(null);
  const [teamMode, setTeamMode] = useState(() => {
    try { return localStorage.getItem('pm_team_mode') === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
  });
  const handleTeamModeToggle = (v) => {
    setTeamMode(v);
    try { localStorage.setItem('pm_team_mode', v); } catch {}
  };
  const [capacity, setCapacity] = useState(8);                     // working hours/day, from availability responses
  const [statusUpdating,setStatusUpdating]= useState(false);
  const [showAllocationPreview, setShowAllocationPreview] = useState(false);
  const [allocationPreview,     setAllocationPreview]     = useState([]);
  const [previewLoading,        setPreviewLoading]        = useState(false);
  const [previewResolveUserId,  setPreviewResolveUserId]  = useState(null); // which preview row has its "Resolve" popover open
  // Exception request modal: { member:{ userId, userName, memberId?, segmentId?, ...allocation }, conflict, source:'add'|'drawer'|'preview' } | null
  const [exceptionModal,        setExceptionModal]        = useState(null);
  const [todayLog,      setTodayLog]      = useState(null);
  const [teamView, setTeamView] = useState(() => {
    try { return localStorage.getItem('pm_team_view') || 'list'; } catch { return 'list'; }
  });
  const handleTeamViewToggle = (v) => {
    setTeamView(v);
    try { localStorage.setItem('pm_team_view', v); } catch {}
  };

  // Batch availability for Team Setup tab
  const [membersAvailability, setMembersAvailability] = useState({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // Monthly utilisation (selected calendar month, all projects + helpdesk)
  const [utilMonth,     setUtilMonth]     = useState(currentMonthKey);
  const [teamUtil,      setTeamUtil]      = useState({});     // userId → month cell
  const [utilMonthMeta, setUtilMonthMeta] = useState(null);   // { workingDays, totalHours, summary }
  const [utilLoading,   setUtilLoading]   = useState(false);
  const [utilTick,      setUtilTick]      = useState(0);      // bumped after member add/update/remove/confirm
  const bumpUtil = () => setUtilTick(t => t + 1);

  // Edit project modal
  const [showEdit,  setShowEdit]  = useState(false);
  const [editForm,  setEditForm]  = useState({});
  const [editSaving,setEditSaving]= useState(false);

  // Documents
  const [docs,           setDocs]           = useState([]);
  const [docsLoading,    setDocsLoading]    = useState(false);
  const [docFile,        setDocFile]        = useState(null);
  const [docCategory,    setDocCategory]    = useState('SOW / Client Contracts');
  const [docCategoryOther,setDocCategoryOther]= useState('');
  const [uploading,      setUploading]      = useState(false);

  // Status Reports
  const [statusReports,    setStatusReports]    = useState([]);
  const [srLoading,        setSrLoading]        = useState(false);
  const [showSrForm,       setShowSrForm]       = useState(false);
  const [srForm,           setSrForm]           = useState({ reportDate: '', period: 'Weekly', ragStatus: 'Green', summary: '', risks: '', nextSteps: '' });
  const [srSaving,         setSrSaving]         = useState(false);

  // RAID
  const [raidItems,    setRaidItems]    = useState([]);
  const [raidLoading,  setRaidLoading]  = useState(false);
  const [raidFilter,   setRaidFilter]   = useState('');
  const [showRaidForm, setShowRaidForm] = useState(false);
  const [raidForm,     setRaidForm]     = useState({ type: 'Risk', title: '', description: '', impact: '', probability: '', status: 'Open', raisedDate: '' });
  const [raidSaving,   setRaidSaving]   = useState(false);

  // Financial
  const [financial,       setFinancial]       = useState(null);
  const [finLoading,      setFinLoading]       = useState(false);
  const [showFinEdit,     setShowFinEdit]      = useState(false);
  const [finForm,         setFinForm]          = useState({ currency: 'INR', budgetAmount: '', actualCost: '', invoicedAmount: '', paymentTerms: '', notes: '' });
  const [finSaving,       setFinSaving]        = useState(false);

  // Closure
  const [closure,      setClosure]      = useState(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [checklist,    setChecklist]    = useState([]);
  const [closureNotes, setClosureNotes] = useState('');
  const [closureSaving,setClosureSaving]= useState(false);
  const [closing,      setClosing]      = useState(false);

  // ── Load core data ──────────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(clearActiveProject());
    dispatch(fetchProjectById(id));
  }, [dispatch, id]);

  useEffect(() => {
    // getUsersApi (org-wide directory) is admin/manager/senior_manager-only server
    // side — fetching it unconditionally 403'd for every other role, and since the
    // axios interceptor toasts EVERY 403 app-wide regardless of how the call site
    // handles the rejection, a plain employee saw an "Access denied" toast on every
    // project they opened, from the very first tab, for data (the Add Member picker)
    // they can't even use. allUsers has a safe fallback to project.members elsewhere.
    if (canManage) {
      getUsersApi({ isActive: true, limit: 200 })
        .then(res => setAllUsers(res.data?.data?.users || res.data?.data || []))
        .catch(() => {});
      api.get('/pm/config/client-orgs')
        .then(res => setClientOrgs(res.data?.data ?? []))
        .catch(() => {});
    }
    getPmStatusesApi()
      .then(res => setPmStatuses(res.data?.data || []))
      .catch(() => {});
    getMemberRolesApi()
      .then(res => setMemberRoles((res.data?.data || []).filter(r => r.isActive)))
      .catch(() => {});
  }, [canManage]);

  // ── Load tab-specific data ──────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    if (activeTab === 'dailylog') {
      getTodayLogApi(id).then(res => setTodayLog(res.data?.data || null)).catch(() => setTodayLog(null));
    }
    if (activeTab === 'documents') {
      setDocsLoading(true);
      getProjectDocumentsApi(id).then(res => setDocs(res.data?.data || [])).catch(() => toast.error('Failed to load documents')).finally(() => setDocsLoading(false));
    }
    if (activeTab === 'status-reports') {
      setSrLoading(true);
      statusReportApi.list(id).then(res => setStatusReports(res.data?.data || [])).catch(() => {}).finally(() => setSrLoading(false));
    }
    if (activeTab === 'raid') {
      setRaidLoading(true);
      raidApi.list(id, raidFilter ? { type: raidFilter } : {}).then(res => setRaidItems(res.data?.data || [])).catch(() => {}).finally(() => setRaidLoading(false));
    }
    if (activeTab === 'financial') {
      setFinLoading(true);
      financialApi.get(id).then(res => { setFinancial(res.data?.data || null); const d = res.data?.data; if (d) setFinForm({ currency: d.currency || 'INR', budgetAmount: d.budgetAmount || '', actualCost: d.actualCost || '', invoicedAmount: d.invoicedAmount || '', paymentTerms: d.paymentTerms || '', notes: d.notes || '' }); }).catch(() => {}).finally(() => setFinLoading(false));
    }
    if (activeTab === 'closure') {
      setCloseLoading(true);
      closureApi.get(id).then(res => { const d = res.data?.data; setClosure(d || null); setChecklist(d?.checklist || []); setClosureNotes(d?.closureNotes || ''); }).catch(() => {}).finally(() => setCloseLoading(false));
    }
  }, [activeTab, id]);

  // Allocation preview fetch
  useEffect(() => {
    if (!showAllocationPreview) return;
    setPreviewLoading(true);
    // No window is sent: the server assesses each member over their own allocation
    // dates (then the project dates, then the next 30 days). Borrowing one member's
    // dates for everyone hid real overloads when that member's dates were bad.
    api.get(`/pm/projects/${id}/allocation-preview`)
      .then(res => setAllocationPreview(res.data?.data ?? []))
      .catch(() => toast.error('Failed to load allocation preview'))
      .finally(() => setPreviewLoading(false));
  }, [showAllocationPreview, id]);

  // Reset allocation preview when navigating to a different project
  useEffect(() => {
    setShowAllocationPreview(false);
    setExceptionModal(null);
    setDrawer(null);
  }, [id]);

  // Close any "Resolve" popover whenever the preview modal closes
  useEffect(() => {
    if (!showAllocationPreview) setPreviewResolveUserId(null);
  }, [showAllocationPreview]);

  // Batch-fetch cross-project availability for all team members when Team tab is active
  useEffect(() => {
    const memberList = project?.members || [];
    if (!id || memberList.length === 0) return;
    setAvailabilityLoading(true);
    api.get(`/pm/projects/${id}/members/availability`)
      .then(res => {
        const data = res.data?.data || [];
        const map = {};
        data.forEach(d => { map[String(d.userId)] = d; });
        setMembersAvailability(map);
        const cap = Number(data.find(d => Number(d.capacity) > 0)?.capacity);
        if (cap > 0) setCapacity(cap);
      })
      .catch(() => {}) // non-fatal — cards render fine without availability
      .finally(() => setAvailabilityLoading(false));
  // Depend on the actual set of userIds, not just count — swapping one member
  // for another keeps the count identical but must still trigger a re-fetch.
  }, [id, (project?.members || []).map(m => m.userId).join(',')]);

  // Monthly utilisation (Team tab only). Re-runs on month change, member set
  // change, or after any allocation mutation (utilTick).
  // GET /pm/utilisation (the team-wide grid) is MGMT_ROLES-only server side —
  // calling it unconditionally 403'd for every other role (an "Access denied"
  // toast every time an employee opened Team Setup — the axios interceptor
  // toasts any 403 app-wide regardless of this call's own .catch). A non-manager
  // gets their OWN utilisation only, via the per-user endpoint every role can
  // call — which is also exactly "employee sees only their own allocation hours".
  const memberUserIdsKey = (project?.members || []).map(m => m.userId).join(',');
  useEffect(() => {
    if (activeTab !== 'team' || !id) return;
    if (canManage && !memberUserIdsKey) return;
    let cancelled = false;
    setUtilLoading(true);

    const request = canManage
      ? api.get('/pm/utilisation', { params: { from: utilMonth, to: utilMonth, userIds: memberUserIdsKey } })
          .then(res => {
            const data = res.data?.data || {};
            const map = {};
            (data.users || []).forEach(u => { map[String(u.userId)] = u.cells?.[0] || null; });
            return { map, meta: data.months?.[0] || null };
          })
      : getUserUtilisationApi(uid, utilMonth)
          .then(res => {
            const r = res.data?.data;
            if (!r) return { map: {}, meta: null };
            const cell = {
              month: utilMonth, totalHours: r.totalHours, totalPct: r.totalPct,
              pmHours: r.pmHours, hdHours: r.hdHours, peakHoursPerDay: r.peakHoursPerDay,
              overDays: r.overDays, isOverAllocated: r.isOverAllocated, band: r.band,
            };
            return { map: { [uid]: cell }, meta: null }; // no team-wide summary banner for a single person
          });

    request
      .then(({ map, meta }) => {
        if (cancelled) return;
        setTeamUtil(map);
        setUtilMonthMeta(meta);
      })
      .catch(() => {}) // non-fatal — chips simply stay hidden
      .finally(() => { if (!cancelled) setUtilLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, id, utilMonth, memberUserIdsKey, utilTick, canManage, uid]);

  // Reload RAID when filter changes
  useEffect(() => {
    if (activeTab === 'raid' && id) {
      setRaidLoading(true);
      raidApi.list(id, raidFilter ? { type: raidFilter } : {}).then(res => setRaidItems(res.data?.data || [])).catch(() => {}).finally(() => setRaidLoading(false));
    }
  }, [raidFilter]);


  // ── Status update ───────────────────────────────────────────────────────────
  const handleStatusChange = async (status) => {
    setStatusUpdating(true);
    try {
      await updateProjectApi(id, { status });
      dispatch(fetchProjectById(id));
      toast.success('Status updated');
    } catch { toast.error('Failed to update status'); }
    finally { setStatusUpdating(false); }
  };

  // ── Team ────────────────────────────────────────────────────────────────────
  const setMemberField = (patch) => {
    setMemberConflict(null); // any input change clears the conflict panel
    setMemberForm(f => ({ ...f, ...patch }));
  };
  const cancelAddMember = () => {
    setMemberConflict(null);
    setAddingMember(false);
  };
  const handleAddMember = async () => {
    if (!memberForm.userId) return toast.error('Select a user');
    try {
      const mode = memberForm.allocationMode === 'total' ? 'total' : 'per_day';
      await addMemberApi(id, {
        userId:         memberForm.userId,
        role:           memberForm.role || undefined,
        allocationMode: mode,
        // Explicit null/'' check — 0.5 is valid and must not be coerced to null
        hoursPerDay:    mode === 'per_day' && memberForm.hoursPerDay != null && memberForm.hoursPerDay !== ''
          ? Number(memberForm.hoursPerDay)
          : null,
        allocationTotalHours: mode === 'total' && memberForm.allocationTotalHours != null && memberForm.allocationTotalHours !== ''
          ? Number(memberForm.allocationTotalHours)
          : null,
        allocationFrom: memberForm.allocationFrom || null,
        allocationTo:   memberForm.allocationTo   || null,
      });
      toast.success('Member added');
      dispatch(fetchProjectById(id));
      bumpUtil();
      setMemberForm({ userId: '', role: '', allocationMode: 'per_day', hoursPerDay: null, allocationTotalHours: null, allocationFrom: null, allocationTo: null });
      setMemberConflict(null);
      setAddingMember(false);
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error(err.response.data?.message || 'Allocation exceeds capacity');
        setMemberConflict(err.response.data?.conflict || null);
        return; // keep the form open so the user can adjust
      }
      toast.error(err.response?.data?.message || 'Failed to add member');
    }
  };

  const handleConfirmHours = async (memberId) => {
    try {
      await api.patch(`/pm/projects/${id}/members/${memberId}/confirm-hours`);
      toast.success('Hours confirmed');
      dispatch(fetchProjectById(id));
      bumpUtil();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to confirm hours'); }
  };
  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this member?')) return;
    try { await removeMemberApi(id, memberId); toast.success('Member removed'); dispatch(fetchProjectById(id)); bumpUtil(); }
    catch { toast.error('Failed to remove member'); }
  };
  // Withdraw a pending exception request — the member row reverts (or disappears if it was new).
  const handleCancelException = async (m) => {
    // The pending request belongs to ONE segment; fall back to the mirrored member-level id.
    const seg = memberSegments(m).find(s => s.exceptionStatus === 'pending') || null;
    const approvalId = seg?.exceptionApprovalId ?? seg?.exceptionApproval?._id ?? seg?.exceptionApproval?.id
      ?? m.exceptionApprovalId ?? m.exceptionApproval?._id ?? m.exceptionApproval?.id;
    if (!approvalId) { toast.error('No pending request found for this member'); return; }
    if (!window.confirm('Withdraw the pending exception request? The allocation goes back to its previous values.')) return;
    try {
      await cancelAllocationExceptionApi(approvalId);
      toast.success('Exception request withdrawn');
      dispatch(fetchProjectById(id)); bumpUtil();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to withdraw request');
    }
  };

  // ── Allocation drawer (replaces the old inline edit forms) ─────────────────
  /** Open the drawer for a project member row (from a card/row click, the grid or the preview modal). */
  const openDrawer = (m, focusSegmentId = null) => {
    const memberId = m?._id ?? m?.id ?? m?.memberId;
    if (!memberId) return;
    setDrawer({ memberId: String(memberId), focusSegmentId: focusSegmentId ?? null });
  };
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const drawerMember = drawer
    ? (project?.members || []).find(m => String(m._id ?? m.id) === drawer.memberId) || null
    : null;
  /** Any segment write inside the drawer / grid → refresh the project + the utilisation chips. */
  const handleAllocationChanged = useCallback(() => {
    dispatch(fetchProjectById(id));
    setUtilTick(t => t + 1); // bumpUtil
  }, [dispatch, id]);
  /** Role edited from the drawer header — the member row keeps role/responsibilities only. */
  const handleDrawerRoleChange = async (role) => {
    if (!drawerMember) return;
    try {
      await updateMemberApi(id, drawerMember._id ?? drawerMember.id, { role: role || null });
      toast.success('Role updated');
      handleAllocationChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to update role');
    }
  };
  /** Grid → drawer. The grid row carries memberId/userId; resolve it to the project member row. */
  const openDrawerFromGrid = (row) => {
    const rowId = row?.memberId ?? row?._id ?? row?.id;
    const m = (project?.members || []).find(pm =>
      (rowId && String(pm._id ?? pm.id) === String(rowId)) || (row?.userId && String(pm.userId) === String(row.userId)));
    if (m) openDrawer(m);
  };

  // ── Allocation exceptions ───────────────────────────────────────────────────
  const userNameById = (uid) => {
    const u = allUsers.find(x => String(x._id ?? x.id) === String(uid));
    return u?.name || (project?.members || []).find(m => String(m.userId) === String(uid))?.user?.name || 'Team member';
  };

  /** Open the modal for the ADD form (new member, no memberId yet). */
  const requestExceptionFromAdd = (conflict) => {
    if (!memberForm.userId) return toast.error('Select a user first');
    const mode = memberForm.allocationMode === 'total' ? 'total' : 'per_day';
    setExceptionModal({
      source: 'add',
      conflict: conflict || memberConflict || null,
      member: {
        userId:   memberForm.userId,
        userName: userNameById(memberForm.userId),
        role:     memberForm.role || undefined,
        allocationMode: mode,
        // For 'total' mode show the derived hrs/day; the POST sends allocationTotalHours
        hoursPerDay: mode === 'per_day' ? memberForm.hoursPerDay : memberDerived.hoursPerDay,
        allocationTotalHours: mode === 'total' ? memberForm.allocationTotalHours : null,
        allocationFrom: memberForm.allocationFrom || null,
        allocationTo:   memberForm.allocationTo   || null,
      },
    });
  };

  /**
   * Open the modal for an EXISTING member row on ONE segment (period).
   *   segment — { _id|segmentId, fromDate, toDate, allocationMode, hoursPerDay, allocationTotalHours }
   *             (the drawer passes an unsaved draft too — its values win over the saved row).
   *   Without a segment the member's mirrored summary is used (older rows).
   */
  const requestExceptionForMember = (m, conflict, segment = null, source = 'preview') => {
    const seg = segment || memberSegments(m)[0] || null;
    const f = {
      role:           m.role || '',
      allocationMode: (seg?.allocationMode ?? m.allocationMode) === 'total' ? 'total' : 'per_day',
      hoursPerDay:    seg?.hoursPerDay ?? m.hoursPerDay,
      allocationTotalHours: seg?.allocationTotalHours ?? m.allocationTotalHours,
      allocationFrom: isoDay(seg?.fromDate ?? seg?.allocationFrom ?? m.allocationFrom),
      allocationTo:   isoDay(seg?.toDate   ?? seg?.allocationTo   ?? m.allocationTo),
    };
    const mode = f.allocationMode;
    const segmentId = seg?._id ?? seg?.segmentId ?? seg?.id ?? null;
    setExceptionModal({
      source,
      conflict: conflict || null,
      member: {
        userId:   m.userId,
        userName: m.user?.name || m.name || userNameById(m.userId),
        memberId: m._id ?? m.id ?? undefined,
        segmentId: segmentId || undefined,
        role:     f.role || undefined,
        allocationMode: mode,
        hoursPerDay: f.hoursPerDay,
        allocationTotalHours: mode === 'total' ? f.allocationTotalHours : null,
        allocationFrom: f.allocationFrom || null,
        allocationTo:   f.allocationTo   || null,
      },
    });
  };

  /** Server accepted the request → the segment now carries exceptionStatus 'pending'. */
  const handleExceptionRequested = () => {
    const src = exceptionModal?.source;
    setExceptionModal(null);
    if (src === 'add') {
      setMemberForm({ userId: '', role: '', allocationMode: 'per_day', hoursPerDay: null, allocationTotalHours: null, allocationFrom: null, allocationTo: null });
      setMemberConflict(null);
      setAddingMember(false);
    }
    if (src === 'preview') { setPreviewResolveUserId(null); setShowAllocationPreview(false); }
    // 'drawer' → the drawer loads its segments only on open, so close it; the row
    // now shows the pending chip and re-opening reloads the periods.
    if (src === 'drawer') setDrawer(null);
    dispatch(fetchProjectById(id));
    bumpUtil();
  };

  /**
   * Suggestion set for a preview row. Prefers the server's `suggestions`
   * (if the preview endpoint carries them) and otherwise derives a best-effort
   * set from the row's conflict ranges.
   */
  const previewSuggestionsFor = (member, cap) => {
    if (member.suggestions) return conflictSuggestions({ suggestions: member.suggestions, remaining: member.remaining });
    const peak  = Number(member.peakHours) || 0;
    const mine  = Number(member.hoursPerDay) || 0;
    const ranges = (member.conflicts || []).slice().sort((a, b) => new Date(a.from) - new Date(b.from));
    const shiftDay = (iso, delta) => {
      const d = new Date(String(iso).slice(0, 10)); d.setDate(d.getDate() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const remaining = Math.max(0, Math.floor((cap - (peak - mine)) * 2) / 2);
    const first = ranges[0]; const last = ranges[ranges.length - 1];
    // Works for a member line (allocationFrom/To) and a segment line (fromDate/toDate)
    const from = isoDay(member.allocationFrom ?? member.fromDate);
    const to   = isoDay(member.allocationTo   ?? member.toDate);
    const shortenTo    = first && from && shiftDay(first.from, -1) >= from ? shiftDay(first.from, -1) : null;
    const nextFreeDate = last && to && shiftDay(last.to, 1) <= to ? shiftDay(last.to, 1) : (last ? shiftDay(last.to, 1) : null);
    return {
      reduceTo: remaining > 0 && remaining < mine ? remaining : null,
      nextFreeDate,
      shortenTo,
      overloadHours: Math.max(0, peak - cap) || null,
    };
  };

  /**
   * "Resolve" in the preview modal → open the allocation drawer for that member
   * on the conflicting segment (there is no inline form any more; the change is
   * applied inside the drawer).
   */
  const resolvePreviewInDrawer = (memberRow, segmentId = null) => {
    setShowAllocationPreview(false);
    setPreviewResolveUserId(null);
    setActiveTab('team');
    openDrawer(memberRow, segmentId);
  };

  // ── Edit project ────────────────────────────────────────────────────────────
  const openEdit = () => {
    setEditForm({
      name:          project.name || '',
      description:   project.description || '',
      purpose:       project.purpose || '',
      clientName:    project.clientName || '',
      clientOrgId:   project.clientOrgId || '',
      // The stored name is "ClientOrg - ProjectName" (same convention as Create
      // Project) — split it so the edit form can offer the same two-field UX:
      // a Client dropdown and a short Project Name input, recombined on save.
      shortName: (() => {
        const prefix = project.clientName ? `${project.clientName} - ` : null;
        return prefix && project.name?.startsWith(prefix) ? project.name.slice(prefix.length) : (project.name || '');
      })(),
      managerId:     project.managerId || '',
      startDate:        project.startDate        ? project.startDate.slice(0, 10)        : '',
      endDate:          project.endDate          ? project.endDate.slice(0, 10)          : '',
      actualStartDate:  project.actualStartDate  ? project.actualStartDate.slice(0, 10)  : '',
      actualEndDate:    project.actualEndDate    ? project.actualEndDate.slice(0, 10)    : '',
      notifyClient:  project.notifyClient ?? false,
      billingType:   project.billingType || 'Non-Billable',
      projectType:   project.projectType || '',
      status:        project.status || 'Yet to Start',
    });
    setShowEdit(true);
  };

  // Auto-open Edit when arriving via ?edit=1 (the Project List card's Edit
  // button) — once project is loaded and the user is actually allowed to edit
  // it. Strips the param right after so a refresh doesn't reopen the modal.
  useEffect(() => {
    if (searchParams.get('edit') === '1' && project && canManage) {
      openEdit();
      searchParams.delete('edit');
      setSearchParams(searchParams, { replace: true });
    }
  }, [project, canManage, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEditSubmit = async () => {
    if (!editForm.shortName?.trim()) return toast.error('Project name is required');
    setEditSaving(true);
    try {
      // Recombine into "ClientOrg - ProjectName" (same convention as Create
      // Project) — shortName is a UI-only field, never sent to the API.
      const fullName = editForm.clientOrgId
        ? `${editForm.clientName} - ${editForm.shortName.trim()}`
        : editForm.shortName.trim();
      // Exclude startDate / endDate (planned dates are locked after creation) and shortName
      const { startDate, endDate, shortName, ...rest } = editForm;
      const updatePayload = { ...rest, name: fullName };
      await updateProjectApi(id, updatePayload);
      toast.success('Project updated');
      setShowEdit(false);
      dispatch(fetchProjectById(id));
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update project'); }
    finally { setEditSaving(false); }
  };

  // ── Documents ───────────────────────────────────────────────────────────────
  const loadDocs = async () => { const res = await getProjectDocumentsApi(id); setDocs(res.data?.data || []); };
  const handleUploadDoc = async () => {
    if (!docFile) return toast.error('Select a file first');
    const fd = new FormData();
    fd.append('file', docFile);
    fd.append('category', docCategory === 'Others' ? (docCategoryOther.trim() || 'Others') : docCategory);
    setUploading(true);
    try { await uploadProjectDocumentApi(id, fd); toast.success('Document uploaded'); setDocFile(null); await loadDocs(); }
    catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };
  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try { await deleteProjectDocumentApi(id, docId); toast.success('Deleted'); setDocs(p => p.filter(d => (d._id || d.id) !== docId)); }
    catch { toast.error('Failed to delete document'); }
  };

  // ── Status Reports ──────────────────────────────────────────────────────────
  const handleCreateSr = async () => {
    if (!srForm.reportDate) return toast.error('Report date is required');
    setSrSaving(true);
    try {
      await statusReportApi.create(id, srForm);
      toast.success('Status report added');
      setShowSrForm(false);
      setSrForm({ reportDate: '', period: 'Weekly', ragStatus: 'Green', summary: '', risks: '', nextSteps: '' });
      const res = await statusReportApi.list(id);
      setStatusReports(res.data?.data || []);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add report'); }
    finally { setSrSaving(false); }
  };
  const handleDeleteSr = async (srId) => {
    if (!window.confirm('Delete this status report?')) return;
    try { await statusReportApi.del(id, srId); setStatusReports(p => p.filter(r => (r._id || r.id) !== srId)); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
  };

  // ── RAID ────────────────────────────────────────────────────────────────────
  const handleCreateRaid = async () => {
    if (!raidForm.title) return toast.error('Title is required');
    setRaidSaving(true);
    try {
      await raidApi.create(id, raidForm);
      toast.success('RAID item added');
      setShowRaidForm(false);
      setRaidForm({ type: 'Risk', title: '', description: '', impact: '', probability: '', status: 'Open', raisedDate: '' });
      const res = await raidApi.list(id, raidFilter ? { type: raidFilter } : {});
      setRaidItems(res.data?.data || []);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add'); }
    finally { setRaidSaving(false); }
  };
  const handleDeleteRaid = async (rId) => {
    if (!window.confirm('Delete this item?')) return;
    try { await raidApi.del(id, rId); setRaidItems(p => p.filter(r => (r._id || r.id) !== rId)); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
  };

  // ── Financial ───────────────────────────────────────────────────────────────
  const handleSaveFinancial = async () => {
    setFinSaving(true);
    try {
      const res = await financialApi.upsert(id, finForm);
      setFinancial(res.data?.data);
      toast.success('Financial details saved');
      setShowFinEdit(false);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setFinSaving(false); }
  };

  // ── Closure ─────────────────────────────────────────────────────────────────
  const handleSaveClosure = async () => {
    setClosureSaving(true);
    try {
      const res = await closureApi.upsert(id, { closureNotes, checklist });
      const d = res.data?.data;
      setClosure(d);
      setChecklist(d?.checklist || checklist);
      toast.success('Closure saved');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setClosureSaving(false); }
  };
  const handleMarkClosed = async () => {
    if (!window.confirm('Mark project as Completed/Closed? This will set project status to Completed.')) return;
    setClosing(true);
    try {
      await closureApi.close(id);
      toast.success('Project marked as closed');
      dispatch(fetchProjectById(id));
      const res2 = await closureApi.get(id);
      const d = res2.data?.data;
      setClosure(d);
      setChecklist(d?.checklist || checklist);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to close'); }
    finally { setClosing(false); }
  };

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (projectLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="h-24 bg-gray-100 rounded-xl" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-gray-700 mb-2">Project not found</p>
        <p className="text-sm text-gray-400 mb-6">{projectError || 'This project may have been deleted or you may not have access.'}</p>
        <button onClick={() => navigate('/pm/projects')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors">
          Back to Projects
        </button>
      </div>
    );
  }

  const today      = new Date().toISOString().slice(0, 10);
  const milestones = project.milestones || [];
  const members    = project.members || [];
  // For progress: use all milestones (default parents + subs)
  const topMs      = milestones.filter(m => !m.parentMilestoneId);
  const total      = topMs.length || milestones.length;
  const completedMs= milestones.filter(m => m.status === 'completed').length;
  const delayedMs  = milestones.filter(m => m.status === 'delayed' || (m.plannedEndDate && m.plannedEndDate < today && m.status !== 'completed')).length;
  const pct        = projectProgress(milestones);   // weighted; subs roll up server-side

  const TABS = [
    { id: 'overview',       label: 'Overview',                   icon: HiOutlineChartBar },
    { id: 'team',           label: `Team Setup (${members.length})`, icon: HiOutlineUsers },
    { id: 'project-plan',   label: 'Project Plan',               icon: HiOutlineFlag },
    // { id: 'status-reports', label: 'Status Reports',             icon: HiOutlineExclamationCircle },
    // { id: 'dailylog',       label: 'Daily Log',                  icon: HiOutlineClipboardList },
    { id: 'raid',           label: 'RAID',                       icon: HiOutlineExclamationCircle },
    // { id: 'financial',      label: 'Financial',                  icon: HiOutlineCash },
    // { id: 'closure',        label: 'Closure',                    icon: HiOutlineCheckCircle },
    { id: 'documents',      label: `Documents`,                  icon: HiOutlinePaperClip },
  ];

  // Status options for dropdown — from config + legacy fallback
  const statusOptions = pmStatuses.length > 0
    ? pmStatuses.map(s => s.name)
    : ['Yet to Start', 'Active', 'On Hold', 'On Track', 'Delayed', 'Completed', 'Cancelled'];

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/pm/projects')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 mt-1 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{project.name}</h1>

            {/* Billing type badge */}
            {project.billingType && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                project.billingType === 'Billable' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {project.billingType === 'Billable' ? '💰 Billable' : '🔧 Non-Billable'}
              </span>
            )}

            {/* Project type chip */}
            {project.projectType && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 flex-shrink-0">
                {project.projectType}
              </span>
            )}

            {/* Status — editable dropdown for managers */}
            {canManage ? (
              <select
                value={project.status || ''}
                onChange={e => handleStatusChange(e.target.value)}
                disabled={statusUpdating}
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}`}
              >
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-700'}`}>
                {project.status || '—'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
            <span>PM: <strong className="text-gray-700">{project.projectManager?.name || '—'}</strong></span>
            {project.accountManager?.name && (
              <span>Acct Mgr: <strong className="text-gray-700">{project.accountManager.name}</strong></span>
            )}
            {project.clientName && <span>Client: <strong className="text-gray-700">{project.clientName}</strong></span>}
            {project.endDate && <span>Due: <strong className="text-gray-700">{fmtDate(project.endDate)}</strong></span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canManage && (
            <button onClick={openEdit} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              <HiOutlinePencil className="w-4 h-4" />Edit
            </button>
          )}
          <button onClick={() => navigate(`/pm/projects/${id}/tasks`)} className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            <HiOutlineViewBoards className="w-4 h-4" />Task Board
          </button>
        </div>
      </div>

      {/* ── Progress Bar ──────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-bold text-emerald-700">{pct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full">
          <div className="h-3 bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-6 mt-3 text-xs text-gray-500">
          <span><strong className="text-gray-900">{total}</strong> Milestones</span>
          <span><strong className="text-emerald-600">{completedMs}</strong> Completed</span>
          <span><strong className="text-blue-600">{milestones.filter(m => m.status === 'in_progress').length}</strong> In Progress</span>
          <span><strong className="text-red-600">{delayedMs}</strong> Delayed</span>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-0.5 border-b border-gray-200 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap
              ${activeTab === t.id ? 'text-emerald-700 border-emerald-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
          >
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: OVERVIEW ════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {project.description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-gray-700">{project.description}</p>
              </div>
            )}
            {project.purpose && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Purpose / Objective</p>
                <p className="text-sm text-gray-700">{project.purpose}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-50">
              {[
                ['Planned Start', fmtDate(project.startDate)],
                ['Planned End',   fmtDate(project.endDate)],
                ['Client',        project.clientName || '—'],
                ['Notify Client', project.notifyClient ? 'Yes' : 'No'],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{l}</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Milestone Timeline quick view */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Milestone Timeline</h3>
              <button onClick={() => navigate(`/pm/projects/${id}/gantt`)} className="text-xs text-emerald-600 hover:underline">Full Gantt View →</button>
            </div>
            {milestones.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No milestones yet — go to Project Plan tab</p>
            ) : (
              <div className="space-y-2">
                {milestones.filter(m => !m.parentMilestoneId).map(m => {
                  const isDelayed = m.plannedEndDate && m.plannedEndDate < today && m.status !== 'completed';
                  return (
                    <div key={m._id || m.id} className="flex items-center gap-3">
                      <div className="w-1/3 text-xs text-gray-700 truncate font-medium">{m.name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize whitespace-nowrap ${MS_STATUS_COLORS[m.status] || 'bg-gray-100'}`}>
                        {m.status?.replace(/_/g, ' ')}
                      </span>
                      {m.weightPercentage != null && (
                        <span className="text-xs text-gray-400">{m.weightPercentage}%</span>
                      )}
                      <div className="flex-1 h-2 bg-gray-100 rounded-full">
                        <div className={`h-2 rounded-full ${isDelayed ? 'bg-red-400' : m.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-400'}`}
                          style={{ width: `${m.completionPercentage || 0}%` }} />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{m.completionPercentage || 0}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ TAB: TEAM ════════════════════════════════════════════════════════ */}
      {activeTab === 'team' && (
        <>
          <AllocationApprovalPanel projectId={id} canManage={canManage} />
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Team Members</h3>
              {(project.accountManager || project.projectManager) && (
                <div className="flex gap-4 mt-1 text-xs text-gray-500">
                  {project.projectManager && <span>PM: <strong className="text-gray-700">{project.projectManager.name}</strong></span>}
                  {project.accountManager && <span>Account Mgr: <strong className="text-gray-700">{project.accountManager.name}</strong></span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* List (members) | Grid (person × month) */}
              <div className="flex items-center rounded-md border border-gray-200 overflow-hidden text-xs font-medium" role="tablist" aria-label="Team view">
                <button onClick={() => handleTeamModeToggle('list')} role="tab" aria-selected={teamMode === 'list'}
                  className={`px-3 py-1.5 transition ${teamMode === 'list' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  List
                </button>
                <button onClick={() => handleTeamModeToggle('grid')} role="tab" aria-selected={teamMode === 'grid'}
                  className={`px-3 py-1.5 transition ${teamMode === 'grid' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                  Grid
                </button>
              </div>
              {/* Card / List layout toggle (list mode only) */}
              {teamMode === 'list' && (
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
                  <button onClick={() => handleTeamViewToggle('list')} title="List view"
                    className={`px-2.5 py-1.5 text-sm transition ${teamView === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                    ☰
                  </button>
                  <button onClick={() => handleTeamViewToggle('card')} title="Card view"
                    className={`px-2.5 py-1.5 text-sm transition ${teamView === 'card' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                    ⊞
                  </button>
                </div>
              )}
              <button
                onClick={() => setShowAllocationPreview(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1.5 font-medium"
              >
                📊 Preview Allocation
              </button>
              {canManage && (
                <button onClick={() => setAddingMember(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                  <HiOutlineUserAdd className="w-3.5 h-3.5" /> Add Member
                </button>
              )}
            </div>
          </div>
          {addingMember && (
            <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
              <p className="text-xs font-semibold text-blue-700 mb-3">Add Team Member</p>
              {/* Row 1 — Member | Role */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Member <span className="text-red-500">*</span></label>
                  <select
                    value={memberForm.userId}
                    onChange={e => setMemberField({ userId: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select member…</option>
                    {allUsers.filter(u => !members.some(m => m.userId === (u._id || u.id))).map(u => (
                      <option key={u._id || u.id} value={u._id || u.id}>{u.name} ({u.role?.replace(/_/g,' ')})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Role in Project</label>
                  <select
                    value={memberForm.role}
                    onChange={e => setMemberField({ role: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select role…</option>
                    {memberRoles.map(r => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Row 2 — Hours / day | From Date | To Date — same 3-col grid */}
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <AllocationTypeInput
                    value={memberForm}
                    onChange={next => setMemberField({
                      allocationMode:       next.allocationMode,
                      hoursPerDay:          next.hoursPerDay ?? null,
                      allocationTotalHours: next.allocationTotalHours ?? null,
                    })}
                    from={memberForm.allocationFrom || null}
                    to={memberForm.allocationTo || null}
                    capacity={capacity}
                    defaultMode="per_day"
                    onDerived={setMemberDerived}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">From Date</label>
                  <input
                    type="date"
                    value={memberForm.allocationFrom || ''}
                    onChange={e => setMemberField({ allocationFrom: e.target.value || null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">To Date</label>
                  <input
                    type="date"
                    value={memberForm.allocationTo || ''}
                    onChange={e => setMemberField({ allocationTo: e.target.value || null })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {/* 409 conflict panel — server said the requested hours don't fit */}
              <ConflictPanel
                conflict={memberConflict}
                capacity={capacity}
                onApply={(patch) => { setMemberForm(f => ({ ...f, ...patch })); setMemberConflict(null); }}
                onRequestException={() => requestExceptionFromAdd(memberConflict)}
              />
              {/* Availability card — shows when a person is selected */}
              {memberForm.userId && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <ResourceAvailabilityCard
                    userId={memberForm.userId}
                    fromDate={memberForm.allocationFrom || null}
                    toDate={memberForm.allocationTo || null}
                    newHoursPerDay={memberDerived.hoursPerDay != null ? Number(memberDerived.hoursPerDay) : null}
                    onSuggestionSelect={(suggestion) => {
                      if (suggestion.type === 'reduce_hours' && suggestion.suggestedHoursPerDay != null) {
                        setMemberField({ allocationMode: 'per_day', hoursPerDay: Number(suggestion.suggestedHoursPerDay), allocationTotalHours: null });
                      }
                      if (suggestion.type === 'shift_dates' && suggestion.suggestedFromDate) {
                        setMemberField({ allocationFrom: suggestion.suggestedFromDate });
                      }
                    }}
                    // request_approval → open the exception modal (C8). The card's numbers
                    // become a synthetic `conflict` so the modal can show peak vs capacity.
                    onRequestException={(ctx) => requestExceptionFromAdd({
                      ...(memberConflict || {}),
                      capacity:  ctx.capacity,
                      peak:      ctx.projectedPeak,
                      remaining: ctx.freeHours,
                      suggestions: {
                        ...(memberConflict?.suggestions || {}),
                        overloadHours: Math.max(0, (Number(ctx.projectedPeak) || 0) - (Number(ctx.capacity) || 0)),
                        ...(ctx.nextFreeDate && !memberConflict?.suggestions?.nextFreeDate ? { nextFreeDate: ctx.nextFreeDate } : {}),
                      },
                    })}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={handleAddMember} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">Add Member</button>
                <button onClick={cancelAddMember} className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-sm transition-colors">Cancel</button>
              </div>
            </div>
          )}
          {/* Summary bar */}
          {members.length > 0 && (
            <div className="px-5 pt-4">
              <div className="flex items-center gap-4 p-3 bg-gray-50 border border-gray-100 rounded-lg mb-4 text-sm">
                <span className="text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">
                  {(() => {
                    const withHours = members.filter(m => m.hoursPerDay != null);
                    if (withHours.length === 0) return <>Avg <span className="font-medium text-gray-700">—</span></>;
                    const avg = withHours.reduce((s, m) => s + Number(m.hoursPerDay), 0) / withHours.length;
                    return (
                      <>Avg <span className="font-medium text-gray-700">{fmtH(avg)} h/day</span>
                        <span className="text-gray-400"> · {Math.round(avg / capacity * 100)}%</span></>
                    );
                  })()}
                </span>
              </div>

              {/* Monthly utilisation strip — selected calendar month, all projects + helpdesk */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 -mt-2 mb-4 bg-white border border-gray-100 rounded-lg text-xs text-gray-500">
                <label className="flex items-center gap-2">
                  <span className="font-medium text-gray-600">Month</span>
                  <input
                    type="month"
                    value={utilMonth}
                    onChange={e => { if (e.target.value) setUtilMonth(e.target.value); }}
                    className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </label>
                {utilLoading && !utilMonthMeta ? (
                  <div className="h-3 w-40 bg-gray-100 rounded animate-pulse" />
                ) : utilMonthMeta ? (
                  <>
                    <span>
                      <span className="font-medium text-gray-700">{utilMonthMeta.workingDays}</span> working days
                      <span className="text-gray-300"> · </span>
                      <span className="font-medium text-gray-700">{fmtH(utilMonthMeta.totalHours)}h</span> capacity per person
                    </span>
                    <span className="flex items-center gap-1.5 ml-auto">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
                        Avg {Math.round(Number(utilMonthMeta.summary?.avgPct) || 0)}%
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${(utilMonthMeta.summary?.overCount || 0) > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                        {utilMonthMeta.summary?.overCount || 0} over
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${(utilMonthMeta.summary?.highCount || 0) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                        {utilMonthMeta.summary?.highCount || 0} high
                      </span>
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {members.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No team members assigned</div>
          ) : teamMode === 'grid' ? (
            /* ── Person × month grid ── */
            <div className="p-5">
              <AllocationGrid
                projectId={id}
                project={project}
                capacity={capacity}
                canManage={canManage}
                onOpenMember={(memberRow) => openDrawerFromGrid(memberRow)}
              />
            </div>
          ) : teamView === 'card' ? (
            /* ── Card view ── */
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map(m => {
                const mid = m._id || m.id;
                const isPendingException = memberHasPendingException(m); // read-only until decided
                const hasAllocation = memberSegments(m).length > 0;
                return (
                  <div
                    key={mid}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDrawer(m)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(m); } }}
                    title="Open allocation"
                    className={`bg-white border rounded-xl p-4 hover:shadow-md transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isPendingException ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'}`}
                  >
                    {/* Header: avatar + name + role */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                          {m.user?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{m.user?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{m.role || m.user?.role?.replace(/_/g, ' ')}</p>
                          <ExceptionChip member={m} compact />
                        </div>
                      </div>
                      {canManage && !isPendingException && (
                        <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openDrawer(m)}
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
                            title="Manage allocation periods"
                          >
                            Manage
                          </button>
                          <button type="button" onClick={() => handleRemoveMember(mid)} className="text-xs text-red-500 hover:text-red-700 transition-colors" title="Remove">✕</button>
                        </div>
                      )}
                      {canManage && isPendingException && (
                        <span className="text-[10px] text-amber-700 flex-shrink-0 flex items-center gap-2" title="Locked while the exception request is pending" onClick={e => e.stopPropagation()}>
                          🔒 awaiting approval
                          <button type="button" onClick={() => handleCancelException(m)} className="underline hover:text-amber-900">Withdraw</button>
                        </span>
                      )}
                    </div>

                    {/* Allocation — segment timeline + summary */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1 gap-2">
                        <span>Allocation</span>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`font-medium truncate ${hasAllocation ? 'text-gray-700' : 'text-gray-400 italic'}`}>{segmentSummary(m)}</span>
                          {hasAllocation && memberHasEstimate(m) && (
                            <>
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">estimated</span>
                              {canManage && !isPendingException && (
                                <button type="button" onClick={e => { e.stopPropagation(); handleConfirmHours(mid); }} className="text-[10px] text-blue-600 hover:text-blue-800 underline" title="Confirm all periods">Confirm</button>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      <SegmentTimeline member={m} project={project} />
                    </div>

                    {/* Designation */}
                    {m.user?.designation && (
                      <div className="mt-2 text-xs text-gray-400">{m.user.designation}</div>
                    )}

                    {/* Status badge */}
                    {m.allocationStatus && m.allocationStatus !== 'active' && (
                      <div className={`mt-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.allocationStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                        m.allocationStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {m.allocationStatus}
                      </div>
                    )}

                    {/* ── Cross-project availability (batch fetched) ── */}
                    {(() => {
                      const avail = membersAvailability[String(m.userId)];
                      if (!avail) return availabilityLoading ? (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <div className="h-2 bg-gray-100 rounded animate-pulse w-full mb-1" />
                          <div className="h-2 bg-gray-100 rounded animate-pulse w-2/3" />
                        </div>
                      ) : null;

                      if (avail.hasNoData) return (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <span className="text-xs text-gray-400">&#9898; No cross-project data</span>
                        </div>
                      );

                      const cap   = Number(avail.capacity) > 0 ? Number(avail.capacity) : capacity;
                      const peak  = Number(avail.peakHours) || 0;
                      const free  = avail.freeHours != null ? Number(avail.freeHours) : Math.max(0, cap - peak);
                      const ratio = peak / cap;
                      const barColor = avail.isOverAllocated ? 'bg-red-500' :
                                       ratio > 0.8 ? 'bg-amber-500' : 'bg-emerald-500';
                      const pct = Math.min(ratio, 1) * 100;

                      return (
                        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Overall capacity</span>
                            <span className={`text-xs font-semibold ${avail.isOverAllocated ? 'text-red-600' : ratio > 0.8 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {fmtH(peak)}h / {fmtH(cap)}h busiest day
                            </span>
                          </div>
                          {/* Capacity bar */}
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          {/* Stats row */}
                          <div className="flex items-center justify-between text-xs text-gray-400">
                            <span>{fmtH(Math.max(0, free))}h free &middot; {avail.projectCount} project{avail.projectCount !== 1 ? 's' : ''}</span>
                            {avail.nextFreeDate && (
                              <span>Free from {avail.nextFreeDate}</span>
                            )}
                          </div>
                          {/* Over-allocated warning */}
                          {avail.isOverAllocated && (
                            <div className="flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                              <span>&#9888;</span>
                              <span>Over by {fmtH(peak - cap)}h on the busiest day</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ── Selected-month utilisation (all projects + helpdesk) ── */}
                    {(teamUtil[String(m.userId)] || utilLoading) && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{monthLabel(utilMonth)}</span>
                        <MonthUtilChip cell={teamUtil[String(m.userId)]} loading={utilLoading} month={utilMonth} compact />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── List view (enhanced) ── */
            <div className="divide-y divide-gray-50">
              {members.map((m, idx) => {
                const mid = m._id || m.id;
                const isPendingException = memberHasPendingException(m); // read-only until decided
                const hasAllocation = memberSegments(m).length > 0;
                return (
                  <div
                    key={mid}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDrawer(m)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(m); } }}
                    title="Open allocation"
                    className={`px-5 py-3 cursor-pointer hover:bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500 ${isPendingException ? 'bg-amber-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {m.user?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                          {m.user?.name}
                          <ExceptionChip member={m} compact />
                        </p>
                        <p className="text-xs text-gray-500">{m.user?.email} · {m.user?.role?.replace(/_/g, ' ')}</p>
                        {m.role && <p className="text-xs text-emerald-700 mt-0.5">{m.role}</p>}
                      </div>
                      {/* Segment timeline + summary */}
                      <div className="flex-shrink-0 w-56 text-right">
                        <div className="flex items-center justify-end gap-1.5 mb-1 min-w-0">
                          <span className={`text-xs font-semibold truncate ${hasAllocation ? 'text-emerald-700' : 'text-gray-400 italic font-normal'}`}>{segmentSummary(m)}</span>
                          {hasAllocation && memberHasEstimate(m) && (
                            <>
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">estimated</span>
                              {canManage && !isPendingException && (
                                <button type="button" onClick={e => { e.stopPropagation(); handleConfirmHours(mid); }} className="text-[10px] text-blue-600 hover:text-blue-800 underline" title="Confirm all periods">Confirm</button>
                              )}
                            </>
                          )}
                        </div>
                        <SegmentTimeline member={m} project={project} compact />
                        {m.allocationStatus && m.allocationStatus !== 'active' && (
                          <div className={`mt-1 inline-block px-1.5 py-0.5 rounded-full text-xs font-medium ${
                            m.allocationStatus === 'pending' ? 'bg-amber-100 text-amber-700' :
                            m.allocationStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {m.allocationStatus}
                          </div>
                        )}
                      </div>
                      {/* Overall cross-project capacity */}
                      {(() => {
                        const avail = membersAvailability[String(m.userId)];
                        if (!avail || avail.hasNoData) return (
                          <div className="flex-shrink-0 w-28 text-center">
                            {availabilityLoading
                              ? <div className="h-2 bg-gray-100 rounded animate-pulse w-full" />
                              : <span className="text-xs text-gray-400">—</span>}
                          </div>
                        );
                        const cap   = Number(avail.capacity) > 0 ? Number(avail.capacity) : capacity;
                        const peak  = Number(avail.peakHours) || 0;
                        const free  = avail.freeHours != null ? Number(avail.freeHours) : Math.max(0, cap - peak);
                        const ratio = peak / cap;
                        return (
                          <div className="flex-shrink-0 w-32" title={`${fmtH(peak)}h / ${fmtH(cap)}h busiest day · ${fmtH(Math.max(0, free))}h free · ${avail.projectCount} project${avail.projectCount !== 1 ? 's' : ''}`}>
                            <p className="text-xs text-gray-400 mb-1">Overall</p>
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${avail.isOverAllocated ? 'bg-red-400' : ratio > 0.8 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                  style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                              </div>
                              <span className={`text-xs font-medium whitespace-nowrap ${avail.isOverAllocated ? 'text-red-600' : 'text-gray-600'}`}>
                                {fmtH(peak)}h / {fmtH(cap)}h
                              </span>
                            </div>
                            {avail.isOverAllocated && (
                              <p className="text-[10px] text-red-600 mt-0.5">Over by {fmtH(peak - cap)}h</p>
                            )}
                          </div>
                        );
                      })()}
                      {/* Selected-month utilisation (all projects + helpdesk) */}
                      <div className="flex-shrink-0 w-32">
                        <p className="text-xs text-gray-400 mb-1">{monthLabel(utilMonth)}</p>
                        <MonthUtilChip cell={teamUtil[String(m.userId)]} loading={utilLoading} month={utilMonth} compact />
                      </div>
                      {canManage && !isPendingException && (
                        <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openDrawer(m)}
                            className="text-xs text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
                            title="Manage allocation periods"
                          >
                            Manage allocation
                          </button>
                          <button type="button" onClick={() => handleRemoveMember(mid)} className="text-xs text-red-500 hover:text-red-700 transition-colors">Remove</button>
                        </div>
                      )}
                      {canManage && isPendingException && (
                        <span className="text-[10px] text-amber-700 flex-shrink-0 whitespace-nowrap flex items-center gap-2" title="Locked while the exception request is pending" onClick={e => e.stopPropagation()}>
                          🔒 awaiting approval
                          <button type="button" onClick={() => handleCancelException(m)} className="underline hover:text-amber-900">Withdraw</button>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ ALLOCATION DRAWER (segments / periods of one member) ═══════════ */}
        <AllocationDrawer
          open={!!drawer && !!drawerMember}
          onClose={closeDrawer}
          projectId={id}
          project={project}
          member={drawerMember}
          capacity={capacity}
          canManage={canManage}
          memberRoles={memberRoles}
          focusSegmentId={drawer?.focusSegmentId ?? null}
          onRoleChange={handleDrawerRoleChange}
          onRequestException={(segment, conflict) => drawerMember && requestExceptionForMember(drawerMember, conflict, segment, 'drawer')}
          onChanged={handleAllocationChanged}
        />
        </>
      )}

      {/* ═══ TAB: PROJECT PLAN ════════════════════════════════════════════════ */}
      {activeTab === 'project-plan' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Manage milestone structure, assign weightings, and track sub-tasks.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/pm/projects/${id}/gantt`)} className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                Gantt View
              </button>
              {/* This "Project Plan" tab is read-only — the actual editable page
                  (Milestone Board) is what this button opens. Not canManage-gated
                  any more: a non-manager who's accountable for a sub-milestone (or
                  just a team member adding/removing subs) needs to reach it too —
                  milestone.routes.js / milestone.service.js are the real gate on
                  what they can actually do once there. */}
              <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                <HiOutlineFlag className="w-4 h-4" />{canManage ? 'Manage Milestones' : 'View Milestones'}
              </button>
            </div>
          </div>

          {milestones.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
              <HiOutlineFlag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No milestones found</p>
              <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="mt-3 text-sm text-emerald-600 hover:underline">Open Milestone Manager</button>
            </div>
          ) : (
            <div className="space-y-3">
              {milestones.filter(m => !m.parentMilestoneId).map((m, idx) => {
                const subs = milestones.filter(s => s.parentMilestoneId && String(s.parentMilestoneId) === String(m._id || m.id));
                const isDelayed = m.plannedEndDate && m.plannedEndDate < today && m.status !== 'completed';
                return (
                  <div key={m._id || m.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Default milestone header */}
                    <div className={`flex items-center gap-4 px-5 py-3.5 ${m.isDefault ? 'bg-gray-50 border-b border-gray-100' : ''}`}>
                      <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{m.name}</span>
                          {m.isDefault && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">Default</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-gray-400">
                          {m.weightPercentage != null
                            ? <span className="text-emerald-600 font-semibold">{m.weightPercentage}%</span>
                            : m.minPct != null && <span className="text-gray-400">Range: {m.minPct}–{m.maxPct}%</span>
                          }
                          {m.plannedStartDate && <span>{fmtDate(m.plannedStartDate)}</span>}
                          {m.plannedEndDate && <span className={isDelayed ? 'text-red-500 font-semibold' : ''}>→ {fmtDate(m.plannedEndDate)}</span>}
                          {(m.actualStartDate || m.actualEndDate) && (
                            <div className="flex items-center gap-1 basis-full text-xs text-emerald-600">
                              <span>✓</span>
                              {m.actualStartDate && <span>{fmtDate(m.actualStartDate)}</span>}
                              {m.actualEndDate && <span>→ {fmtDate(m.actualEndDate)}</span>}
                            </div>
                          )}
                          {m.accountableUser && <span>👤 {m.accountableUser.name}</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MS_STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-600'}`}>
                        {m.status?.replace(/_/g, ' ')}
                      </span>
                      {m.completionPercentage != null && (
                        <div className="flex items-center gap-1.5 w-24">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full">
                            <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${m.completionPercentage}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{m.completionPercentage}%</span>
                        </div>
                      )}
                    </div>

                    {/* Sub-milestones */}
                    {subs.length > 0 && (
                      <div className="divide-y divide-gray-50">
                        {subs.map(s => {
                          const sDelayed = s.plannedEndDate && s.plannedEndDate < today && s.status !== 'completed';
                          return (
                            <div key={s._id || s.id} className="flex items-center gap-4 pl-12 pr-5 py-2.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800">{s.name}</p>
                                <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-gray-400">
                                  {s.weightPercentage != null && (
                                    <span title="Equal share of the milestone, set automatically">
                                      {m.weightPercentage != null
                                        ? `${Math.round(Number(m.weightPercentage) * Number(s.weightPercentage)) / 100}% of project · `
                                        : ''}
                                      {Number(s.weightPercentage)}% of milestone
                                    </span>
                                  )}
                                  {s.plannedStartDate && <span>{fmtDate(s.plannedStartDate)}</span>}
                                  {s.plannedEndDate && <span className={sDelayed ? 'text-red-500' : ''}>→ {fmtDate(s.plannedEndDate)}</span>}
                                  {(s.actualStartDate || s.actualEndDate) && (
                                    <div className="flex items-center gap-1 basis-full text-xs text-emerald-600">
                                      <span>✓</span>
                                      {s.actualStartDate && <span>{fmtDate(s.actualStartDate)}</span>}
                                      {s.actualEndDate && <span>→ {fmtDate(s.actualEndDate)}</span>}
                                    </div>
                                  )}
                                  {s.accountableUser && <span>👤 {s.accountableUser.name}</span>}
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MS_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-600'}`}>
                                {s.status?.replace(/_/g, ' ')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: STATUS REPORTS ══════════════════════════════════════════════ */}
      {activeTab === 'status-reports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Weekly / bi-weekly project health reports with RAG status</p>
            {canManage && (
              <button onClick={() => setShowSrForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                <HiOutlinePlus className="w-4 h-4" /> Add Report
              </button>
            )}
          </div>

          {showSrForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">New Status Report</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Report Date *</label>
                  <input type="date" value={srForm.reportDate} onChange={e => setSrForm(f => ({ ...f, reportDate: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Period</label>
                  <select value={srForm.period} onChange={e => setSrForm(f => ({ ...f, period: e.target.value }))} className={inputCls}>
                    {['Weekly','Bi-Weekly','Monthly'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">RAG Status</label>
                  <select value={srForm.ragStatus} onChange={e => setSrForm(f => ({ ...f, ragStatus: e.target.value }))} className={inputCls}>
                    {['Green','Amber','Red'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Summary</label>
                <textarea rows={2} value={srForm.summary} onChange={e => setSrForm(f => ({ ...f, summary: e.target.value }))} className={inputCls} placeholder="Overall project status summary..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Risks / Issues</label>
                  <textarea rows={2} value={srForm.risks} onChange={e => setSrForm(f => ({ ...f, risks: e.target.value }))} className={inputCls} placeholder="Current risks..." />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Next Steps</label>
                  <textarea rows={2} value={srForm.nextSteps} onChange={e => setSrForm(f => ({ ...f, nextSteps: e.target.value }))} className={inputCls} placeholder="Planned next actions..." />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSrForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleCreateSr} disabled={srSaving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {srSaving ? 'Saving…' : 'Save Report'}
                </button>
              </div>
            </div>
          )}

          {srLoading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : statusReports.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <HiOutlineExclamationCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No status reports yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {statusReports.map(r => (
                <div key={r._id || r.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${RAG_COLORS[r.ragStatus] || 'bg-gray-100 text-gray-600'}`}>{r.ragStatus}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{fmtDate(r.reportDate)}</p>
                        <p className="text-xs text-gray-400">{r.period} · by {r.createdBy?.name || '—'}</p>
                      </div>
                    </div>
                    {canManage && (
                      <button onClick={() => handleDeleteSr(r._id || r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {r.summary && <p className="text-sm text-gray-700 mb-2">{r.summary}</p>}
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                    {r.risks && <div><span className="font-semibold text-red-500 uppercase">Risks: </span>{r.risks}</div>}
                    {r.nextSteps && <div><span className="font-semibold text-blue-500 uppercase">Next Steps: </span>{r.nextSteps}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: DAILY LOG ══════════════════════════════════════════════════ */}
      {activeTab === 'dailylog' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Today's status report for this project</p>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/pm/projects/${id}/daily-log`)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                {todayLog ? "Update Today's Log" : "Submit Today's Log"}
              </button>
              <button onClick={() => navigate(`/pm/projects/${id}/daily-logs`)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">View History</button>
            </div>
          </div>
          {todayLog ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{new Date(todayLog.reportDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{todayLog.generatedBy === 'auto' ? 'Auto-generated' : `By ${todayLog.createdBy?.name || 'Unknown'}`}</p>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full capitalize ${
                  todayLog.overallStatus === 'on_track' ? 'bg-emerald-100 text-emerald-700' :
                  todayLog.overallStatus === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                  todayLog.overallStatus === 'delayed' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                }`}>{todayLog.overallStatus?.replace(/_/g, ' ')}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[['Completed Today', todayLog.completedTasks, 'text-emerald-600'],['Ongoing Tasks', todayLog.ongoingTasks, 'text-blue-600'],['Blockers / Issues', todayLog.blockers, 'text-red-600'],['Upcoming Work', todayLog.upcomingWork, 'text-orange-600'],['Notes', todayLog.notes, 'text-gray-600']].filter(([,v]) => v).map(([label, val, color]) => (
                  <div key={label}>
                    <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <HiOutlineClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No log submitted for today</p>
              <button onClick={() => navigate(`/pm/projects/${id}/daily-log`)} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">Submit Now</button>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: RAID ════════════════════════════════════════════════════════ */}
      {activeTab === 'raid' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500">Risks, Assumptions, Issues, Dependencies</p>
              <div className="flex gap-1">
                {['', 'Risk', 'Assumption', 'Issue', 'Dependency'].map(t => (
                  <button key={t} onClick={() => setRaidFilter(t)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${raidFilter === t ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {t || 'All'}
                  </button>
                ))}
              </div>
            </div>
            {canManage && (
              <button onClick={() => setShowRaidForm(true)} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                <HiOutlinePlus className="w-4 h-4" /> Add Item
              </button>
            )}
          </div>

          {showRaidForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">New RAID Item</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Type *</label>
                  <select value={raidForm.type} onChange={e => setRaidForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                    {['Risk','Assumption','Issue','Dependency'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Title *</label>
                  <input value={raidForm.title} onChange={e => setRaidForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Brief title for this item" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                <textarea rows={2} value={raidForm.description} onChange={e => setRaidForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Impact</label>
                  <select value={raidForm.impact} onChange={e => setRaidForm(f => ({ ...f, impact: e.target.value }))} className={inputCls}>
                    <option value="">—</option>
                    {['Low','Medium','High','Critical'].map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Probability</label>
                  <select value={raidForm.probability} onChange={e => setRaidForm(f => ({ ...f, probability: e.target.value }))} className={inputCls}>
                    <option value="">—</option>
                    {['Low','Medium','High'].map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                  <select value={raidForm.status} onChange={e => setRaidForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    {['Open','In Progress','Closed','Deferred'].map(v => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Raised Date</label>
                  <input type="date" value={raidForm.raisedDate} onChange={e => setRaidForm(f => ({ ...f, raisedDate: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowRaidForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleCreateRaid} disabled={raidSaving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {raidSaving ? 'Saving…' : 'Add Item'}
                </button>
              </div>
            </div>
          )}

          {raidLoading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : raidItems.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
              <HiOutlineExclamationCircle className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No RAID items yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Impact</th>
                    <th className="px-4 py-3 text-left">Probability</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Raised</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {raidItems.map(r => (
                    <tr key={r._id || r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RAID_TYPE_COLORS[r.type] || 'bg-gray-100 text-gray-600'}`}>{r.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.title}</p>
                        {r.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{r.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.impact || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{r.probability || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'Open' ? 'bg-orange-100 text-orange-700' : r.status === 'Closed' || r.status === 'Deferred' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{fmtDate(r.raisedDate)}</td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <button onClick={() => handleDeleteRaid(r._id || r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: FINANCIAL ══════════════════════════════════════════════════ */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          {finLoading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Financial Summary</h3>
                {canManage && (
                  <button onClick={() => setShowFinEdit(f => !f)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                    <HiOutlinePencil className="w-3.5 h-3.5" />{showFinEdit ? 'Cancel' : 'Edit'}
                  </button>
                )}
              </div>

              {showFinEdit ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Currency</label>
                      <select value={finForm.currency} onChange={e => setFinForm(f => ({ ...f, currency: e.target.value }))} className={inputCls}>
                        {['INR','USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Budget Amount</label>
                      <input type="number" value={finForm.budgetAmount} onChange={e => setFinForm(f => ({ ...f, budgetAmount: e.target.value }))} className={inputCls} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Actual Cost</label>
                      <input type="number" value={finForm.actualCost} onChange={e => setFinForm(f => ({ ...f, actualCost: e.target.value }))} className={inputCls} placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Invoiced Amount</label>
                      <input type="number" value={finForm.invoicedAmount} onChange={e => setFinForm(f => ({ ...f, invoicedAmount: e.target.value }))} className={inputCls} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Payment Terms</label>
                    <input value={finForm.paymentTerms} onChange={e => setFinForm(f => ({ ...f, paymentTerms: e.target.value }))} className={inputCls} placeholder="e.g. Milestone-based, Net-30" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
                    <textarea rows={2} value={finForm.notes} onChange={e => setFinForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setShowFinEdit(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                    <button onClick={handleSaveFinancial} disabled={finSaving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {finSaving ? 'Saving…' : 'Save Financial Details'}
                    </button>
                  </div>
                </div>
              ) : financial ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  {[
                    ['Budget', financial.budgetAmount],
                    ['Actual Cost', financial.actualCost],
                    ['Invoiced', financial.invoicedAmount],
                    ['Currency', financial.currency],
                  ].map(([label, value]) => {
                    const isAmt = typeof value === 'number' || (value && !isNaN(value));
                    return (
                      <div key={label} className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
                        <p className="text-xl font-bold text-gray-900">
                          {isAmt ? new Intl.NumberFormat('en-IN').format(parseFloat(value) || 0) : (value || '—')}
                        </p>
                      </div>
                    );
                  })}
                  {financial.paymentTerms && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Payment Terms</p>
                      <p className="text-sm text-gray-700">{financial.paymentTerms}</p>
                    </div>
                  )}
                  {financial.notes && (
                    <div className="col-span-4">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Notes</p>
                      <p className="text-sm text-gray-700">{financial.notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <HiOutlineCash className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">No financial details added yet</p>
                  {canManage && <button onClick={() => setShowFinEdit(true)} className="mt-3 text-sm text-emerald-600 hover:underline">Add Financial Details</button>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: CLOSURE ════════════════════════════════════════════════════ */}
      {activeTab === 'closure' && (
        <div className="space-y-4">
          {closeLoading ? (
            <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Project Closure</h3>
                  {closure?.closedAt && (
                    <p className="text-xs text-emerald-600 mt-0.5">✅ Closed on {fmtDate(closure.closedAt)}</p>
                  )}
                </div>
                {canManage && !closure?.closedAt && (
                  <button onClick={handleMarkClosed} disabled={closing} className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                    <HiOutlineCheckCircle className="w-4 h-4" />{closing ? 'Closing…' : 'Mark as Closed'}
                  </button>
                )}
              </div>

              {/* Checklist */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Closure Checklist</p>
                <div className="space-y-2">
                  {checklist.map((item, idx) => (
                    <label key={idx} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${item.checked ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={!!item.checked}
                        onChange={e => setChecklist(prev => prev.map((c, i) => i === idx ? { ...c, checked: e.target.checked } : c))}
                        disabled={!!closure?.closedAt || !canManage}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className={`text-sm ${item.checked ? 'text-emerald-700 line-through' : 'text-gray-700'}`}>{item.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">{checklist.filter(c => c.checked).length} of {checklist.length} completed</p>
              </div>

              {/* Closure Notes */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Closure Notes</label>
                <textarea
                  rows={3}
                  value={closureNotes}
                  onChange={e => setClosureNotes(e.target.value)}
                  disabled={!!closure?.closedAt || !canManage}
                  className={inputCls}
                  placeholder="Lessons learned, handover notes, client sign-off comments..."
                />
              </div>

              {canManage && !closure?.closedAt && (
                <div className="flex justify-end">
                  <button onClick={handleSaveClosure} disabled={closureSaving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {closureSaving ? 'Saving…' : 'Save Closure'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: DOCUMENTS ══════════════════════════════════════════════════ */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          {canManage && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <HiOutlineUpload className="w-4 h-4 text-emerald-600" />Upload Document
              </h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Category</label>
                  <select value={docCategory} onChange={e => setDocCategory(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {docCategory === 'Others' && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Specify Category</label>
                    <input value={docCategoryOther} onChange={e => setDocCategoryOther(e.target.value)} placeholder="Category name" className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                )}
                <div className="flex-1 min-w-48">
                  <label className="text-xs font-medium text-gray-600 block mb-1">File</label>
                  <input type="file" onChange={e => setDocFile(e.target.files[0] || null)} className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
                </div>
                <button onClick={handleUploadDoc} disabled={uploading || !docFile} className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Project Documents</h3>
              <span className="text-xs text-gray-400">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
            </div>
            {docsLoading ? (
              <div className="p-8 text-center text-gray-400 text-sm">Loading documents…</div>
            ) : docs.length === 0 ? (
              <div className="p-10 text-center">
                <HiOutlineDocumentText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No documents uploaded yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {docs.map(doc => {
                  const docId = doc._id || doc.id;
                  return (
                    <div key={docId} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 group">
                      <HiOutlineDocumentText className="w-8 h-8 text-gray-300 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[doc.category] || 'bg-gray-100 text-gray-600'}`}>{doc.category}</span>
                          <span>{formatBytes(doc.sizeBytes)}</span>
                          <span>by {doc.uploadedBy?.name || '—'}</span>
                          <span>{fmtDate(doc.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a href={downloadProjectDocumentUrl(id, docId)} download className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600 transition-colors" title="Download">
                          <HiOutlineDownload className="w-4 h-4" />
                        </a>
                        {canManage && (
                          <button onClick={() => handleDeleteDoc(docId)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ALLOCATION PREVIEW MODAL ══════════════════════════════════════ */}
      {showAllocationPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Resource Allocation Preview</h3>
                <p className="text-xs text-gray-400 mt-0.5">Cross-project load for each team member</p>
              </div>
              <button onClick={() => setShowAllocationPreview(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="overflow-y-auto p-5 space-y-3">
              {previewLoading ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-gray-400">Loading allocation data…</span>
                </div>
              ) : allocationPreview.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-2xl mb-2">📊</p>
                  <p className="text-sm font-medium text-gray-600">No allocation data yet</p>
                  <p className="text-xs text-gray-400 mt-1">Set Hours / day, From Date, and To Date for team members first.</p>
                </div>
              ) : (
                allocationPreview.map(member => {
                  const otherAllocs = (member.allAllocations || []).filter(a => String(a.projectId) !== String(id));
                  const cap        = Number(member.capacity) > 0 ? Number(member.capacity) : capacity;
                  const peak       = Number(member.peakHours) || 0;
                  const ratio      = peak / cap;
                  const isUnset    = member.hoursPerDay == null;
                  const isOverloaded = member.isOverAllocated === true || ratio > 1;
                  const isHigh     = !isOverloaded && ratio > 0.8;
                  const barColor   = isOverloaded ? 'bg-red-500' : isHigh ? 'bg-amber-400' : 'bg-emerald-500';
                  const borderCls  = isOverloaded ? 'border-red-200 bg-red-50' : isUnset ? 'border-amber-200 bg-amber-50' : 'border-gray-200';
                  // Find earliest free-up date (latest allocationTo across all active allocations)
                  const freeDate = (member.allAllocations || [])
                    .map(a => a.allocationTo ?? a.to)
                    .filter(Boolean)
                    .sort((a, b) => new Date(b) - new Date(a))[0];
                  const memberName  = member.name  ?? member.user?.name;
                  const memberEmail = member.email ?? member.user?.email;
                  // The project member row (has _id / exceptionStatus) behind this preview line
                  const memberRow   = (project?.members || []).find(pm => String(pm.userId) === String(member.userId)) || null;
                  const hasConflict = isOverloaded || (member.conflicts || []).length > 0;
                  const canResolve  = canManage && hasConflict && memberRow && !memberHasPendingException(memberRow);
                  const resolveOpen = previewResolveUserId != null && String(previewResolveUserId) === String(member.userId);
                  const rowSugg     = canResolve ? previewSuggestionsFor(member, cap) : null;
                  // Synthetic conflict block for the exception modal (mirrors the 409 shape)
                  const toConflict = (line, sugg) => ({
                    capacity: cap, peak: Number(line.peakHours) || peak,
                    overDays: (line.conflicts || []).reduce((s, c) => s + (Number(c.days) || 0), 0),
                    ranges: (line.conflicts || []).map(c => ({ from: c.from, to: c.to, peak: c.peak, days: c.days })),
                    remaining: sugg?.reduceTo ?? null,
                    suggestions: sugg,
                    canRequestException: true,
                  });
                  const rowConflict = canResolve ? toConflict(member, rowSugg) : null;
                  // Per-segment preview lines (newer servers). Each: { segmentId, fromDate, toDate,
                  // hoursPerDay, peakHours, isOverAllocated, overOnItsOwn, suggestions, conflicts }
                  const segLines = Array.isArray(member.segments) ? member.segments : [];
                  const segRowOf = (sl) => memberSegments(memberRow).find(s => String(s._id) === String(sl.segmentId)) || { _id: sl.segmentId, ...sl };
                  const conflictedSegs = segLines.filter(sl => sl.isOverAllocated || (sl.conflicts || []).length > 0);

                  return (
                    <div key={member.userId} className={`rounded-lg border p-4 ${borderCls}`}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {memberName?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                              {memberName}
                              {memberRow && <ExceptionChip member={memberRow} compact />}
                            </p>
                            <p className="text-xs text-gray-500">{memberEmail}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-2">
                          {isUnset ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⚠ Allocation not set</span>
                          ) : isOverloaded ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">🔴 Overloaded {fmtH(peak)}h / {fmtH(cap)}h</span>
                          ) : isHigh ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⚠ High {fmtH(peak)}h / {fmtH(cap)}h</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✅ {fmtH(peak)}h / {fmtH(cap)}h</span>
                          )}
                          {canResolve && (
                            <button
                              type="button"
                              onClick={() => setPreviewResolveUserId(resolveOpen ? null : member.userId)}
                              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${resolveOpen ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-700 border-red-300 hover:bg-red-100'}`}
                              aria-expanded={resolveOpen}
                            >
                              {resolveOpen ? 'Close' : 'Resolve'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Resolve popover — one block per conflicting period; every option opens the drawer on that period */}
                      {canResolve && resolveOpen && (
                        <div className="mb-3 bg-white border border-red-200 rounded-lg px-3 py-2.5 text-xs text-gray-700">
                          <p className="font-semibold text-red-700">
                            Resolve for {memberName}
                            {rowSugg?.overloadHours != null && rowSugg.overloadHours > 0 && (
                              <span className="font-normal text-red-600"> · +{fmtH(rowSugg.overloadHours)}h over on the busiest day</span>
                            )}
                          </p>
                          <p className="text-gray-500 mt-0.5">Pick an option to open this member's allocation on that period — apply the change there, or request an exception.</p>
                          {conflictedSegs.length > 0 ? (
                            <div className="mt-2 space-y-2">
                              {conflictedSegs.map((sl, i) => {
                                const sugg = previewSuggestionsFor({ ...sl, remaining: sl.remaining }, cap);
                                return (
                                  <div key={sl.segmentId ?? i} className="border-t border-red-100 pt-2">
                                    <p className="font-medium text-gray-800">
                                      {fmtRangeDate(sl.fromDate)} – {fmtRangeDate(sl.toDate)} · {fmtH(sl.hoursPerDay)} h/day
                                      <span className="font-normal text-red-600"> · peak {fmtH(sl.peakHours)}h / {fmtH(cap)}h</span>
                                    </p>
                                    <SuggestionButtons
                                      suggestions={sugg}
                                      onApply={() => resolvePreviewInDrawer(memberRow, sl.segmentId)}
                                      onRequestException={() => { setPreviewResolveUserId(null); requestExceptionForMember(memberRow, toConflict(sl, sugg), segRowOf(sl)); }}
                                    />
                                    <button type="button" onClick={() => resolvePreviewInDrawer(memberRow, sl.segmentId)} className="mt-1.5 text-[11px] text-blue-600 hover:underline">
                                      Open this period in the allocation panel →
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <>
                              <SuggestionButtons
                                suggestions={rowSugg}
                                onApply={() => resolvePreviewInDrawer(memberRow, null)}
                                onRequestException={() => { setPreviewResolveUserId(null); requestExceptionForMember(memberRow, rowConflict); }}
                              />
                              {!rowSugg?.reduceTo && !rowSugg?.nextFreeDate && !rowSugg?.shortenTo && (
                                <p className="text-gray-400 mt-1.5">No automatic adjustment fits — edit the allocation in the panel or request an exception.</p>
                              )}
                              <button type="button" onClick={() => resolvePreviewInDrawer(memberRow, null)} className="mt-1.5 text-[11px] text-blue-600 hover:underline">
                                Open allocation panel →
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Allocation bar */}
                      {!isUnset && (
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>Busiest day across all projects</span>
                            <span className="font-medium">{fmtH(peak)}h / {fmtH(cap)}h</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                            />
                          </div>
                          {peak > cap && (
                            <p className="text-xs text-red-500 mt-1">⚠ {fmtH(peak - cap)}h over capacity</p>
                          )}
                        </div>
                      )}

                      {/* This project */}
                      {!isUnset && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-emerald-700">{project?.name || 'This project'}</span>
                          {member.isEstimated && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">estimated</span>
                          )}
                          <span className="text-xs font-bold text-gray-800 ml-auto">
                            {formatAllocation(member, cap)}
                          </span>
                          {member.allocationFrom && member.allocationTo && (
                            <span className={`text-xs ${member.invalidDates ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                              {member.allocationFrom.slice(0,10)} → {member.allocationTo.slice(0,10)}
                              {member.invalidDates && ' · end is before start'}
                            </span>
                          )}
                        </div>
                      )}
                      {member.overOnItsOwn && (
                        <p className="text-xs text-red-500 mb-2">⚠ This allocation alone exceeds the {fmtH(cap)}h day — reduce it or request an exception.</p>
                      )}

                      {/* Per-period lines on this project */}
                      {segLines.length > 0 && (
                        <div className="ml-4 mb-2 space-y-1">
                          {segLines.map((sl, i) => {
                            const sPeak = Number(sl.peakHours) || 0;
                            const sOver = sl.isOverAllocated === true || sPeak > cap;
                            const sHigh = !sOver && sPeak / cap > 0.8;
                            const sSugg = sOver ? previewSuggestionsFor({ ...sl, remaining: sl.remaining }, cap) : null;
                            const segRow = segRowOf(sl);
                            const tone = segTone(segRow);
                            return (
                              <div key={sl.segmentId ?? i} className={`rounded border px-2 py-1.5 text-xs ${sOver ? 'border-red-200 bg-red-50/60' : 'border-gray-100 bg-gray-50/60'}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-gray-700 tabular-nums">{fmtRangeDate(sl.fromDate)} – {fmtRangeDate(sl.toDate)}</span>
                                  <span className="font-semibold text-gray-800">{fmtH(sl.hoursPerDay)} h/day</span>
                                  {tone === 'pending' && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-medium">pending exception</span>}
                                  {tone === 'approved' && <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-medium">exception approved</span>}
                                  {tone === 'estimated' && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">estimated</span>}
                                  <span className={`ml-auto font-medium tabular-nums ${sOver ? 'text-red-600' : sHigh ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    peak {fmtH(sPeak)}h / {fmtH(cap)}h
                                  </span>
                                </div>
                                {sl.overOnItsOwn && (
                                  <p className="text-red-500 mt-0.5">⚠ This period alone exceeds the {fmtH(cap)}h day.</p>
                                )}
                                {(sl.conflicts || []).length > 0 && (
                                  <ul className="mt-0.5 text-red-500 space-y-0.5">
                                    {(sl.conflicts || []).slice(0, 3).map((c, j) => (
                                      <li key={j}>
                                        {fmtRangeDate(c.from)} – {fmtRangeDate(c.to)} ({c.days}d) · {fmtH(c.peak)}h / {fmtH(cap)}h
                                        {(c.projects || []).length > 0 && (
                                          <span className="text-red-400"> ({c.projects.map(p => `${p.projectName} ${fmtH(p.hoursPerDay)}h`).join(' + ')})</span>
                                        )}
                                      </li>
                                    ))}
                                    {sl.conflicts.length > 3 && <li className="text-red-400">…and {sl.conflicts.length - 3} more ranges</li>}
                                  </ul>
                                )}
                                {sSugg && (sSugg.reduceTo != null || sSugg.nextFreeDate || sSugg.shortenTo) && (
                                  <p className="text-gray-500 mt-0.5">
                                    Suggested:
                                    {sSugg.reduceTo != null && <> use {fmtH(sSugg.reduceTo)} h/day</>}
                                    {sSugg.nextFreeDate && <>{sSugg.reduceTo != null ? ' ·' : ''} start on {fmtRangeDate(sSugg.nextFreeDate)}</>}
                                    {sSugg.shortenTo && <>{(sSugg.reduceTo != null || sSugg.nextFreeDate) ? ' ·' : ''} end on {fmtRangeDate(sSugg.shortenTo)}</>}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Other projects */}
                      {otherAllocs.length > 0 && (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Also involved in:</p>
                          {otherAllocs.map((a, i) => {
                            const from = a.allocationFrom ?? a.from;
                            const to   = a.allocationTo   ?? a.to;
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                                <span className="text-xs text-gray-700 flex-1 truncate">{a.projectName || 'Unknown project'}</span>
                                <span className="text-xs font-semibold text-gray-700">{fmtH(a.hoursPerDay)}h/day</span>
                                {from && to && (
                                  <span className="text-xs text-gray-400">{String(from).slice(0,10)} → {String(to).slice(0,10)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Free-up date */}
                      {freeDate && !isUnset && (
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-1.5">
                          {(() => {
                            const daysAway = Math.ceil((new Date(freeDate) - new Date()) / 86400000);
                            return daysAway <= 0 ? (
                              <span className="text-xs text-emerald-600 font-semibold">🗓 Free now</span>
                            ) : (
                              <>
                                <span className="text-xs text-gray-400">🗓 Fully free from:</span>
                                <span className="text-xs font-semibold text-emerald-600">{freeDate.slice(0,10)}</span>
                                <span className="text-xs text-gray-400">(in {daysAway} day{daysAway === 1 ? '' : 's'})</span>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* Conflict details — date ranges where the busiest day exceeds capacity */}
                      {(member.conflicts || []).length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-red-100">
                          <p className="text-xs font-semibold text-red-600 mb-1">⚠ Over capacity:</p>
                          {(member.conflicts || []).slice(0, 3).map((c, i) => (
                            <p key={i} className="text-xs text-red-500">
                              {fmtRangeDate(c.from)} – {fmtRangeDate(c.to)} ({c.days}d) · {fmtH(c.peak)}h / {fmtH(cap)}h
                              {(c.projects || []).length > 0 && (
                                <span className="text-red-400"> ({c.projects.map(p => `${p.projectName} ${fmtH(p.hoursPerDay)}h`).join(' + ')})</span>
                              )}
                            </p>
                          ))}
                          {member.conflicts.length > 3 && (
                            <p className="text-xs text-red-400 mt-1">…and {member.conflicts.length - 3} more ranges</p>
                          )}
                        </div>
                      )}

                      {/* No allocation set - prompt */}
                      {isUnset && (
                        <p className="text-xs text-amber-700 mt-1">
                          {memberRow ? (
                            <>
                              <button type="button" onClick={() => resolvePreviewInDrawer(memberRow, null)} className="font-semibold underline hover:text-amber-900">Manage allocation</button>
                              {' '}to add a period with hours / day and dates.
                            </>
                          ) : (
                            <>Open <strong>Manage allocation</strong> on this member in the Team tab to add a period with hours / day and dates.</>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {(() => {
                  const conflicted = allocationPreview.filter(m => m.isOverAllocated || (m.conflicts || []).length > 0).length;
                  const invalid    = allocationPreview.filter(m => m.invalidDates).length;
                  const estimated  = allocationPreview.filter(m => m.isEstimated && m.hoursPerDay != null).length;
                  const unset      = allocationPreview.filter(m => m.hoursPerDay == null).length;
                  const parts = [];
                  if (conflicted) parts.push(`🔴 ${conflicted} over-allocated`);
                  if (invalid)    parts.push(`⛔ ${invalid} with invalid dates`);
                  if (estimated)  parts.push(`⚠ ${estimated} unconfirmed estimate${estimated === 1 ? '' : 's'}`);
                  if (unset)      parts.push(`⚠ ${unset} with no allocation`);
                  return parts.length ? parts.join(' · ') : '✅ All allocations look good';
                })()}
              </p>
              <button onClick={() => setShowAllocationPreview(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ALLOCATION EXCEPTION REQUEST MODAL ═══════════════════════════ */}
      <ExceptionRequestModal
        open={!!exceptionModal}
        onClose={() => setExceptionModal(null)}
        projectId={id}
        member={exceptionModal?.member || null}
        conflict={exceptionModal?.conflict || null}
        onRequested={handleExceptionRequested}
      />

      {/* ═══ EDIT PROJECT MODAL ══════════════════════════════════════════════ */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Edit Project</h2>
              <button onClick={() => setShowEdit(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <HiOutlineX className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Billing type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Billing Type</label>
                <div className="flex gap-3">
                  {['Billable', 'Non-Billable'].map(t => (
                    <button key={t} type="button" onClick={() => setEditForm(f => ({ ...f, billingType: t }))}
                      className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                        editForm.billingType === t
                          ? t === 'Billable' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-400 bg-gray-100 text-gray-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {t === 'Billable' ? '💰 Billable' : '🔧 Non-Billable'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Client Organisation + Project Name — same combined layout as Create Project */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Client Organisation</label>
                  <select
                    value={editForm.clientOrgId || ''}
                    onChange={e => {
                      const orgId = e.target.value;
                      const org = clientOrgs.find(o => (o._id || o.id) === orgId);
                      setEditForm(f => ({ ...f, clientOrgId: orgId, clientName: org?.name || '' }));
                    }}
                    className={inputCls}
                  >
                    <option value="">— None —</option>
                    {clientOrgs.map(o => (
                      <option key={o._id || o.id} value={o._id || o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Project Name *
                    {editForm.clientOrgId && (
                      <span className="ml-1 font-normal text-gray-400">— prefixed with "{editForm.clientName}"</span>
                    )}
                  </label>
                  <div className="flex rounded-lg border border-gray-200 overflow-hidden transition-colors focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400">
                    {editForm.clientOrgId && (
                      <span className="flex items-center px-3 bg-gray-50 border-r border-gray-200 text-[11px] font-semibold text-gray-500 whitespace-nowrap select-none">
                        {editForm.clientName} —
                      </span>
                    )}
                    <input
                      value={editForm.shortName || ''}
                      onChange={e => setEditForm(f => ({ ...f, shortName: e.target.value }))}
                      className="flex-1 h-9 px-3 text-sm bg-white text-gray-900 placeholder:text-gray-300 focus:outline-none"
                      placeholder={editForm.clientOrgId ? 'Project name…' : 'e.g. PLI Portal Redesign 2026'}
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                <textarea value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputCls} />
              </div>

              {/* Purpose */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Purpose / Objective</label>
                <textarea value={editForm.purpose || ''} onChange={e => setEditForm(f => ({ ...f, purpose: e.target.value }))} rows={2} className={inputCls} />
              </div>

              {/* Planned dates — read-only after creation */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Planned Dates <span className="normal-case font-normal text-gray-400">(set at creation — locked)</span></p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Planned Start Date</label>
                    <div className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-500 select-none">
                      {editForm.startDate ? new Date(editForm.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Planned End Date</label>
                    <div className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-500 select-none">
                      {editForm.endDate ? new Date(editForm.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actual dates — editable post-creation */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Actual Dates</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Actual Start Date</label>
                    <input
                      type="date"
                      value={editForm.actualStartDate || ''}
                      onChange={e => setEditForm(f => ({ ...f, actualStartDate: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Actual End Date</label>
                    <input
                      type="date"
                      value={editForm.actualEndDate || ''}
                      onChange={e => setEditForm(f => ({ ...f, actualEndDate: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                  <select value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Project Manager */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Project Manager</label>
                <select value={editForm.managerId || ''} onChange={e => setEditForm(f => ({ ...f, managerId: e.target.value }))} className={inputCls}>
                  <option value="">— Unassigned —</option>
                  {/* Same role check as the KPI module's manager-only actions — role === 'manager' */}
                  {allUsers.filter(u => u.role === 'manager').map(u => (
                    <option key={u._id || u.id} value={u._id || u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Notify client */}
              <div className="flex items-center gap-3">
                <input type="checkbox" id="editNotify" checked={!!editForm.notifyClient} onChange={e => setEditForm(f => ({ ...f, notifyClient: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <label htmlFor="editNotify" className="text-sm text-gray-700">Notify client on milestone updates</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleEditSubmit} disabled={editSaving} className="px-6 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
