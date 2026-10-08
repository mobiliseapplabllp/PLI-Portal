/**
 * TicketDetail.jsx
 * Comprehensive ticket detail page for PLI Portal's helpdesk module.
 * Layout: left panel (flex-1) with 5 tabs + right sidebar (w-80) with 3 panels.
 * Tabs: Conversations | Details | Sub-tasks | History | Resolution
 * Sidebar: Properties | Assignment | Approvals
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  fetchTicketById,
  clearCurrentTicket,
  updateTicket,
  deleteTicket,
  fetchHdOptions,
  selectCurrentTicket,
  selectCurrentTicketLoading,
  selectSubmitting,
  selectHdOptions,
} from '../../store/helpdeskSlice';
import {
  getConversationsApi,
  addConversationApi,
} from '../../api/helpdesk/conversations.api';
// updateTicketApi is called directly (not via the thunk) wherever an allocation is
// sent: the thunk collapses errors to a message string and the HTTP 409 `conflict`
// body would be lost.
import { getTicketHistoryApi, updateTicketApi } from '../../api/helpdesk/tickets.api';
import TicketConflictPanel from '../../components/helpdesk/TicketConflictPanel';
import TicketExceptionModal from '../../components/helpdesk/TicketExceptionModal';
import {
  getHdDocumentsApi,
  uploadHdDocumentApi,
  deleteHdDocumentApi,
  downloadHdDocumentUrl,
} from '../../api/helpdesk/helpdesk.api';
import {
  requestApprovalApi,
  getApprovalStatusApi,
} from '../../api/helpdesk/approvals.api';
import { getUsersApi } from '../../api/users.api';
import { listTeamsApi, getTeamMembersApi } from '../../api/helpdesk/teams.api';
import api from '../../api/axios';
import AllocationTypeInput, { formatAllocation } from '../../components/pm/AllocationTypeInput';
import SearchSelect from '../../components/common/SearchSelect';
import {
  HiOutlineArrowLeft,
  HiOutlinePencil,
  HiOutlineChevronDown,
  HiOutlineBell,
  HiOutlineDocumentDuplicate,
  HiOutlineTrash,
  HiOutlineChatAlt2,
  HiOutlineClipboardList,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineDocumentText,
  HiOutlinePaperClip,
  HiOutlineUserAdd,
  HiOutlineUser,
  HiOutlineLightningBolt,
  HiOutlineX,
  HiOutlineCheck,
  HiOutlineExclamation,
  HiOutlinePlus,
  HiOutlineLink,
  HiOutlineDownload,
} from 'react-icons/hi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = ['open', 'in-progress', 'pending', 'on-hold', 'resolved', 'closed'];

// ── Effort-allocation helpers (Phase 3) ─────────────────────────────────────
const DEFAULT_ALLOC_HOURS = 2;   // per-day default (Pick Up)
const DEFAULT_ALLOC_TOTAL = 10;  // "Total hours" default in the Assign modal
const isoDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const todayIso   = () => isoDate(new Date());
const plusDaysIso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };
/** Default allocation end: ticket due date (date part) if present, else today + 7. */
const defaultAllocTo = (ticket) => (ticket?.dueDate ? isoDate(ticket.dueDate) : '') || plusDaysIso(7);
const fmtDdMmm = (d) => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const HD_DOC_CATEGORIES = [
  'SOW / Client Contracts',
  'Requirement Documents / BRD',
  'Solution Architecture Documents',
  'Technical Design Documentation',
  'Others',
];

const STATUS_COLORS = {
  'open':        'bg-blue-100 text-blue-700',
  'in-progress': 'bg-amber-100 text-amber-700',
  'pending':     'bg-purple-100 text-purple-700',
  'resolved':    'bg-emerald-100 text-emerald-700',
  'closed':      'bg-gray-100 text-gray-600',
  'on-hold':     'bg-gray-100 text-gray-700',
};

const PRIORITY_COLORS = {
  critical: 'text-red-600',
  high:     'text-orange-500',
  medium:   'text-amber-500',
  low:      'text-emerald-600',
};

const PRIORITY_BTN = {
  critical: 'bg-red-100 text-red-700 ring-red-300',
  high:     'bg-orange-100 text-orange-700 ring-orange-300',
  medium:   'bg-amber-100 text-amber-700 ring-amber-300',
  low:      'bg-emerald-100 text-emerald-700 ring-emerald-300',
};

// REQUEST_TYPES, MODES, IMPACTS, URGENCIES are now loaded from hd_options table
// (configurable via Helpdesk Settings → Customization).
// Fallbacks below are used only if Redux store is not yet loaded.
const FALLBACK_REQUEST_TYPES = ['Incident', 'Service Request', 'Fault', 'Request For Information'];
const FALLBACK_MODES         = ['Web Form', 'E-Mail', 'Phone Call', 'Chat', 'Walk-in'];
const FALLBACK_IMPACTS       = ['Low', 'Medium', 'High'];
const FALLBACK_URGENCIES     = ['Low', 'Medium', 'High'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtLabel(s) {
  if (!s) return '—';
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Team = reporting manager + direct reports (GET /helpdesk/teams) ──────────
const ticketTeamManagerId = (ticket) =>
  ticket?.teamManager?._id ?? ticket?.teamManager?.id ?? ticket?.teamManagerId ?? '';

/**
 * Loads the team list once and returns SearchSelect options.
 * `current` = { _id, name } of the ticket's existing team manager; it is appended
 * when the API list does not contain it (e.g. a manager with no reports).
 */
function useTeamOptions(current) {
  const [teams, setTeams]     = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    listTeamsApi()
      .then(res => { if (alive) setTeams(res.data?.data || []); })
      .catch(() => { if (alive) setTeams([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  const options = teams.map(t => ({
    value: t._id ?? t.id,
    label: t.name,
    sub:   [t.email, t.memberCount != null ? `${t.memberCount} members` : null].filter(Boolean).join(' · '),
  }));
  const curId = current?._id ?? current?.id;
  if (curId && !options.some(o => String(o.value) === String(curId))) {
    options.push({ value: curId, label: current.name || 'Current team', sub: '' });
  }
  return { options, loading };
}

/** Loads GET /helpdesk/teams/:managerId/members and returns SearchSelect options + raw members. */
function useTeamMembers(managerId) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!managerId) { setMembers([]); return undefined; }
    let alive = true;
    setLoading(true);
    getTeamMembersApi(managerId)
      .then(res => { if (alive) setMembers(res.data?.data?.members || []); })
      .catch(() => { if (alive) setMembers([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [managerId]);
  const options = members.map(m => ({
    value: m._id ?? m.id,
    label: m.isManager ? `${m.name} (manager)` : m.name,
    sub:   [m.email, m.designation].filter(Boolean).join(' · '),
  }));
  return { members, options, loading };
}

function Avatar({ name, size = 'md' }) {
  const letter = (name || 'U').charAt(0).toUpperCase();
  const cls = size === 'sm'
    ? 'w-7 h-7 text-xs'
    : 'w-9 h-9 text-sm';
  return (
    <div className={`${cls} rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0`}>
      {letter}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const ticket     = useSelector(selectCurrentTicket);
  const loading    = useSelector(selectCurrentTicketLoading);
  const submitting = useSelector(selectSubmitting);
  const hdOptions  = useSelector(selectHdOptions);
  const user       = useSelector(s => s.auth.user);

  // ── Derive live option arrays from Redux ─────────────────────────────────────
  const optRequestType = (hdOptions?.request_type || []).map(o => o.name);
  const optMode        = (hdOptions?.mode         || []).map(o => o.name);
  const optImpact      = (hdOptions?.impact       || []).map(o => o.name);
  const optUrgency     = (hdOptions?.urgency      || []).map(o => o.name);
  const optCategory    = (hdOptions?.category     || []).map(o => o.name);

  const canManage = ['admin', 'manager', 'senior_manager', 'md', 'director'].includes(user?.role);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('conversations');

  // ── Conversations ──────────────────────────────────────────────────────────
  const [conversations, setConversations]   = useState([]);
  const [convLoading, setConvLoading]       = useState(false);
  const [reply, setReply]                   = useState('');
  const [isInternal, setIsInternal]         = useState(false);
  const [sendingReply, setSendingReply]     = useState(false);
  const [attachFile, setAttachFile]         = useState(null);
  const fileInputRef                        = useRef(null);

  // ── History ────────────────────────────────────────────────────────────────
  const [history, setHistory]               = useState([]);
  const [histLoading, setHistLoading]       = useState(false);

  // ── Approvals (from ticket.approvals[]) ───────────────────────────────────
  const [approvalNote, setApprovalNote]     = useState('');
  const [approverId, setApproverId]         = useState('');
  const [requestingApproval, setRequestingApproval] = useState(false);
  const [respondingId, setRespondingId]     = useState(null);

  // ── Resolution edit ────────────────────────────────────────────────────────
  const [editingResolution, setEditingResolution] = useState(false);
  const [resolutionDraft, setResolutionDraft]     = useState('');

  // ── Documents tab ──────────────────────────────────────────────────────────
  const [hdDocs, setHdDocs]                           = useState([]);
  const [hdDocsLoading, setHdDocsLoading]             = useState(false);
  const [hdDocFile, setHdDocFile]                     = useState(null);
  const [hdDocCategory, setHdDocCategory]             = useState('SOW / Client Contracts');
  const [hdDocCategoryOther, setHdDocCategoryOther]   = useState('');
  const [hdDocUploading, setHdDocUploading]           = useState(false);
  const [hdDocsLoaded, setHdDocsLoaded]               = useState(false);

  // ── All users (for approver picker + assign modal) ─────────────────────────
  const [allUsers, setAllUsers]             = useState([]);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [showActions, setShowActions]             = useState(false);
  const [showEditModal, setShowEditModal]         = useState(false);
  const [showAssignModal, setShowAssignModal]     = useState(false);
  const [assignEditMode, setAssignEditMode]       = useState(false); // true = "Edit allocation" path (pre-selects current assignee)
  // HTTP 409 `conflict` bodies — the save was REFUSED, the modal shows the fixes inline
  const [assignConflict, setAssignConflict]       = useState(null);
  const [editConflict,   setEditConflict]         = useState(null);
  const [assignSaving,   setAssignSaving]         = useState(false);
  const [editSaving,     setEditSaving]           = useState(false);
  const [showNoteModal, setShowNoteModal]         = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showCloseModal, setShowCloseModal]       = useState(false);
  const [showAddTaskModal, setShowAddTaskModal]   = useState(false);

  // ── Pending approval derived flag ──────────────────────────────────────────
  const pendingApproval = (ticket?.approvals || []).some(a => a.status === 'pending');

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(clearCurrentTicket());
    dispatch(fetchTicketById(id));
    // Load configurable options if not already in store
    if (!hdOptions || Object.keys(hdOptions).length === 0) {
      dispatch(fetchHdOptions());
    }
    return () => { dispatch(clearCurrentTicket()); };
  }, [dispatch, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // getUsersApi (org-wide directory) is admin/manager/senior_manager-only server
  // side. Fetching it unconditionally 403'd for every other role — including a
  // plain employee opening their OWN ticket — and the global axios interceptor
  // toasts every 403 app-wide regardless of this call's own .catch. allUsers is
  // only ever used by ApprovalsPanel's approver picker, itself canManage-gated.
  useEffect(() => {
    if (!canManage) return;
    getUsersApi({ isActive: true, limit: 300 })
      .then(res => setAllUsers(res.data?.data?.users || res.data?.data || []))
      .catch(() => {});
  }, [canManage]);

  // ── Load conversations whenever tab is selected ────────────────────────────
  const loadConversations = useCallback(async () => {
    setConvLoading(true);
    try {
      const res = await getConversationsApi(id);
      setConversations(res.data?.data || []);
    } catch { toast.error('Failed to load conversations'); }
    finally { setConvLoading(false); }
  }, [id]);

  // ── Load history when tab selected ────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await getTicketHistoryApi(id);
      setHistory(res.data?.data || []);
    } catch { toast.error('Failed to load history'); }
    finally { setHistLoading(false); }
  }, [id]);

  const loadHdDocs = useCallback(async () => {
    const ticketId = ticket?._id ?? ticket?.id ?? id;
    if (!ticketId) return;
    setHdDocsLoading(true);
    try {
      const res = await getHdDocumentsApi(ticketId);
      setHdDocs(res.data?.data || []);
      setHdDocsLoaded(true);
    } catch { toast.error('Failed to load documents'); }
    finally { setHdDocsLoading(false); }
  }, [id, ticket]);

  useEffect(() => {
    if (activeTab === 'conversations') loadConversations();
    if (activeTab === 'history')       loadHistory();
    if (activeTab === 'documents' && !hdDocsLoaded) loadHdDocs();
  }, [activeTab, loadConversations, loadHistory, loadHdDocs, hdDocsLoaded]);

  // ── Seed resolution draft when ticket loads ────────────────────────────────
  useEffect(() => {
    if (ticket) setResolutionDraft(ticket.resolution || '');
  }, [ticket]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleStatusChange = async (status) => {
    if (pendingApproval) { toast.error('Status is locked while an approval is pending'); return; }
    try {
      await dispatch(updateTicket({ id, data: { status } })).unwrap();
      toast.success('Status updated');
      setShowActions(false);
    } catch (err) { toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to update status'); }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this ticket? This action cannot be undone.')) return;
    try {
      await dispatch(deleteTicket(id)).unwrap();
      toast.success('Ticket deleted');
      navigate('/helpdesk/tickets');
    } catch (err) { toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to delete ticket'); }
  };

  const handleDuplicate = () => {
    navigate('/helpdesk/tickets/new', {
      state: {
        duplicate: true,
        ticketData: {
          title:       `[Copy] ${ticket.title}`,
          description: ticket.description,
          priority:    ticket.priority,
          category:    ticket.category,
          requestType:   ticket.requestType,
          teamManagerId: ticketTeamManagerId(ticket) || undefined,
        },
      },
    });
  };

  const handleSendReply = async () => {
    if (!reply.trim()) { toast.error('Reply cannot be empty'); return; }
    setSendingReply(true);
    try {
      await addConversationApi(id, { message: reply, isInternal, file: attachFile });
      setReply('');
      setIsInternal(false);
      setAttachFile(null);
      toast.success(isInternal ? 'Note added' : 'Reply sent');
      loadConversations();
    } catch { toast.error('Failed to send reply'); }
    finally { setSendingReply(false); }
  };

  const handlePickUp = async () => {
    try {
      await dispatch(updateTicket({ id, data: {
        assigneeId: user?._id || user?.id,
        statusKey: 'in-progress',
        // Phase 3 — default effort allocation so the ticket counts against capacity
        allocationMode:        'per_day',
        allocationHoursPerDay: DEFAULT_ALLOC_HOURS,
        allocationFrom:        todayIso(),
        allocationTo:          defaultAllocTo(ticket),
      } })).unwrap();
      toast.success('Ticket picked up and set to In Progress');
    } catch (err) { toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to pick up ticket'); }
  };

  const handleSaveResolution = async () => {
    try {
      await dispatch(updateTicket({ id, data: { resolution: resolutionDraft } })).unwrap();
      setEditingResolution(false);
      toast.success('Resolution saved');
    } catch (err) { toast.error(typeof err === 'string' ? err : err?.response?.data?.message || err?.message || 'Failed to save resolution'); }
  };

  const handleToggleTask = async (task) => {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    const taskId = task._id || task.id;
    try {
      await api.put(`/helpdesk/tickets/tasks/${taskId}`, { status: newStatus });
      dispatch(fetchTicketById(id));
    } catch { toast.error('Failed to update task'); }
  };

  const handleAddSubTask = async (title) => {
    if (!title.trim()) return false;
    try {
      await api.post(`/helpdesk/tickets/${id}/tasks`, { title: title.trim(), status: 'open' });
      dispatch(fetchTicketById(id));
      toast.success('Task added');
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to add task');
      return false;
    }
  };

  const handleRequestApproval = async () => {
    if (!approverId) { toast.error('Select an approver'); return; }
    setRequestingApproval(true);
    try {
      await requestApprovalApi(id, { approverId, notes: approvalNote });
      toast.success('Approval requested');
      setApproverId('');
      setApprovalNote('');
      dispatch(fetchTicketById(id));
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to request approval');
    } finally { setRequestingApproval(false); }
  };

  const handleRespondApproval = async (approvalId, action) => {
    setRespondingId(approvalId);
    try {
      // NOTE: Backend does not yet have an authenticated respond endpoint.
      // The public /respond route uses an email token (GET /helpdesk/approvals/respond?token=X&action=Y).
      // Once the backend controller is created, this will call the correct route:
      await api.post(`/helpdesk/approvals/${approvalId}/respond-auth`, { action, notes: '' });
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      dispatch(fetchTicketById(id));
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to respond to approval');
    } finally { setRespondingId(null); }
  };

  // ── Document handlers ──────────────────────────────────────────────────────

  const handleHdDocUpload = async () => {
    const ticketId = ticket?._id ?? ticket?.id ?? id;
    if (!hdDocFile) return toast.error('Select a file first');
    const fd = new FormData();
    fd.append('file', hdDocFile);
    fd.append('category', hdDocCategory === 'Others' ? (hdDocCategoryOther.trim() || 'Others') : hdDocCategory);
    setHdDocUploading(true);
    try {
      await uploadHdDocumentApi(ticketId, fd);
      toast.success('Document uploaded');
      setHdDocFile(null);
      setHdDocCategory('SOW / Client Contracts');
      setHdDocCategoryOther('');
      const res = await getHdDocumentsApi(ticketId);
      setHdDocs(res.data?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Upload failed');
    } finally { setHdDocUploading(false); }
  };

  const handleHdDocDelete = async (docId) => {
    const ticketId = ticket?._id ?? ticket?.id ?? id;
    if (!window.confirm('Delete this document?')) return;
    try {
      await deleteHdDocumentApi(ticketId, docId);
      toast.success('Document deleted');
      setHdDocs(prev => prev.filter(d => (d._id || d.id) !== docId));
    } catch { toast.error('Failed to delete document'); }
  };

  // ── Assignee remove / weight handlers ─────────────────────────────────────

  const handleRemoveAssignee = async (assigneeId) => {
    try {
      await api.delete(`/helpdesk/assignees/${assigneeId}`);
      dispatch(fetchTicketById(id));
      toast.success('Assignee removed');
    } catch (err) {
      if (err?.response?.status === 404) {
        toast('TODO: Remove assignee endpoint not yet implemented', { icon: '⚠️' });
      } else {
        toast.error('Failed to remove assignee');
      }
    }
  };

  const handleUpdateAssigneeWeight = async (assigneeId, weight) => {
    try {
      await api.put(`/helpdesk/assignees/${assigneeId}`, { contributionPct: weight });
      dispatch(fetchTicketById(id));
      toast.success('Contribution updated');
    } catch (err) {
      if (err?.response?.status === 404) {
        toast('TODO: Update assignee weight endpoint not yet implemented', { icon: '⚠️' });
      } else {
        toast.error('Failed to update contribution');
      }
    }
  };

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-6 animate-pulse">
        <div className="h-6 w-1/4 bg-gray-200 rounded" />
        <div className="h-10 w-2/3 bg-gray-200 rounded" />
        <div className="flex gap-4">
          <div className="flex-1 h-80 bg-gray-100 rounded-xl" />
          <div className="w-80 h-80 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <HiOutlineExclamation className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-lg font-semibold text-gray-700 mb-2">Ticket not found</p>
        <p className="text-sm text-gray-400 mb-6">This ticket may have been deleted or you don't have access.</p>
        <button
          onClick={() => navigate('/helpdesk/tickets')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Back to Tickets
        </button>
      </div>
    );
  }

  const requesterName = ticket.requester?.name || ticket.requesterName || '—';
  const assigneeName  = ticket.assignee?.name  || ticket.assigneeName  || null;
  const isExternal    = !!(ticket.widget_source || ticket.widgetSource);
  const approvals     = ticket.approvals || [];

  const tabs = [
    { id: 'conversations', label: 'Conversations', icon: HiOutlineChatAlt2 },
    { id: 'details',       label: 'Details',       icon: HiOutlineClipboardList },
    { id: 'documents',     label: `Documents (${hdDocs.length})`, icon: HiOutlinePaperClip },
    { id: 'resolution',    label: 'Resolution',    icon: HiOutlineDocumentText },
    { id: 'history',       label: 'History',       icon: HiOutlineClock },
    { id: 'checklists',    label: 'Checklists',    icon: HiOutlineCheckCircle },
  ];

  return (
    <div className="h-full flex flex-col bg-[#f5f5f5] min-h-screen">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back */}
            <button
              onClick={() => navigate('/helpdesk/tickets')}
              className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
            >
              <HiOutlineArrowLeft className="w-5 h-5" />
            </button>

            {/* Title block */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {/* REQ number — blue semibold like original */}
                <span className="text-blue-600 font-semibold">
                  {ticket.reqNumber || `#${String(id).slice(-6).toUpperCase()}`}
                </span>
                {/* Status badge */}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-700'}`}>
                  {fmtLabel(ticket.status)}
                </span>
                {/* Source badge */}
                {isExternal ? (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">External · Client</span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Internal</span>
                )}
                {/* Allocation exception state (server: exceptionStatus) */}
                {ticket.exceptionStatus === 'pending' && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200"
                    title="Awaiting approver decision — the over-capacity allocation is not counted until it is decided"
                  >
                    ⏳ Exception pending
                  </span>
                )}
                {ticket.exceptionStatus === 'approved' && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200"
                    title="Approved over-capacity allocation"
                  >
                    ✔ Exception approved
                  </span>
                )}
              </div>
              <h1 className="text-lg font-medium">{ticket.title}</h1>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Edit */}
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm"
            >
              <HiOutlinePencil className="w-4 h-4" /> Edit
            </button>

            {/* Assign */}
            <button
              onClick={() => setShowAssignModal(true)}
              className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm"
            >
              <HiOutlineUserAdd className="w-4 h-4" /> Assign
            </button>

            {/* Close Ticket — agents/admins only */}
            {canManage && ticket.status !== 'closed' && (
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={pendingApproval}
                title={pendingApproval ? 'Locked — awaiting approval' : undefined}
                className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <HiOutlineCheckCircle className="w-4 h-4" /> Close
              </button>
            )}

            {/* Actions dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowActions(v => !v)}
                className="flex items-center gap-1 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm"
              >
                Actions <HiOutlineChevronDown className="w-4 h-4" />
              </button>
              {showActions && (
                <ActionsDropdown
                  onClose={() => setShowActions(false)}
                  onAddNote={() => { setShowNoteModal(true); setShowActions(false); }}
                  onAddTask={() => { setShowAddTaskModal(true); setShowActions(false); }}
                  onAddReminder={() => { setShowReminderModal(true); setShowActions(false); }}
                  onDuplicate={() => { handleDuplicate(); setShowActions(false); }}
                  onDelete={canManage ? handleDelete : null}
                  onStatusChange={(s) => {
                    if (s === 'closed') {
                      setShowActions(false);
                      setShowCloseModal(true);
                    } else {
                      handleStatusChange(s);
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Pending Approval Banner ────────────────────────────────────────── */}
      {pendingApproval && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-2 text-sm text-amber-800">
          <HiOutlineClock className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>Approval Pending</strong> — ticket status is locked until the approver accepts or rejects.
          </span>
        </div>
      )}

      {/* ── Main two-column layout ─────────────────────────────────────────── */}
      <div className="flex-1 flex gap-5 p-6 overflow-auto min-h-0">

        {/* ── Left Panel ──────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 bg-white overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors
                  ${activeTab === t.id
                    ? 'text-blue-700 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-5">
            {activeTab === 'conversations' && (
              <ConversationsTab
                ticket={ticket}
                conversations={conversations}
                loading={convLoading}
                reply={reply}
                setReply={setReply}
                isInternal={isInternal}
                setIsInternal={setIsInternal}
                attachFile={attachFile}
                setAttachFile={setAttachFile}
                fileInputRef={fileInputRef}
                sending={sendingReply}
                onSend={handleSendReply}
              />
            )}
            {activeTab === 'details' && (
              <DetailsTab ticket={ticket} />
            )}
            {activeTab === 'documents' && (
              <DocumentsTab
                ticketId={ticket?._id ?? ticket?.id ?? id}
                docs={hdDocs}
                loading={hdDocsLoading}
                uploading={hdDocUploading}
                docFile={hdDocFile}
                setDocFile={setHdDocFile}
                docCategory={hdDocCategory}
                setDocCategory={setHdDocCategory}
                docCategoryOther={hdDocCategoryOther}
                setDocCategoryOther={setHdDocCategoryOther}
                canManage={canManage}
                onUpload={handleHdDocUpload}
                onDelete={handleHdDocDelete}
              />
            )}
            {activeTab === 'resolution' && (
              <ResolutionTab
                ticket={ticket}
                canManage={canManage}
                editing={editingResolution}
                draft={resolutionDraft}
                setDraft={setResolutionDraft}
                submitting={submitting}
                onEdit={() => { setEditingResolution(true); setResolutionDraft(ticket.resolution || ''); }}
                onCancel={() => setEditingResolution(false)}
                onSave={handleSaveResolution}
              />
            )}
            {activeTab === 'history' && (
              <HistoryTab history={history} loading={histLoading} />
            )}
            {activeTab === 'checklists' && (
              <SubTasksTab
                ticket={ticket}
                canManage={canManage}
                submitting={submitting}
                onToggle={handleToggleTask}
                onAdd={handleAddSubTask}
              />
            )}
          </div>
        </div>

        {/* ── Right Sidebar ────────────────────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 space-y-4">
          <AssignmentPanel
            ticket={ticket}
            user={user}
            canManage={canManage}
            submitting={submitting}
            onPickUp={handlePickUp}
            onAssign={() => { setAssignEditMode(false); setShowAssignModal(true); }}
            onEditAllocation={() => { setAssignEditMode(true); setShowAssignModal(true); }}
            onRemoveAssignee={handleRemoveAssignee}
            onUpdateAssigneeWeight={handleUpdateAssigneeWeight}
          />
          <ApprovalsPanel
            approvals={approvals}
            user={user}
            canManage={canManage}
            allUsers={allUsers}
            approverId={approverId}
            setApproverId={setApproverId}
            approvalNote={approvalNote}
            setApprovalNote={setApprovalNote}
            requestingApproval={requestingApproval}
            respondingId={respondingId}
            onRequest={handleRequestApproval}
            onRespond={handleRespondApproval}
          />
          <LinkedTeamsPanel
            ticket={ticket}
            id={id}
            canManage={canManage}
            dispatch={dispatch}
          />
          <PropertiesPanel ticket={ticket} />
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {showEditModal && (
        <EditModal
          ticket={ticket}
          submitting={editSaving}
          conflict={editConflict}
          onClearConflict={() => setEditConflict(null)}
          onClose={() => { setEditConflict(null); setShowEditModal(false); }}
          onRequested={() => { setEditConflict(null); setShowEditModal(false); dispatch(fetchTicketById(id)); }}
          onSave={async (data) => {
            setEditConflict(null);
            setEditSaving(true);
            try {
              await updateTicketApi(id, data);
              // Reload full ticket so associations (assignee name, group, etc.) are fresh
              dispatch(fetchTicketById(id));
              toast.success('Ticket updated');
              setShowEditModal(false);
            } catch (err) {
              // 409 = over capacity — nothing was saved; the modal shows the conflict box
              const body = err?.response?.data;
              if (err?.response?.status === 409 && body?.conflict) setEditConflict(body.conflict);
              else toast.error(body?.message || body?.error?.message || err?.message || 'Failed to update ticket');
            } finally { setEditSaving(false); }
          }}
        />
      )}
      {showAssignModal && (
        <AssignModal
          ticket={ticket}
          submitting={assignSaving}
          editMode={assignEditMode}
          conflict={assignConflict}
          onClearConflict={() => setAssignConflict(null)}
          onClose={() => { setAssignConflict(null); setShowAssignModal(false); }}
          onRequested={() => {
            setAssignConflict(null);
            setShowAssignModal(false);
            dispatch(fetchTicketById(id));
          }}
          onAssign={async ({ assigneeId, assigneeName: name, teamManagerId, allocationMode, allocationHoursPerDay, allocationTotalHours, allocationFrom, allocationTo }) => {
            setAssignConflict(null);
            setAssignSaving(true);
            try {
              await updateTicketApi(id, {
                assigneeId, assigneeName: name, teamManagerId,
                allocationMode, allocationHoursPerDay, allocationTotalHours, allocationFrom, allocationTo,
              });
              // Reload full ticket so assigneeUser.name (and all JOINs) are fresh in the sidebar
              dispatch(fetchTicketById(id));
              toast.success('Ticket assigned');
              setShowAssignModal(false);
            } catch (err) {
              // 409 = the agent would be over capacity — the assignment was refused
              const body = err?.response?.data;
              if (err?.response?.status === 409 && body?.conflict) setAssignConflict(body.conflict);
              else toast.error(body?.message || body?.error?.message || err?.message || 'Failed to assign ticket');
            } finally { setAssignSaving(false); }
          }}
        />
      )}
      {showNoteModal && (
        <AddNoteModal
          ticketId={id}
          onClose={() => setShowNoteModal(false)}
          onAdded={() => { if (activeTab === 'conversations') loadConversations(); }}
        />
      )}
      {showReminderModal && (
        <AddReminderModal ticketId={id} onClose={() => { setShowReminderModal(false); loadHistory(); }} />
      )}
      {showAddTaskModal && (
        <AddTaskModal
          ticketId={id}
          onClose={() => setShowAddTaskModal(false)}
          onAdd={handleAddSubTask}
        />
      )}
      {showCloseModal && (
        <CloseTicketModal
          ticket={ticket}
          id={id}
          onClose={() => setShowCloseModal(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActionsDropdown
// ---------------------------------------------------------------------------

function ActionsDropdown({ onClose, onAddNote, onAddTask, onAddReminder, onDuplicate, onDelete, onStatusChange }) {
  const hdOptions = useSelector(selectHdOptions);
  const statusOptions = hdOptions?.status?.length ? hdOptions.status.map(o => o.name) : STATUS_OPTIONS;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-1.5 overflow-hidden">
        <button
          onClick={onAddNote}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <HiOutlineChatAlt2 className="w-4 h-4 text-gray-400" />
          Add Note
        </button>
        <button
          onClick={onAddTask}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <HiOutlineCheckCircle className="w-4 h-4 text-gray-400" />
          Add Task
        </button>
        <button
          onClick={onAddReminder}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <HiOutlineBell className="w-4 h-4 text-gray-400" />
          Add Reminder
        </button>
        <button
          onClick={onDuplicate}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
        >
          <HiOutlineDocumentDuplicate className="w-4 h-4 text-gray-400" />
          Duplicate
        </button>

        <div className="border-t border-gray-100 my-1" />
        <p className="px-4 py-1 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Change Status</p>
        {statusOptions.map(s => (
          <button
            key={s}
            onClick={() => onStatusChange(s)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 pl-8"
          >
            {fmtLabel(s)}
          </button>
        ))}

        {onDelete && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={onDelete}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <HiOutlineTrash className="w-4 h-4" />
              Delete
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// ConversationsTab
// ---------------------------------------------------------------------------

function ConversationsTab({
  ticket, conversations, loading,
  reply, setReply, isInternal, setIsInternal,
  attachFile, setAttachFile, fileInputRef,
  sending, onSend,
}) {
  const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB

  const handleAttachFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`);
      e.target.value = ''; // reset the file input
      return;
    }
    setAttachFile(file);
  };

  return (
    <div className="space-y-4">
      {/* Original ticket description as first card */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <div className="flex items-start gap-3">
          <Avatar name={ticket.requesterUser?.name || ticket.requester?.name || ticket.requesterName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-sm font-semibold text-gray-900">
                {ticket.requesterUser?.name || ticket.requester?.name || ticket.requesterName || 'Requester'}
              </span>
              <span className="text-xs text-gray-400">{fmtDate(ticket.created_at)}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600">Original</span>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {ticket.description || 'No description provided.'}
            </p>
          </div>
        </div>
      </div>

      {/* Conversation thread */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse bg-gray-50 rounded-xl p-4 flex gap-3">
              <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-1/4" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">No replies yet.</div>
      ) : (
        <div className="space-y-3">
          {[...conversations]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map(c => (
              <div
                key={c._id || c.id}
                className={`rounded-xl border p-4 ${
                  c.isInternal || c.is_internal
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.author?.name || c.authorName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {c.author?.name || c.authorName || 'Employee'}
                      </span>
                      {(c.isInternal || c.is_internal) && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-100 text-yellow-700">
                          Internal Note
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{c.message}</p>
                    {c.attachmentUrl && (
                      <a
                        href={c.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <HiOutlinePaperClip className="w-3.5 h-3.5" />
                        {c.attachmentName || 'Attachment'}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Reply form */}
      <div className={`rounded-xl border p-4 ${isInternal ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'}`}>
        <textarea
          rows={4}
          value={reply}
          onChange={e => setReply(e.target.value)}
          placeholder={isInternal ? 'Add an internal note (not visible to requester)...' : 'Type your reply...'}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
        />

        {/* File attachment preview */}
        {attachFile && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
            <HiOutlinePaperClip className="w-4 h-4 text-gray-400" />
            <span className="truncate">{attachFile.name}</span>
            <button
              onClick={() => setAttachFile(null)}
              className="ml-auto text-gray-400 hover:text-red-500"
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 select-none">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={e => setIsInternal(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              Mark as internal note
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Attach file"
            >
              <HiOutlinePaperClip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.zip,.txt"
              onChange={handleAttachFileChange}
            />
          </div>
          <button
            onClick={onSend}
            disabled={sending || !reply.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DetailsTab
// ---------------------------------------------------------------------------

function DetailsTab({ ticket }) {
  const fields = [
    ['Request Type', fmtLabel(ticket.requestType)],
    ['Mode',         fmtLabel(ticket.mode)],
    ['Impact',       fmtLabel(ticket.impact)],
    ['Urgency',      fmtLabel(ticket.urgency)],
    ['Category',     ticket.category || '—'],
    ['Due Date',     ticket.dueDate ? fmtDate(ticket.dueDate) : '—'],
    ['Site',         ticket.site || '—'],
    ['Team',         ticket.teamManager?.name || ticket.group?.name || ticket.groupName || '—'],
    ['Project',      ticket.pmProject?.name || ticket.project?.name || ticket.projectName || '—'],
    ['Raised by Team', ticket.raisedByTeam || ticket.team || '—'],
    ['SLA Status',   ticket.slaBreached === true
      ? <span className="text-red-600 font-semibold">Breached</span>
      : ticket.slaBreached === false
        ? <span className="text-emerald-600 font-semibold">On Track</span>
        : '—'],
  ];

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
      {fields.map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-sm font-medium text-gray-800">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubTasksTab
// ---------------------------------------------------------------------------

function SubTasksTab({ ticket, canManage, submitting, onToggle, onAdd }) {
  const [adding, setAdding]   = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const subTasks = ticket?.tasks || [];

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await onAdd(newTitle.trim());
    setNewTitle('');
    setAdding(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-700">
          {subTasks.length} task{subTasks.length !== 1 ? 's' : ''}
          {subTasks.length > 0 && (
            <span className="ml-1 text-gray-400 font-normal">
              · {subTasks.filter(t => t.status === 'done').length} done
            </span>
          )}
        </p>
        {canManage && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <HiOutlinePlus className="w-3.5 h-3.5" />
            Add Task
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
          <input
            autoFocus
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Task title..."
            className="flex-1 px-3 py-1.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          <button
            onClick={handleAdd}
            disabled={submitting || !newTitle.trim()}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setNewTitle(''); }}
            className="text-gray-400 hover:text-gray-600"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
      )}

      {subTasks.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          <HiOutlineCheckCircle className="w-10 h-10 mx-auto mb-2 text-gray-200" />
          No sub-tasks yet.
          {canManage && <span className="block mt-1">Click "Add Task" to create one.</span>}
        </div>
      ) : (
        <div className="space-y-2">
          {subTasks.map((task, i) => (
            <div
              key={task._id ?? task.id ?? i}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={task.status === 'done'}
                onChange={() => onToggle(task)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
              />
              <span className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {task.title}
              </span>
              {task.assigneeName && (
                <span className="text-xs text-gray-500 flex-shrink-0">{task.assigneeName}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                task.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {task.status === 'done' ? 'Done' : 'Open'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoryTab
// ---------------------------------------------------------------------------

const HISTORY_FIELD_LABELS = {
  assigneeId:    'Assignee',
  teamManagerId: 'Team manager',
  groupId:       'Group',          // legacy history rows only
  projectId:     'Project',
  status:       'Status',
  priority:     'Priority',
  title:        'Subject',
  description:  'Description',
  dueDate:      'Due Date',
  category:     'Category',
  requestType:  'Request Type',
  mode:         'Mode',
  impact:       'Impact',
  urgency:      'Urgency',
  site:         'Site',
  raisedByTeam: 'Raised By Team',
  resolution:   'Resolution',
};

function historyFieldLabel(field) {
  if (!field) return '—';
  return HISTORY_FIELD_LABELS[field]
    || field.replace(/([A-Z])/g, ' $1').trim();
}

function historyValue(raw, display) {
  // Prefer backend-resolved display name
  if (display) return display;
  if (raw === null || raw === undefined || raw === '' || raw === '0' || raw === 'null') return '—';
  const s = String(raw);
  // Truncate bare UUIDs (36 chars with dashes) — should not appear after backend enrichment
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s.slice(0, 8) + '…';
  }
  return s;
}

function HistoryTab({ history, loading }) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        <HiOutlineClock className="w-10 h-10 mx-auto mb-2 text-gray-200" />
        No history recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[11px] text-gray-400 uppercase tracking-wider border-b border-gray-200">
            <th className="pb-2 px-2 font-semibold">Field</th>
            <th className="pb-2 px-2 font-semibold">From</th>
            <th className="pb-2 px-2 font-semibold">To</th>
            <th className="pb-2 px-2 font-semibold">By</th>
            <th className="pb-2 px-2 font-semibold whitespace-nowrap">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {history.map((h, i) => (
            <tr key={h._id ?? h.id ?? i} className="hover:bg-gray-50 transition-colors">
              <td className="py-2.5 px-2 font-medium text-gray-700">
                {historyFieldLabel(h.field || h.fieldName)}
              </td>
              <td className="py-2.5 px-2 text-gray-400 max-w-[140px] truncate">
                {historyValue(h.oldValue ?? h.from, h.oldDisplay)}
              </td>
              <td className="py-2.5 px-2 text-gray-800 max-w-[140px] truncate">
                {historyValue(h.newValue ?? h.to, h.newDisplay)}
              </td>
              <td className="py-2.5 px-2 text-gray-600 whitespace-nowrap">
                {h.changedByName || h.changedBy?.name || '—'}
              </td>
              <td className="py-2.5 px-2 text-gray-400 text-xs whitespace-nowrap">
                {fmtDate(h.changedAt || h.changed_at || h.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocumentsTab
// ---------------------------------------------------------------------------

const HD_DOC_CATEGORY_COLORS = {
  'SOW / Client Contracts': 'bg-blue-100 text-blue-700',
  'Requirement Documents / BRD': 'bg-purple-100 text-purple-700',
  'Solution Architecture Documents': 'bg-emerald-100 text-emerald-700',
  'Technical Design Documentation': 'bg-orange-100 text-orange-700',
  'Others': 'bg-gray-100 text-gray-600',
};

function DocumentsTab({
  ticketId, docs, loading, uploading,
  docFile, setDocFile, docCategory, setDocCategory,
  docCategoryOther, setDocCategoryOther,
  canManage, onUpload, onDelete,
}) {
  const formatBytes = (n) => {
    if (!n) return '—';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Upload form — managers only */}
      {canManage && (
        <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload Document</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select
                value={docCategory}
                onChange={e => setDocCategory(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {HD_DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {docCategory === 'Others' && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Specify Category</label>
                <input
                  value={docCategoryOther}
                  onChange={e => setDocCategoryOther(e.target.value)}
                  placeholder="Enter category name"
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex-1 min-w-40">
              <label className="text-xs text-gray-500 block mb-1">File</label>
              <input
                type="file"
                onChange={e => setDocFile(e.target.files[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <button
              onClick={onUpload}
              disabled={uploading || !docFile}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12">
          <HiOutlineDocumentText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No documents uploaded yet</p>
          {canManage && <p className="text-xs text-gray-400 mt-1">Use the form above to upload files.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const docId = doc._id || doc.id;
            const catColor = HD_DOC_CATEGORY_COLORS[doc.category] || 'bg-gray-100 text-gray-600';
            return (
              <div key={docId} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 group transition-colors">
                <HiOutlineDocumentText className="w-8 h-8 text-gray-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.filename || doc.originalName}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${catColor}`}>{doc.category}</span>
                    <span>{formatBytes(doc.sizeBytes || doc.size)}</span>
                    {(doc.uploadedBy?.name || doc.uploaderName) && <span>by {doc.uploadedBy?.name || doc.uploaderName}</span>}
                    {doc.createdAt && <span>{new Date(doc.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={downloadHdDocumentUrl(ticketId, docId)}
                    download
                    className="p-1.5 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 transition-colors"
                    title="Download"
                  >
                    <HiOutlineDownload className="w-4 h-4" />
                  </a>
                  {canManage && (
                    <button
                      onClick={() => onDelete(docId)}
                      className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
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
  );
}

// ---------------------------------------------------------------------------
// ResolutionTab
// ---------------------------------------------------------------------------

function ResolutionTab({ ticket, canManage, editing, draft, setDraft, submitting, onEdit, onCancel, onSave }) {
  if (editing) {
    return (
      <div className="space-y-3">
        <textarea
          autoFocus
          rows={8}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Describe the resolution..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving...' : 'Save Resolution'}
          </button>
        </div>
      </div>
    );
  }

  if (ticket.resolution) {
    return (
      <div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-emerald-700">Resolution</p>
            </div>
            {canManage && (
              <button
                onClick={onEdit}
                className="text-xs text-emerald-700 hover:text-emerald-900 underline flex-shrink-0"
              >
                Edit
              </button>
            )}
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{ticket.resolution}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <HiOutlineDocumentText className="w-12 h-12 mx-auto mb-3 text-gray-200" />
      <p className="text-sm text-gray-500 mb-4">No resolution added yet.</p>
      {canManage && (
        <button
          onClick={onEdit}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add Resolution
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PropertiesPanel  (right sidebar, panel 1)
// ---------------------------------------------------------------------------

function PropertiesPanel({ ticket }) {
  const requesterName  = ticket.requesterUser?.name  || ticket.requester?.name  || ticket.requesterName  || '—';
  const requesterEmail = ticket.requesterUser?.email || ticket.requester?.email || ticket.requesterEmail || '';
  const assigneeName   = ticket.assigneeUser?.name   || ticket.assignee?.name   || ticket.assigneeName   || null;

  const slaEl = ticket.slaBreached === true
    ? <span className="text-red-600 font-semibold text-xs">Breached</span>
    : ticket.slaBreached === false
      ? <span className="text-emerald-600 font-semibold text-xs">On Track</span>
      : <span className="text-gray-400 text-xs">—</span>;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Properties</h3>

      {/* Status */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Status</p>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[ticket.status] || 'bg-gray-100 text-gray-600'}`}>
          {fmtLabel(ticket.status)}
        </span>
      </div>

      {/* Priority */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Priority</p>
        <span className={`text-sm font-semibold capitalize ${PRIORITY_COLORS[ticket.priority] || 'text-gray-600'}`}>
          {fmtLabel(ticket.priority)}
        </span>
      </div>

      {/* Requester */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Requester</p>
        <p className="text-sm font-medium text-gray-800">{requesterName}</p>
        {requesterEmail && <p className="text-xs text-gray-400 mt-0.5 truncate">{requesterEmail}</p>}
      </div>

      {/* Assignee */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Assignee</p>
        {assigneeName ? (
          <div className="flex items-center gap-2">
            <Avatar name={assigneeName} size="sm" />
            <p className="text-sm font-medium text-gray-800">{assigneeName}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Unassigned</p>
        )}
      </div>

      {/* Created */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">Created</p>
        <p className="text-xs text-gray-600">{fmtDate(ticket.created_at)}</p>
      </div>

      {/* SLA */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">SLA</p>
        {slaEl}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssignmentPanel  (right sidebar, panel 2)
// ---------------------------------------------------------------------------

function AssignmentPanel({ ticket, user, canManage, submitting, onPickUp, onAssign, onEditAllocation, onRemoveAssignee, onUpdateAssigneeWeight }) {
  const assigneeName   = ticket.assigneeUser?.name || ticket.assignee?.name  || ticket.assigneeName  || null;
  const multiAssignees = ticket.assignees || [];
  const [editingWeightId, setEditingWeightId] = useState(null);
  const [weightDraft, setWeightDraft]         = useState('');

  // Phase 3 — effort allocation (DECIMAL comes back as a string from MySQL)
  // formatAllocation reads hoursPerDay; tickets carry allocationHoursPerDay, so alias it
  const allocLabel = formatAllocation({ ...ticket, hoursPerDay: ticket.allocationHoursPerDay }, 8);
  const allocTo    = ticket.allocationTo || (ticket.dueDate ? isoDate(ticket.dueDate) : null);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assignment</h3>

      {/* Primary assignee */}
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider mb-1.5">Assigned To</p>
        {assigneeName ? (
          <div>
            <div className="flex items-center gap-2">
              <Avatar name={assigneeName} size="sm" />
              <span className="text-sm font-medium text-gray-800">{assigneeName}</span>
            </div>
            {allocLabel ? (
              <div className="flex items-center gap-2 mt-1.5 pl-9">
                <span className="text-xs text-gray-600" title="Effort allocation — counts against this agent's capacity">
                  <HiOutlineClock className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-indigo-500" />
                  {allocLabel} · {fmtDdMmm(ticket.allocationFrom)} → {fmtDdMmm(allocTo)}
                </span>
                {canManage && (
                  <button
                    type="button"
                    onClick={onEditAllocation}
                    className="text-[11px] text-indigo-500 hover:text-indigo-700 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400 mt-1.5 pl-9">No effort allocation — Reassign to set</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">Unassigned</p>
        )}
      </div>

      {/* Multi-assignees from ticket.assignees[] */}
      {multiAssignees.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-400 uppercase tracking-wider">Team Members</p>
          {multiAssignees.map((a, i) => {
            const key       = a._id || a.id || i;
            const isEditing = editingWeightId === key;
            const displayName = a.name || a.assigneeName;
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Avatar name={displayName} size="sm" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{displayName}</span>
                  {a.weight != null && Number(a.weight) > 0 && !isEditing && (
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 flex-shrink-0">
                      {Number(a.weight)}%
                    </span>
                  )}
                  {canManage && (
                    <>
                      <button
                        onClick={() => {
                          if (isEditing) {
                            setEditingWeightId(null);
                          } else {
                            setEditingWeightId(key);
                            setWeightDraft(a.weight != null ? String(Number(a.weight)) : '0');
                          }
                        }}
                        className="text-[11px] text-indigo-500 hover:text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 hover:bg-indigo-50 flex-shrink-0"
                        title="Set contribution %"
                      >
                        %
                      </button>
                      <button
                        onClick={() => onRemoveAssignee?.(a._id || a.id)}
                        className="text-gray-400 hover:text-red-500 flex-shrink-0"
                        title="Remove assignee"
                      >
                        <HiOutlineX className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
                {isEditing && (
                  <div className="flex items-center gap-1.5 pl-9">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={weightDraft}
                      onChange={e => setWeightDraft(e.target.value)}
                      className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <span className="text-xs text-gray-400">%</span>
                    <button
                      onClick={async () => {
                        await onUpdateAssigneeWeight?.(a._id || a.id, Number(weightDraft));
                        setEditingWeightId(null);
                      }}
                      className="px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingWeightId(null)}
                      className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <HiOutlineX className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        {/* Pick Up: self-assign if no assignee */}
        {!assigneeName && (
          <button
            onClick={onPickUp}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <HiOutlineUser className="w-4 h-4" />
            Pick Up
          </button>
        )}
        {/* Assign button */}
        {canManage && (
          <button
            onClick={onAssign}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <HiOutlineUserAdd className="w-4 h-4" />
            {assigneeName ? 'Reassign' : 'Assign'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ApprovalsPanel  (right sidebar, panel 3)
// ---------------------------------------------------------------------------

function ApprovalsPanel({
  approvals, user, canManage,
  allUsers, approverId, setApproverId,
  approvalNote, setApprovalNote,
  requestingApproval, respondingId,
  onRequest, onRespond,
}) {
  const [showRequestForm, setShowRequestForm] = useState(false);

  const approverOptions = allUsers.filter(u =>
    ['admin', 'manager', 'senior_manager', 'md', 'director'].includes(u.role)
  );

  const approvalStatusStyle = (s) => {
    if (s === 'approved') return 'bg-emerald-100 text-emerald-700';
    if (s === 'rejected') return 'bg-red-100 text-red-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Approvals</h3>

      {approvals.length === 0 && (
        <p className="text-xs text-gray-400">No approval requested yet.</p>
      )}

      {/* Approval cards */}
      <div className="space-y-2">
        {approvals.map((a) => {
          const myId = String(user?._id ?? user?.id ?? '');
          const isMe = user && myId && (
            myId === String(a.approverId ?? '') ||
            myId === String(a.approver?._id ?? a.approver?.id ?? '')
          );
          const isPending = a.status === 'pending';
          const aId = a._id || a.id;

          return (
            <div key={aId} className="border border-gray-200 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={a.approver?.name || a.approverName} size="sm" />
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {a.approver?.name || a.approverName || 'Approver'}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize flex-shrink-0 ${approvalStatusStyle(a.status)}`}>
                  {a.status || 'pending'}
                </span>
              </div>
              {(a.requestedBy?.name || a.requestedByName) && (
                <p className="text-[11px] text-gray-400">
                  Requested by {a.requestedBy?.name || a.requestedByName}
                </p>
              )}
              {(a.notes || a.note) && (
                <p className="text-[11px] text-gray-500 mt-1 italic">"{a.notes || a.note}"</p>
              )}
              {/* Approve/Reject buttons for the approver themselves */}
              {isMe && isPending && (
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => onRespond(aId, 'approve')}
                    disabled={respondingId === aId}
                    className="flex-1 flex items-center justify-center gap-1 text-xs bg-emerald-600 text-white rounded-lg py-1.5 hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <HiOutlineCheck className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => onRespond(aId, 'reject')}
                    disabled={respondingId === aId}
                    className="flex-1 flex items-center justify-center gap-1 text-xs bg-white border border-red-300 text-red-600 rounded-lg py-1.5 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    <HiOutlineX className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Request Approval form */}
      {canManage && (
        showRequestForm ? (
          <div className="border border-gray-200 rounded-xl p-3 space-y-2.5">
            <select
              value={approverId}
              onChange={e => setApproverId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select approver...</option>
              {approverOptions.map(u => (
                <option key={u._id || u.id} value={u._id || u.id}>
                  {u.name} ({fmtLabel(u.role)})
                </option>
              ))}
            </select>
            <textarea
              value={approvalNote}
              onChange={e => setApprovalNote(e.target.value)}
              rows={2}
              placeholder="Note (optional)"
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={async () => { await onRequest(); setShowRequestForm(false); }}
                disabled={requestingApproval || !approverId}
                className="flex-1 text-sm bg-blue-600 text-white rounded-lg py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {requestingApproval ? 'Sending...' : 'Request'}
              </button>
              <button
                onClick={() => setShowRequestForm(false)}
                className="px-3 text-sm border border-gray-200 rounded-lg py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowRequestForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <HiOutlineUserAdd className="w-4 h-4" />
            Request Approval
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditModal
// ---------------------------------------------------------------------------

function EditModal({ ticket, submitting, conflict = null, onClearConflict, onClose, onSave, onRequested }) {
  const [showException, setShowException] = useState(false);
  /**
   * Allocation overrides applied from a 409 suggestion. The edit form has no
   * allocation inputs of its own, so a suggestion is carried here and merged
   * into the next save (and into the exception request).
   */
  const [allocPatch, setAllocPatch] = useState(null);
  // ── Pull configurable options from Redux ─────────────────────────────────
  const hdOpts = useSelector(selectHdOptions);
  const editOptRequestType = (hdOpts?.request_type || []).map(o => o.name);
  const editOptMode        = (hdOpts?.mode         || []).map(o => o.name);
  const editOptImpact      = (hdOpts?.impact       || []).map(o => o.name);
  const editOptUrgency     = (hdOpts?.urgency      || []).map(o => o.name);
  const editOptCategory    = (hdOpts?.category     || []).map(o => o.name);
  const editOptStatus      = hdOpts?.status?.length ? hdOpts.status.map(o => o.name) : STATUS_OPTIONS;

  const toDTLocal = (v) => {
    if (!v) return '';
    const s = String(v);
    const t = s.includes('T') ? s : s.replace(' ', 'T');
    return t.slice(0, 16);
  };

  const [form, setForm] = useState({
    title:         ticket.title        || '',
    description:   ticket.description  || '',
    requestType:   ticket.requestType  || 'Incident',
    status:        ticket.status       || 'open',
    priority:      ticket.priority     || 'medium',
    mode:          ticket.mode         || '',
    category:      ticket.category     || '',
    impact:        ticket.impact       || '',
    urgency:       ticket.urgency      || '',
    dueDate:       toDTLocal(ticket.dueDate),
    teamManagerId: ticketTeamManagerId(ticket),
    assigneeId:    ticket.assigneeUser?._id || ticket.assignee?._id || ticket.assignee?.id || ticket.assigneeId || '',
    site:          ticket.site         || '',
    raisedByTeam:  ticket.raisedByTeam || ticket.team       || '',
    resolution:    ticket.resolution   || '',
  });

  // Team / Manager → Assign to (members of that team only)
  const { options: teamOptions, loading: teamsLoading }     = useTeamOptions(ticket.teamManager);
  const { options: memberOptions, loading: membersLoading } = useTeamMembers(form.teamManagerId);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Original values, normalised the same way the form state was initialised
    const original = {
      title:        ticket.title        || '',
      description:  ticket.description  || '',
      requestType:  ticket.requestType  || 'Incident',
      status:       ticket.status       || 'open',
      priority:     ticket.priority     || 'medium',
      mode:         ticket.mode         || '',
      category:     ticket.category     || '',
      impact:       ticket.impact       || '',
      urgency:      ticket.urgency      || '',
      dueDate:      toDTLocal(ticket.dueDate),
      teamManagerId: ticketTeamManagerId(ticket),
      assigneeId:   ticket.assigneeUser?._id || ticket.assignee?._id || ticket.assignee?.id || ticket.assigneeId || '',
      site:         ticket.site         || '',
      raisedByTeam: ticket.raisedByTeam || ticket.team || '',
      resolution:   ticket.resolution   || '',
    };

    // Build payload containing only fields that actually changed
    const payload = {};
    for (const field of Object.keys(original)) {
      if (String(form[field] ?? '') !== String(original[field] ?? '')) {
        // Fields that must be sent as null when cleared (not empty string)
        if (field === 'dueDate' || field === 'teamManagerId' || field === 'assigneeId') {
          payload[field] = form[field] || null;
        } else {
          payload[field] = form[field];
        }
      }
    }

    // Allocation fixes picked from a 409 conflict box travel with the save
    if (allocPatch) Object.assign(payload, allocPatch);

    // Nothing changed — close without making an API call
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    onSave(payload);
  };

  /** Apply a 409 suggestion — kept as an override until the next save. */
  const applySuggestion = (patch) => {
    setAllocPatch(prev => ({ ...(prev || {}), ...patch }));
    onClearConflict?.();
  };

  // What the exception would be requested for: the ticket's allocation + any fix applied here
  const exceptionAllocation = {
    assigneeId:            form.assigneeId || undefined,
    assigneeName:          ticket.assigneeUser?.name || ticket.assignee?.name || ticket.assigneeName,
    allocationMode:        allocPatch?.allocationMode ?? ticket.allocationMode ?? 'per_day',
    allocationHoursPerDay: allocPatch?.allocationHoursPerDay ?? (ticket.allocationHoursPerDay != null ? Number(ticket.allocationHoursPerDay) : null),
    allocationTotalHours:  allocPatch?.allocationTotalHours  ?? (ticket.allocationTotalHours  != null ? Number(ticket.allocationTotalHours)  : null),
    allocationFrom:        allocPatch?.allocationFrom ?? ticket.allocationFrom,
    allocationTo:          allocPatch?.allocationTo   ?? ticket.allocationTo,
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Ticket</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={set('title')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
              <textarea
                rows={4}
                value={form.description}
                onChange={set('description')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Row: Request Type, Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Request Type</label>
                <select value={form.requestType} onChange={set('requestType')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {(editOptRequestType.length ? editOptRequestType : FALLBACK_REQUEST_TYPES).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                <select value={form.status} onChange={set('status')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {editOptStatus.map(v => <option key={v} value={v}>{fmtLabel(v)}</option>)}
                </select>
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <div className="flex gap-2">
                {['low', 'medium', 'high', 'critical'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ring-2 ${
                      form.priority === p ? `${PRIORITY_BTN[p]} ring-opacity-100` : 'bg-gray-50 text-gray-500 ring-transparent hover:ring-gray-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Row: Mode, Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mode</label>
                <select value={form.mode} onChange={set('mode')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>
                  {(editOptMode.length ? editOptMode : FALLBACK_MODES).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                <select value={form.category} onChange={set('category')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>
                  {(editOptCategory.length ? editOptCategory : ['General', 'Hardware', 'Software', 'Network', 'Security']).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row: Impact, Urgency */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Impact</label>
                <select value={form.impact} onChange={set('impact')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>
                  {(editOptImpact.length ? editOptImpact : FALLBACK_IMPACTS).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Urgency</label>
                <select value={form.urgency} onChange={set('urgency')}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>
                  {(editOptUrgency.length ? editOptUrgency : FALLBACK_URGENCIES).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
              <input
                type="datetime-local"
                value={form.dueDate}
                onChange={set('dueDate')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Row: Team / Manager, Assign to */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Team / Manager</label>
                <SearchSelect
                  size="md"
                  options={teamOptions}
                  loading={teamsLoading}
                  value={form.teamManagerId}
                  placeholder="— Select team —"
                  onChange={(v) => setForm(f => ({ ...f, teamManagerId: v || '', assigneeId: '' }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to</label>
                <SearchSelect
                  size="md"
                  options={memberOptions}
                  loading={membersLoading}
                  value={form.assigneeId}
                  disabled={!form.teamManagerId}
                  placeholder={form.teamManagerId ? '— Unassigned —' : 'Select a team first'}
                  onChange={(v) => setForm(f => ({ ...f, assigneeId: v || '' }))}
                />
              </div>
            </div>

            {/* Row: Site, Raised by Team */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Site</label>
                <input
                  type="text"
                  value={form.site}
                  onChange={set('site')}
                  placeholder="e.g. Head Office"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Requester team</label>
                <div className="w-full px-3 py-2 border border-gray-100 bg-gray-50 rounded-lg text-sm text-gray-700">
                  {form.raisedByTeam || '—'}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">From the requester's department in the employee master</p>
              </div>
            </div>

            {/* Resolution */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Resolution</label>
              <textarea
                rows={3}
                value={form.resolution}
                onChange={set('resolution')}
                placeholder="Describe the resolution..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Server refused the change (HTTP 409) — the agent would be over capacity */}
            <TicketConflictPanel
              compact
              conflict={conflict}
              capacity={8}
              onApply={applySuggestion}
              onRequestException={() => setShowException(true)}
            />
            {allocPatch && !conflict && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                Allocation fix applied — save to send it:
                {allocPatch.allocationHoursPerDay != null ? ` ${allocPatch.allocationHoursPerDay} h/day` : ''}
                {allocPatch.allocationFrom ? ` · from ${allocPatch.allocationFrom}` : ''}
                {allocPatch.allocationTo ? ` · until ${allocPatch.allocationTo}` : ''}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {conflict && showException && (
        <TicketExceptionModal
          open
          ticketId={ticket?._id ?? ticket?.id}
          ticket={ticket}
          conflict={conflict}
          allocation={exceptionAllocation}
          onClose={() => setShowException(false)}
          onRequested={(result) => { setShowException(false); onRequested?.(result); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssignModal
// ---------------------------------------------------------------------------

function AssignModal({ ticket, submitting, editMode = false, conflict = null, onClearConflict, onClose, onAssign, onRequested }) {
  const [showException, setShowException] = useState(false);
  const currentAssigneeId = ticket?.assigneeId || ticket?.assigneeUser?._id || ticket?.assigneeUser?.id || null;
  // Team / Manager — pre-selected with the ticket's current team
  const [teamManagerId, setTeamManagerId] = useState(ticketTeamManagerId(ticket));
  // "Edit allocation" path: pre-select the current assignee (only meaningful when a team is set)
  const [selectedUserId, setSelectedUserId] = useState(() => (editMode && currentAssigneeId ? String(currentAssigneeId) : ''));

  const { options: teamOptions, loading: teamsLoading }              = useTeamOptions(ticket?.teamManager);
  const { members, options: memberOptions, loading: membersLoading } = useTeamMembers(teamManagerId);

  const selectedUser = (() => {
    if (!selectedUserId) return null;
    const m = members.find(u => String(u._id ?? u.id) === selectedUserId);
    if (m) return m;
    // Members not loaded yet (or legacy assignee outside the team): fall back to the ticket's assignee record
    if (editMode && String(currentAssigneeId) === selectedUserId && ticket?.assigneeUser) {
      return { ...ticket.assigneeUser, _id: currentAssigneeId };
    }
    return null;
  })();

  // ── Phase 3: effort allocation (pre-filled from ticket when present) ──────
  // Mode: the ticket's own mode; a legacy ticket with only a per-day figure opens in per_day; otherwise "Total hours".
  const [alloc, setAlloc] = useState(() => {
    const tHpd   = ticket?.allocationHoursPerDay != null && ticket.allocationHoursPerDay !== '' ? Number(ticket.allocationHoursPerDay) : null;
    const tTotal = ticket?.allocationTotalHours  != null && ticket.allocationTotalHours  !== '' ? Number(ticket.allocationTotalHours)  : null;
    const mode   = ticket?.allocationMode === 'per_day' || ticket?.allocationMode === 'total'
      ? ticket.allocationMode
      : (tHpd != null && tTotal == null ? 'per_day' : 'total');
    return {
      allocationMode:       mode,
      hoursPerDay:          mode === 'per_day' ? (tHpd ?? DEFAULT_ALLOC_HOURS) : null,
      allocationTotalHours: mode === 'total'   ? (tTotal ?? DEFAULT_ALLOC_TOTAL) : null,
    };
  });
  const [allocDerived, setAllocDerived] = useState({ hoursPerDay: null, totalHours: null, workingDays: null });
  const [allocFrom, setAllocFrom] = useState(ticket?.allocationFrom || todayIso());
  const [allocTo,   setAllocTo]   = useState(ticket?.allocationTo   || defaultAllocTo(ticket));
  const [availability, setAvailability] = useState(null);   // GET /pm/users/:id/availability
  const [availLoading, setAvailLoading] = useState(false);

  // Capacity feedback for the selected agent over the chosen window
  const selectedUid = selectedUser ? (selectedUser._id || selectedUser.id) : null;
  useEffect(() => {
    const uid = selectedUid;
    if (!uid || !allocFrom || !allocTo || allocFrom > allocTo) { setAvailability(null); return; }
    let alive = true;
    setAvailLoading(true);
    api.get(`/pm/users/${uid}/availability`, { params: { fromDate: allocFrom, toDate: allocTo } })
      .then(res => { if (alive) setAvailability(res.data?.data ?? res.data ?? null); })
      .catch(() => { if (alive) setAvailability(null); })
      .finally(() => { if (alive) setAvailLoading(false); });
    return () => { alive = false; };
  }, [selectedUid, allocFrom, allocTo]);

  const isTotal      = alloc.allocationMode === 'total';
  const rawNum       = Number(isTotal ? alloc.allocationTotalHours : alloc.hoursPerDay);
  const hoursValid   = Number.isFinite(rawNum) && rawNum >= 0.5 && rawNum <= (isTotal ? 9999 : 12) && Math.round(rawNum * 2) === rawNum * 2;
  // Derived per-day: the entered value in per_day mode, total ÷ working days in total mode (null until resolved)
  const hoursNum     = isTotal ? allocDerived.hoursPerDay : rawNum;
  const datesValid   = !!allocFrom && !!allocTo && allocFrom <= allocTo;
  const capacity     = Number(availability?.capacity ?? 0);
  const peakHours    = Number(availability?.peakHours ?? 0);
  const freeHours    = Number(availability?.freeHours ?? 0);
  const wouldExceed  = availability && hoursValid && hoursNum != null && capacity > 0 && (peakHours + hoursNum > capacity);
  const round1       = (n) => Math.round(n * 10) / 10;

  /** Apply a 409 suggestion to this modal's allocation form. */
  const applySuggestion = (patch) => {
    if (patch.allocationFrom) setAllocFrom(patch.allocationFrom);
    if (patch.allocationTo)   setAllocTo(patch.allocationTo);
    if (patch.allocationHoursPerDay != null) {
      setAlloc({
        allocationMode:       'per_day',
        hoursPerDay:          Number(patch.allocationHoursPerDay),
        allocationTotalHours: null,
      });
    }
    onClearConflict?.();
  };

  const handleConfirm = () => {
    if (!selectedUser || !teamManagerId || !hoursValid || !datesValid) return;
    const uid = selectedUser._id || selectedUser.id;
    onAssign({
      assigneeId:            uid,
      assigneeName:          selectedUser.name,
      teamManagerId,
      allocationMode:        isTotal ? 'total' : 'per_day',
      allocationHoursPerDay: hoursNum ?? null,
      allocationTotalHours:  isTotal ? rawNum : null,
      allocationFrom:        allocFrom,
      allocationTo:          allocTo,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">Assign Employee</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Team / Manager */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Team / Manager</label>
            <SearchSelect
              size="md"
              options={teamOptions}
              loading={teamsLoading}
              value={teamManagerId}
              placeholder="— Select team —"
              onChange={(v) => { setTeamManagerId(v || ''); setSelectedUserId(''); }}
            />
          </div>

          {/* Assign to — members of the chosen team (manager listed first) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to</label>
            <SearchSelect
              size="md"
              options={memberOptions}
              loading={membersLoading}
              value={selectedUserId}
              disabled={!teamManagerId}
              placeholder={teamManagerId ? '— Select agent —' : 'Select a team first'}
              emptyText="No members in this team"
              onChange={(v) => setSelectedUserId(v ? String(v) : '')}
            />
            {selectedUser && (
              <div className="flex items-center gap-2 mt-2">
                <Avatar name={selectedUser.name} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{selectedUser.name}</p>
                  {(selectedUser.designation || selectedUser.role) && (
                    <p className="text-xs text-gray-400 truncate">{selectedUser.designation || fmtLabel(selectedUser.role)}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Effort allocation (Phase 3) ── */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Effort allocation</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Start date</label>
                <input
                  type="date"
                  value={allocFrom}
                  onChange={e => setAllocFrom(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">End date</label>
                <input
                  type="date"
                  value={allocTo}
                  min={allocFrom || undefined}
                  onChange={e => setAllocTo(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <AllocationTypeInput
              compact
              value={alloc}
              onChange={next => setAlloc({
                allocationMode:       next.allocationMode,
                hoursPerDay:          next.hoursPerDay ?? null,
                allocationTotalHours: next.allocationTotalHours ?? null,
              })}
              from={allocFrom || null}
              to={allocTo || null}
              capacity={capacity > 0 ? capacity : 8}
              maxPerDay={12}
              defaultMode="total"
              disabled={submitting}
              inputClassName={`w-full px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${hoursValid ? 'border-gray-200' : 'border-red-300'}`}
              onDerived={setAllocDerived}
            />
            {!hoursValid && (
              <p className="text-[11px] text-red-500 mt-1">{isTotal ? 'Total hours must be at least 0.5 in steps of 0.5' : 'Hours must be between 0.5 and 12 in steps of 0.5'}</p>
            )}
            {!datesValid && allocFrom && allocTo && (
              <p className="text-[11px] text-red-500 mt-1">Start date must be on or before end date</p>
            )}

            {/* Capacity feedback */}
            {selectedUser && datesValid && (
              <div className="mt-2">
                {availLoading ? (
                  <p className="text-[11px] text-gray-400">Checking capacity…</p>
                ) : availability ? (
                  <>
                    <p className="text-[11px] text-gray-500">
                      {round1(freeHours)}h free on their busiest day ({round1(peakHours)}h / {round1(capacity)}h committed)
                    </p>
                    {wouldExceed && !conflict && (
                      <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-700">
                        <HiOutlineExclamation className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        <span>
                          Adding {round1(hoursNum)}h/day{isTotal ? ` (${round1(rawNum)}h total)` : ''} would put them at {round1(peakHours + hoursNum)}h / {round1(capacity)}h on{' '}
                          {availability.overDays ? `${availability.overDays}` : 'some'} days — this will be refused unless an exception is approved
                        </span>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {/* Server refused the assignment (HTTP 409) — nothing was saved */}
            <TicketConflictPanel
              compact
              conflict={conflict}
              capacity={capacity > 0 ? capacity : 8}
              onApply={applySuggestion}
              onRequestException={() => setShowException(true)}
            />
          </div>
        </div>

        {conflict && showException && (
          <TicketExceptionModal
            open
            ticketId={ticket?._id ?? ticket?.id}
            ticket={ticket}
            conflict={conflict}
            allocation={{
              assigneeId:            selectedUser ? (selectedUser._id || selectedUser.id) : undefined,
              assigneeName:          selectedUser?.name,
              allocationMode:        isTotal ? 'total' : 'per_day',
              allocationHoursPerDay: hoursNum ?? null,
              allocationTotalHours:  isTotal ? rawNum : null,
              allocationFrom:        allocFrom,
              allocationTo:          allocTo,
            }}
            onClose={() => setShowException(false)}
            onRequested={(result) => { setShowException(false); onRequested?.(result); }}
          />
        )}

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedUser || !teamManagerId || !hoursValid || !datesValid || submitting}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddNoteModal
// ---------------------------------------------------------------------------

function AddNoteModal({ ticketId, onClose, onAdded }) {
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      await addConversationApi(ticketId, { message: note.trim(), isInternal: true });
      toast.success('Internal note added');
      onAdded?.();
      onClose();
    } catch { toast.error('Failed to add note'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">Add Internal Note</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <textarea
            autoFocus
            rows={5}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Enter internal note (not visible to requester)..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!note.trim() || saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CloseTicketModal
// ---------------------------------------------------------------------------

/**
 * Shown when a canManage user clicks "Close" in the header or selects
 * "Closed" from Actions → Change Status.
 * If the ticket has assignees, lets the manager confirm each person's
 * contribution % before closing.
 */
function CloseTicketModal({ ticket, id, onClose }) {
  const dispatch   = useDispatch();
  const assignees  = ticket.assignees || [];

  const [weights, setWeights] = useState(() => {
    const d = {};
    assignees.forEach(a => {
      const aKey = a._id || a.id;
      d[aKey] = a.weight != null ? String(Number(a.weight)) : '0';
    });
    return d;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  const total = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  const handleConfirmClose = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (assignees.length > 0) {
        const w = assignees.map(a => ({
          userId: a.userId || a._id || a.id,
          weight: Number(weights[a._id || a.id] || '0'),
        }));
        try {
          // NOTE: This endpoint may not exist yet on the backend.
          // Once PUT /helpdesk/tickets/:id/assignee-weights is implemented,
          // it will persist the contribution percentages before closing.
          await api.put(`/helpdesk/tickets/${id}/assignee-weights`, { weights: w });
        } catch (e) {
          if (e?.response?.status !== 404) throw e;
          // 404 → endpoint not available yet — fall through to status update
        }
      }
      await dispatch(updateTicket({ id, data: { statusKey: 'closed' } })).unwrap();
      toast.success('Ticket closed successfully');
      onClose();
    } catch (e) {
      setErr(typeof e === 'string' ? e : e?.response?.data?.error?.message || 'Failed to close ticket');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Close Ticket</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {assignees.length > 0 ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Before closing this ticket, confirm each team member's contribution percentage.
              </p>
              <div className="space-y-2.5">
                {assignees.map(a => {
                  const aKey = a._id || a.id;
                  return (
                    <div key={aKey} className="flex items-center gap-2">
                      <Avatar name={a.name || a.assigneeName} size="sm" />
                      <span className="text-sm text-gray-700 flex-1 truncate">
                        {a.name || a.assigneeName}
                      </span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={weights[aKey] ?? '0'}
                        onChange={e => setWeights(d => ({ ...d, [aKey]: e.target.value }))}
                        className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-400">%</span>
                    </div>
                  );
                })}
              </div>
              <p className={`mt-2 text-xs font-semibold ${total === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                Total {total}%{total !== 100 ? ' — contributions usually add up to 100%' : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              Mark this ticket as <strong>Closed</strong>?
            </p>
          )}
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmClose}
            disabled={busy}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? 'Closing...' : (assignees.length > 0 ? 'Save & Close' : 'Close Ticket')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedTeamsPanel  (right sidebar, panel 4)
// ---------------------------------------------------------------------------

/**
 * Shows the ticket's linked ticket (if any) and lets canManage users link
 * another ticket with a relationship type.
 * POST /helpdesk/tickets/:id/link  { linkedTicketId, linkType }
 */
function LinkedTeamsPanel({ ticket, id, canManage, dispatch }) {
  const navigate = useNavigate();
  const [linkTicketId, setLinkTicketId] = useState('');
  const [linkType, setLinkType]         = useState('related');
  const [showForm, setShowForm]         = useState(false);
  const [linking, setLinking]           = useState(false);

  const linkedId     = ticket.linkedTicketId;
  const linkedTicket = ticket.linkedTicket;        // populated association (may be null)
  const linkTypeLabel = ticket.linkType;

  const linkTypeColors = {
    'related':    'bg-blue-100 text-blue-700',
    'duplicate':  'bg-purple-100 text-purple-700',
    'blocks':     'bg-red-100 text-red-700',
    'blocked-by': 'bg-orange-100 text-orange-700',
  };

  const handleLink = async () => {
    if (!linkTicketId) { toast.error('Enter a Ticket ID'); return; }
    setLinking(true);
    try {
      await api.post(`/helpdesk/tickets/${id}/link`, {
        linkedTicketId: Number(linkTicketId),
        linkType,
      });
      toast.success('Ticket linked');
      setShowForm(false);
      setLinkTicketId('');
      dispatch(fetchTicketById(id));
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to link ticket');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
        <HiOutlineLink className="w-3.5 h-3.5" />
        Linked Tickets
      </h3>

      {linkedId ? (
        <div
          className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2.5 cursor-pointer hover:bg-indigo-100 transition-colors"
          onClick={() => navigate(`/helpdesk/tickets/${linkedId}`)}
        >
          <p className="text-[11px] text-indigo-400 mb-0.5">Linked ticket</p>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-indigo-700 font-medium truncate flex-1">
              {linkedTicket
                ? `${linkedTicket.reqNumber || `REQ-${String(linkedId).slice(-6).toUpperCase()}`} · ${linkedTicket.title}`
                : `REQ-${String(linkedId).slice(-6).toUpperCase()}`}
            </p>
            {linkTypeLabel && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize flex-shrink-0 ${linkTypeColors[linkTypeLabel] || 'bg-gray-100 text-gray-600'}`}>
                {fmtLabel(linkTypeLabel)}
              </span>
            )}
          </div>
          {linkedTicket?.status && (
            <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_COLORS[linkedTicket.status] || 'bg-gray-100 text-gray-600'}`}>
              {fmtLabel(linkedTicket.status)}
            </span>
          )}
        </div>
      ) : !canManage ? (
        <p className="text-xs text-gray-400 italic">No linked tickets.</p>
      ) : null}

      {canManage && (
        showForm ? (
          <div className="border border-gray-200 rounded-xl p-3 space-y-2.5">
            <div>
              <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1">Ticket ID</label>
              <input
                type="number"
                value={linkTicketId}
                onChange={e => setLinkTicketId(e.target.value)}
                placeholder="e.g. 123"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1">Link Type</label>
              <select
                value={linkType}
                onChange={e => setLinkType(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="related">Related</option>
                <option value="duplicate">Duplicate</option>
                <option value="blocks">Blocks</option>
                <option value="blocked-by">Blocked By</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleLink}
                disabled={linking || !linkTicketId}
                className="flex-1 text-sm bg-blue-600 text-white rounded-lg py-1.5 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {linking ? 'Linking...' : 'Link Ticket'}
              </button>
              <button
                onClick={() => { setShowForm(false); setLinkTicketId(''); }}
                className="px-3 text-sm border border-gray-200 rounded-lg py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Link Another Ticket
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddReminderModal
// ---------------------------------------------------------------------------

function AddReminderModal({ ticketId, onClose }) {
  const [message, setMessage]   = useState('');
  const [datetime, setDatetime] = useState('');
  const [saving, setSaving]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!datetime) return;
    setSaving(true);
    try {
      // POST to the correct per-ticket reminders endpoint
      await api.post(`/helpdesk/tickets/${ticketId}/reminders`, {
        remindAt: new Date(datetime).toISOString(),
        message:  message.trim() || undefined,
      });
      toast.success('Reminder set');
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to set reminder');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900">Add Reminder</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message (optional)</label>
            <input
              autoFocus
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What do you need to remember?"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date & Time</label>
            <input
              type="datetime-local"
              value={datetime}
              onChange={e => setDatetime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!datetime || saving}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Setting...' : 'Set Reminder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddTaskModal
// ---------------------------------------------------------------------------

function AddTaskModal({ ticketId, onClose, onAdd }) {
  const [title, setTitle]   = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const ok = await onAdd(title.trim());
      // only close the modal if the save actually succeeded
      if (ok) onClose();
    } catch {
      // error already toasted inside onAdd
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Add Task</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
