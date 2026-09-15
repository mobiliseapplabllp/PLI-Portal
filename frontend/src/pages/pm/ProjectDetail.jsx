import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  HiOutlineClipboard, HiOutlineTicket,
} from 'react-icons/hi';
import {
  updateProjectApi, addMemberApi, updateMemberApi, removeMemberApi,
  getHelpdeskProfileApi, enableHelpdeskApi, updateHelpdeskProfileApi, disableHelpdeskApi,
} from '../../api/pm/projects.api';
import { getGroupsApi } from '../../api/helpdesk/groups.api';
// Member roles are now fetched from /pm/config/member-roles (admin-configurable)
import {
  getProjectDocumentsApi, uploadProjectDocumentApi,
  deleteProjectDocumentApi, downloadProjectDocumentUrl,
} from '../../api/pm/documents.api';
import { getTodayLogApi } from '../../api/pm/dailyLogs.api';
import { getUsersApi } from '../../api/users.api';
import { getPmStatusesApi, getMemberRolesApi } from '../../api/pm/config.api';
import api from '../../api/axios';
import ResourceAvailabilityCard from '../../components/pm/ResourceAvailabilityCard';
import AllocationApprovalPanel from '../../components/pm/AllocationApprovalPanel';
import AllocationTypeInput, { formatAllocation } from '../../components/pm/AllocationTypeInput';

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
      title={`${monthLabel(month)} — Projects ${fmtH(cell.pmHours)}h · Helpdesk ${fmtH(cell.hdHours)}h`}
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

/** Red panel rendered under a member form after the server returned HTTP 409 */
function ConflictPanel({ conflict, capacity, onUseRemaining, compact = false }) {
  if (!conflict) return null;
  const cap = Number(conflict.capacity) > 0 ? Number(conflict.capacity) : capacity;
  const ranges = Array.isArray(conflict.ranges) ? conflict.ranges : [];
  const remaining = conflict.remaining != null ? Number(conflict.remaining) : null;
  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg text-red-700 ${compact ? 'px-2.5 py-2 mt-2 text-xs' : 'px-3 py-2.5 mb-3 text-sm'}`} role="alert">
      <p className="font-semibold">Over capacity on {conflict.overDays ?? ranges.reduce((s, r) => s + (r.days || 0), 0)} day{(conflict.overDays ?? 0) === 1 ? '' : 's'}</p>
      {ranges.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-red-600">
          {ranges.map((r, i) => (
            <li key={i}>{fmtRangeDate(r.from)} – {fmtRangeDate(r.to)} · peak {fmtH(r.peak)}h / {fmtH(cap)}h</li>
          ))}
        </ul>
      )}
      {remaining != null && remaining > 0 && onUseRemaining && (
        <button
          type="button"
          onClick={() => onUseRemaining(remaining)}
          className="mt-2 px-2.5 py-1 bg-white border border-red-300 text-red-700 rounded text-xs font-medium hover:bg-red-100 transition-colors"
        >
          Use {fmtH(remaining)} hrs/day
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { activeProject: project, projectLoading, projectError } = useSelector(s => s.pm);
  const { user } = useSelector(s => s.auth);

  const [activeTab,     setActiveTab]     = useState('overview');
  const [allUsers,      setAllUsers]      = useState([]);
  const [pmStatuses,    setPmStatuses]    = useState([]);
  const [memberRoles,   setMemberRoles]   = useState([]);
  const [addingMember,  setAddingMember]  = useState(false);
  const [memberForm,    setMemberForm]    = useState({ userId: '', role: '', allocationMode: 'per_day', hoursPerDay: null, allocationTotalHours: null, allocationFrom: null, allocationTo: null });
  const [memberConflict, setMemberConflict] = useState(null);      // 409 conflict for the add form
  const [memberDerived,  setMemberDerived]  = useState({ hoursPerDay: null, totalHours: null, workingDays: null }); // from AllocationTypeInput (total ÷ working days)
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editMemberForm,  setEditMemberForm]  = useState({ role: '', allocationMode: 'per_day', hoursPerDay: null, allocationTotalHours: null, allocationFrom: null, allocationTo: null });
  const [editMemberConflict, setEditMemberConflict] = useState(null); // 409 conflict for the inline edit form
  const [capacity, setCapacity] = useState(8);                     // working hours/day, from availability responses
  const [statusUpdating,setStatusUpdating]= useState(false);
  const [showAllocationPreview, setShowAllocationPreview] = useState(false);
  const [allocationPreview,     setAllocationPreview]     = useState([]);
  const [previewLoading,        setPreviewLoading]        = useState(false);
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

  // Helpdesk (per-project support profile)
  const [hdState,   setHdState]   = useState(null);   // { enabled, profile } | null (not yet loaded)
  const [hdLoading, setHdLoading] = useState(false);
  const [hdGroups,  setHdGroups]  = useState([]);
  const [hdGroupId, setHdGroupId] = useState('');     // select value (string)
  const [hdSaving,  setHdSaving]  = useState(false);
  const [hdCopied,  setHdCopied]  = useState(false);
  const [hdError,   setHdError]   = useState('');     // inline error on the Helpdesk tab (validation or server)

  // ── Load core data ──────────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(clearActiveProject());
    dispatch(fetchProjectById(id));
  }, [dispatch, id]);

  useEffect(() => {
    getUsersApi({ isActive: true, limit: 200 })
      .then(res => setAllUsers(res.data?.data?.users || res.data?.data || []))
      .catch(() => {});
    getPmStatusesApi()
      .then(res => setPmStatuses(res.data?.data || []))
      .catch(() => {});
    getMemberRolesApi()
      .then(res => setMemberRoles((res.data?.data || []).filter(r => r.isActive)))
      .catch(() => {});
  }, []);

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
    if (activeTab === 'helpdesk') {
      setHdLoading(true);
      getHelpdeskProfileApi(id)
        .then(res => {
          const d = res.data?.data || { enabled: false, profile: null };
          setHdState(d);
          setHdGroupId(d.profile?.groupId != null ? String(d.profile.groupId) : '');
        })
        .catch(() => toast.error('Failed to load helpdesk settings'))
        .finally(() => setHdLoading(false));
      getGroupsApi()
        .then(res => { const raw = res.data?.data ?? res.data; setHdGroups(Array.isArray(raw) ? raw : []); })
        .catch(() => {});
    }
  }, [activeTab, id]);

  // Allocation preview fetch
  useEffect(() => {
    if (!showAllocationPreview) return;
    setPreviewLoading(true);
    const params = new URLSearchParams();
    const firstWithDates = (project?.members || []).find(m => m.allocationFrom && m.allocationTo);
    if (firstWithDates) {
      params.set('fromDate', firstWithDates.allocationFrom.slice(0, 10));
      params.set('toDate', firstWithDates.allocationTo.slice(0, 10));
    }
    api.get(`/pm/projects/${id}/allocation-preview?${params}`)
      .then(res => setAllocationPreview(res.data?.data ?? []))
      .catch(() => toast.error('Failed to load allocation preview'))
      .finally(() => setPreviewLoading(false));
  }, [showAllocationPreview, id]);

  // Reset allocation preview when navigating to a different project
  useEffect(() => {
    setShowAllocationPreview(false);
  }, [id]);

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

  // Monthly utilisation for all team members (Team tab only). Re-runs on month
  // change, member set change, or after any allocation mutation (utilTick).
  const memberUserIdsKey = (project?.members || []).map(m => m.userId).join(',');
  useEffect(() => {
    if (activeTab !== 'team' || !id || !memberUserIdsKey) return;
    let cancelled = false;
    setUtilLoading(true);
    api.get('/pm/utilisation', { params: { from: utilMonth, to: utilMonth, userIds: memberUserIdsKey } })
      .then(res => {
        if (cancelled) return;
        const data = res.data?.data || {};
        const map = {};
        (data.users || []).forEach(u => { map[String(u.userId)] = u.cells?.[0] || null; });
        setTeamUtil(map);
        setUtilMonthMeta(data.months?.[0] || null);
      })
      .catch(() => {}) // non-fatal — chips simply stay hidden
      .finally(() => { if (!cancelled) setUtilLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, id, utilMonth, memberUserIdsKey, utilTick]);

  // Reload RAID when filter changes
  useEffect(() => {
    if (activeTab === 'raid' && id) {
      setRaidLoading(true);
      raidApi.list(id, raidFilter ? { type: raidFilter } : {}).then(res => setRaidItems(res.data?.data || [])).catch(() => {}).finally(() => setRaidLoading(false));
    }
  }, [raidFilter]);

  const canManage = MANAGER_ROLES.includes(user?.role) || (project && String(project.managerId) === String(user?._id || user?.id));

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

  const openEditMember = (m) => {
    setEditMemberConflict(null);
    setEditingMemberId(m._id || m.id);
    setEditMemberForm({
      role:           m.role           || '',
      allocationMode: m.allocationMode === 'total' ? 'total' : 'per_day',
      hoursPerDay:    m.hoursPerDay != null && m.hoursPerDay !== '' ? Number(m.hoursPerDay) : null,
      allocationTotalHours: m.allocationTotalHours != null && m.allocationTotalHours !== '' ? Number(m.allocationTotalHours) : null,
      allocationFrom: m.allocationFrom ? m.allocationFrom.slice(0, 10) : null,
      allocationTo:   m.allocationTo   ? m.allocationTo.slice(0, 10)   : null,
    });
  };
  const closeEditMember = () => {
    setEditMemberConflict(null);
    setEditingMemberId(null);
  };
  const setEditMemberField = (patch) => {
    setEditMemberConflict(null); // any input change clears the conflict line
    setEditMemberForm(f => ({ ...f, ...patch }));
  };

  const handleUpdateMember = async (memberId) => {
    try {
      const mode = editMemberForm.allocationMode === 'total' ? 'total' : 'per_day';
      await updateMemberApi(id, memberId, {
        // Include role so it can be changed after a member is added
        ...(editMemberForm.role ? { role: editMemberForm.role } : {}),
        allocationMode: mode,
        // Explicit null/'' check — 0.5 is a valid hoursPerDay and must not be coerced to null
        hoursPerDay:    mode === 'per_day' && editMemberForm.hoursPerDay != null && editMemberForm.hoursPerDay !== ''
          ? Number(editMemberForm.hoursPerDay)
          : null,
        allocationTotalHours: mode === 'total' && editMemberForm.allocationTotalHours != null && editMemberForm.allocationTotalHours !== ''
          ? Number(editMemberForm.allocationTotalHours)
          : null,
        allocationFrom: editMemberForm.allocationFrom || null,
        allocationTo:   editMemberForm.allocationTo   || null,
      });
      toast.success('Member updated');
      setEditMemberConflict(null);
      setEditingMemberId(null);
      dispatch(fetchProjectById(id));
      bumpUtil();
    } catch (err) {
      if (err.response?.status === 409) {
        toast.error(err.response.data?.message || 'Allocation exceeds capacity');
        setEditMemberConflict(err.response.data?.conflict || null);
        return; // keep the inline form open
      }
      toast.error(err.response?.data?.message || 'Failed to update allocation');
    }
  };

  // ── Edit project ────────────────────────────────────────────────────────────
  const openEdit = () => {
    setEditForm({
      name:          project.name || '',
      description:   project.description || '',
      purpose:       project.purpose || '',
      clientName:    project.clientName || '',
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
  const handleEditSubmit = async () => {
    if (!editForm.name?.trim()) return toast.error('Project name is required');
    setEditSaving(true);
    try {
      // Exclude startDate / endDate (planned dates are locked after creation)
      const { startDate, endDate, ...updatePayload } = editForm;
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
  const pct        = total > 0 ? Math.round((completedMs / total) * 100) : 0;

  // ── Helpdesk handlers ───────────────────────────────────────────────────────
  const hdErrMsg = (err, fallback) =>
    err.response?.data?.message || err.response?.data?.error?.message || fallback;

  const HD_GROUP_REQUIRED = 'Select a support group for this project';

  const handleEnableHelpdesk = async () => {
    // Enabling helpdesk requires a servicing group (server returns the same 400 otherwise).
    if (!hdGroupId) { setHdError(HD_GROUP_REQUIRED); return; }
    setHdError('');
    setHdSaving(true);
    try {
      const res = await enableHelpdeskApi(id, { groupId: Number(hdGroupId) });
      const d = res.data?.data;
      if (d && typeof d === 'object' && 'enabled' in d) setHdState(d);
      else {
        // Re-read so the token/group name come from the server
        const fresh = await getHelpdeskProfileApi(id);
        setHdState(fresh.data?.data || { enabled: true, profile: d || null });
      }
      toast.success('Helpdesk enabled');
    } catch (err) {
      const msg = hdErrMsg(err, 'Failed to enable helpdesk');
      setHdError(msg);
      toast.error(msg);
    }
    finally { setHdSaving(false); }
  };

  const handleSaveHelpdeskGroup = async () => {
    if (!hdGroupId) { setHdError(HD_GROUP_REQUIRED); return; }
    setHdError('');
    setHdSaving(true);
    try {
      await updateHelpdeskProfileApi(id, { groupId: Number(hdGroupId) });
      const fresh = await getHelpdeskProfileApi(id);
      setHdState(fresh.data?.data || hdState);
      toast.success('Support group updated');
    } catch (err) {
      const msg = hdErrMsg(err, 'Failed to update support group');
      setHdError(msg);
      toast.error(msg);
    }
    finally { setHdSaving(false); }
  };

  const handleDisableHelpdesk = async () => {
    if (!window.confirm('Disable helpdesk for this project? The widget token will stop working.')) return;
    setHdSaving(true);
    try {
      await disableHelpdeskApi(id);
      setHdState({ enabled: false, profile: null });
      setHdGroupId('');
      toast.success('Helpdesk disabled');
    } catch (err) {
      // 409 → tickets exist; backend sends a flat { success:false, message }
      toast.error(hdErrMsg(err, 'Failed to disable helpdesk'));
    } finally { setHdSaving(false); }
  };

  const handleCopyToken = async () => {
    const token = hdState?.profile?.publicToken;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setHdCopied(true);
      setTimeout(() => setHdCopied(false), 1500);
    } catch { toast.error('Copy failed — select the token and copy manually'); }
  };

  const TABS = [
    { id: 'overview',       label: 'Overview',                   icon: HiOutlineChartBar },
    { id: 'team',           label: `Team Setup (${members.length})`, icon: HiOutlineUsers },
    { id: 'project-plan',   label: 'Project Plan',               icon: HiOutlineFlag },
    { id: 'status-reports', label: 'Status Reports',             icon: HiOutlineExclamationCircle },
    { id: 'dailylog',       label: 'Daily Log',                  icon: HiOutlineClipboardList },
    { id: 'raid',           label: 'RAID',                       icon: HiOutlineExclamationCircle },
    { id: 'financial',      label: 'Financial',                  icon: HiOutlineCash },
    { id: 'closure',        label: 'Closure',                    icon: HiOutlineCheckCircle },
    { id: 'documents',      label: `Documents`,                  icon: HiOutlinePaperClip },
    { id: 'helpdesk',       label: 'Helpdesk',                   icon: HiOutlineTicket },
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
              {/* Card / List view toggle */}
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
                onUseRemaining={(h) => { setMemberForm(f => ({ ...f, allocationMode: 'per_day', hoursPerDay: h, allocationTotalHours: null })); setMemberConflict(null); }}
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
                      if (suggestion.type === 'request_approval' && suggestion.targetProjectName) {
                        toast(`Contact the manager of "${suggestion.targetProjectName}" to release capacity first.`);
                      }
                    }}
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
          ) : teamView === 'card' ? (
            /* ── Card view ── */
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map(m => {
                const mid = m._id || m.id;
                const isEditing = editingMemberId === mid;
                return (
                  <div key={mid} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
                    {/* Header: avatar + name + role */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                          {m.user?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{m.user?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{m.role || m.user?.role?.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => isEditing ? closeEditMember() : openEditMember(m)}
                            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                            title="Edit allocation"
                          >
                            {isEditing ? 'Cancel' : '✏'}
                          </button>
                          <button onClick={() => handleRemoveMember(mid)} className="text-xs text-red-500 hover:text-red-700 transition-colors" title="Remove">✕</button>
                        </div>
                      )}
                    </div>

                    {/* Allocation bar */}
                    <div className="mb-3">
                      {(m.hoursPerDay != null || m.allocationTotalHours != null) ? (
                        <>
                          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                            <span>Allocation</span>
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-gray-700">{formatAllocation(m, capacity)}</span>
                              {(m.hoursConfirmed === false || m.isEstimated) && (
                                <>
                                  <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">estimated</span>
                                  {canManage && (
                                    <button onClick={() => handleConfirmHours(mid)} className="text-[10px] text-blue-600 hover:text-blue-800 underline" title="Confirm these hours">Confirm</button>
                                  )}
                                </>
                              )}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${(Number(m.hoursPerDay) || 0) / capacity > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min((Number(m.hoursPerDay) || 0) / capacity, 1) * 100}%` }} />
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No allocation data</span>
                      )}
                    </div>

                    {/* Duration */}
                    {(m.allocationFrom || m.allocationTo) && (
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <span>📅</span>
                        <span>{m.allocationFrom?.slice(0, 10) || '?'} → {m.allocationTo?.slice(0, 10) || 'ongoing'}</span>
                      </div>
                    )}

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

                    {/* Inline allocation edit form */}
                    {isEditing && (
                      <div className="mt-3 bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-2">Edit {m.user?.name}</p>
                        <div className="grid grid-cols-1 gap-2">
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">Role</label>
                            <select
                              value={editMemberForm.role || ''}
                              onChange={e => setEditMemberField({ role: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">Select role…</option>
                              {memberRoles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <AllocationTypeInput
                              compact
                              value={editMemberForm}
                              onChange={next => setEditMemberField({
                                allocationMode:       next.allocationMode,
                                hoursPerDay:          next.hoursPerDay ?? null,
                                allocationTotalHours: next.allocationTotalHours ?? null,
                              })}
                              from={editMemberForm.allocationFrom || null}
                              to={editMemberForm.allocationTo || null}
                              capacity={capacity}
                              defaultMode="per_day"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">From Date</label>
                            <input
                              type="date"
                              value={editMemberForm.allocationFrom || ''}
                              onChange={e => setEditMemberField({ allocationFrom: e.target.value || null })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">To Date</label>
                            <input
                              type="date"
                              value={editMemberForm.allocationTo || ''}
                              onChange={e => setEditMemberField({ allocationTo: e.target.value || null })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                        </div>
                        {/* 409 conflict — compact inline version */}
                        <ConflictPanel
                          compact
                          conflict={editMemberConflict}
                          capacity={capacity}
                          onUseRemaining={(h) => { setEditMemberForm(f => ({ ...f, allocationMode: 'per_day', hoursPerDay: h, allocationTotalHours: null })); setEditMemberConflict(null); }}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleUpdateMember(mid)}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={closeEditMember}
                            className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
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
                const isEditing = editingMemberId === mid;
                return (
                  <div key={mid} className={`px-5 py-3 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {m.user?.name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.user?.name}</p>
                        <p className="text-xs text-gray-500">{m.user?.email} · {m.user?.role?.replace(/_/g, ' ')}</p>
                        {m.role && <p className="text-xs text-emerald-700 mt-0.5">{m.role}</p>}
                      </div>
                      <div className="text-right flex-shrink-0 min-w-[120px]">
                        {(m.hoursPerDay != null || m.allocationTotalHours != null) ? (
                          <>
                            <span className="text-sm font-semibold text-emerald-700">{formatAllocation(m, capacity)}</span>
                            {(m.hoursConfirmed === false || m.isEstimated) && (
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">estimated</span>
                                {canManage && (
                                  <button onClick={() => handleConfirmHours(mid)} className="text-[10px] text-blue-600 hover:text-blue-800 underline" title="Confirm these hours">Confirm</button>
                                )}
                              </div>
                            )}
                            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-24 ml-auto">
                              <div className={`h-full rounded-full ${(Number(m.hoursPerDay) || 0) / capacity > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${Math.min((Number(m.hoursPerDay) || 0) / capacity, 1) * 100}%` }} />
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No data</span>
                        )}
                        {m.allocationFrom && m.allocationTo && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {m.allocationFrom.slice(0, 10)} – {m.allocationTo.slice(0, 10)}
                          </div>
                        )}
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
                      {canManage && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => isEditing ? closeEditMember() : openEditMember(m)}
                            className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                            title="Edit allocation"
                          >
                            {isEditing ? 'Cancel' : '✏ Edit'}
                          </button>
                          <button onClick={() => handleRemoveMember(mid)} className="text-xs text-red-500 hover:text-red-700 transition-colors">Remove</button>
                        </div>
                      )}
                    </div>

                    {/* Inline allocation edit form */}
                    {isEditing && (
                      <div className="mt-3 ml-13 pl-13 bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-2">Edit {m.user?.name}</p>
                        <div className="grid grid-cols-[1fr_1.6fr_1fr_1fr] gap-2">
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">Role</label>
                            <select
                              value={editMemberForm.role || ''}
                              onChange={e => setEditMemberField({ role: e.target.value })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">Select role…</option>
                              {memberRoles.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <AllocationTypeInput
                              compact
                              value={editMemberForm}
                              onChange={next => setEditMemberField({
                                allocationMode:       next.allocationMode,
                                hoursPerDay:          next.hoursPerDay ?? null,
                                allocationTotalHours: next.allocationTotalHours ?? null,
                              })}
                              from={editMemberForm.allocationFrom || null}
                              to={editMemberForm.allocationTo || null}
                              capacity={capacity}
                              defaultMode="per_day"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">From Date</label>
                            <input
                              type="date"
                              value={editMemberForm.allocationFrom || ''}
                              onChange={e => setEditMemberField({ allocationFrom: e.target.value || null })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600 block mb-1">To Date</label>
                            <input
                              type="date"
                              value={editMemberForm.allocationTo || ''}
                              onChange={e => setEditMemberField({ allocationTo: e.target.value || null })}
                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                            />
                          </div>
                        </div>
                        {/* 409 conflict — compact inline version */}
                        <ConflictPanel
                          compact
                          conflict={editMemberConflict}
                          capacity={capacity}
                          onUseRemaining={(h) => { setEditMemberForm(f => ({ ...f, allocationMode: 'per_day', hoursPerDay: h, allocationTotalHours: null })); setEditMemberConflict(null); }}
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleUpdateMember(mid)}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={closeEditMember}
                            className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
              {canManage && (
                <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                  <HiOutlineFlag className="w-4 h-4" />Manage Milestones
                </button>
              )}
            </div>
          </div>

          {milestones.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
              <HiOutlineFlag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No milestones found</p>
              {canManage && <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="mt-3 text-sm text-emerald-600 hover:underline">Open Milestone Manager</button>}
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
                                  {s.weightPercentage != null && <span>{s.weightPercentage}%</span>}
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

      {/* ═══ TAB: HELPDESK ═══════════════════════════════════════════════════ */}
      {activeTab === 'helpdesk' && (
        <div className="space-y-4">
          {hdLoading || !hdState ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              {hdLoading ? 'Loading helpdesk settings…' : 'Helpdesk settings unavailable'}
            </div>
          ) : !hdState.enabled ? (
            /* ── Not enabled ── */
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <HiOutlineTicket className="w-4 h-4 text-gray-400" />
                Helpdesk is not enabled for this project
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Enable it to let this project's users raise support tickets that route to a helpdesk group.
              </p>
              {canManage && (
                <div className="flex flex-wrap gap-3 items-end mt-4">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Support group <span className="text-red-400">*</span></label>
                    <select
                      value={hdGroupId}
                      onChange={e => { setHdGroupId(e.target.value); setHdError(''); }}
                      className={`px-3 py-2 border rounded-lg text-sm bg-white min-w-56 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${hdError ? 'border-red-400' : 'border-gray-200'}`}
                    >
                      <option value="">Select group…</option>
                      {hdGroups.map(g => (
                        <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleEnableHelpdesk}
                    disabled={hdSaving}
                    className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {hdSaving ? 'Enabling…' : 'Enable helpdesk'}
                  </button>
                </div>
              )}
              {hdError && <p className="text-xs text-red-600 mt-2">{hdError}</p>}
            </div>
          ) : (
            /* ── Enabled ── */
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <HiOutlineTicket className="w-4 h-4 text-emerald-600" />
                  Helpdesk
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Enabled</span>
              </div>

              <div className="p-5 space-y-5">
                {/* Support group */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Support group</label>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2 items-center">
                      <select
                        value={hdGroupId}
                        onChange={e => { setHdGroupId(e.target.value); setHdError(''); }}
                        className={`px-3 py-2 border rounded-lg text-sm bg-white min-w-56 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${hdError ? 'border-red-400' : 'border-gray-200'}`}
                      >
                        <option value="">Select group…</option>
                        {hdGroups.map(g => (
                          <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleSaveHelpdeskGroup}
                        disabled={hdSaving || !hdGroupId || String(hdState.profile?.groupId ?? '') === hdGroupId}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        {hdSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-800">{hdState.profile?.groupName || '—'}</p>
                  )}
                  {hdError && <p className="text-xs text-red-600 mt-1">{hdError}</p>}
                </div>

                {/* Widget token */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Widget token</label>
                  <div className="flex items-stretch gap-2">
                    <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono text-gray-800 break-all select-all">
                      {hdState.profile?.publicToken || '—'}
                    </code>
                    <button
                      onClick={handleCopyToken}
                      disabled={!hdState.profile?.publicToken}
                      className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                      title="Copy token"
                    >
                      <HiOutlineClipboard className="w-4 h-4" />
                      {hdCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Paste this token into the support widget to link it to this project.</p>
                </div>

                {canManage && (
                  <div className="pt-3 border-t border-gray-100">
                    <button
                      onClick={handleDisableHelpdesk}
                      disabled={hdSaving}
                      className="px-4 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                    >
                      Disable helpdesk
                    </button>
                    <span className="text-[11px] text-gray-400 ml-2">Not allowed while tickets exist.</span>
                  </div>
                )}
              </div>
            </div>
          )}
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

                  return (
                    <div key={member.userId} className={`rounded-lg border p-4 ${borderCls}`}>
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {memberName?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{memberName}</p>
                            <p className="text-xs text-gray-500">{memberEmail}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {isUnset ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⚠ Allocation not set</span>
                          ) : isOverloaded ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">🔴 Overloaded {fmtH(peak)}h / {fmtH(cap)}h</span>
                          ) : isHigh ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⚠ High {fmtH(peak)}h / {fmtH(cap)}h</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">✅ {fmtH(peak)}h / {fmtH(cap)}h</span>
                          )}
                        </div>
                      </div>

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
                            <span className="text-xs text-gray-400">{member.allocationFrom.slice(0,10)} → {member.allocationTo.slice(0,10)}</span>
                          )}
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
                          <span className="text-xs text-gray-400">🗓 Fully free from:</span>
                          <span className="text-xs font-semibold text-emerald-600">{freeDate.slice(0,10)}</span>
                          <span className="text-xs text-gray-400">
                            (in {Math.max(0, Math.ceil((new Date(freeDate) - new Date()) / 86400000))} days)
                          </span>
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
                          Click <strong>✏ Edit</strong> on this member in the Team tab to set hours / day and dates.
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
                  const unset      = allocationPreview.filter(m => m.hoursPerDay == null).length;
                  return conflicted > 0
                    ? `🔴 ${conflicted} member(s) have over-allocation conflicts`
                    : unset > 0
                    ? `⚠ ${unset} member(s) have no allocation set`
                    : '✅ All allocations look good';
                })()}
              </p>
              <button onClick={() => setShowAllocationPreview(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

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

              {/* Name */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Project Name *</label>
                <input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
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

              {/* Client + Status */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Client Name</label>
                  <input value={editForm.clientName || ''} onChange={e => setEditForm(f => ({ ...f, clientName: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                  <select value={editForm.status || ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
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
