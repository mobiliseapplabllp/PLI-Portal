/**
 * CreateTicket.jsx
 * Layout matches original NewRequest.jsx exactly:
 *   LEFT  → Card 1: Request Information (Subject, Description, Type+Status, Mode+Category)
 *         → Card 2: Requester Details (Search, Name+Email, Project)
 *   RIGHT → Card 3: Classification (Priority, Impact+Urgency, Due Date)
 *         → Card 4: Assignment (Team / Manager, Assign to)
 *         → Attachment + Action buttons
 *
 * PLI adaptations: Redux dispatch, lowercase ENUM values, ID-based team/assignee,
 * react-hot-toast, PLI API wrappers.
 *
 * Team model: a "team" is a reporting manager + their active direct reports
 * (employee master). Helpdesk groups are retired — the requester's team is
 * derived server-side from their department; nothing is typed here.
 * Projects are PM projects (UUID) — projectId sent is the PM project id.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../api/axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  fetchHdOptions,
  selectSubmitting,
  selectHdOptions,
} from '../../store/helpdeskSlice';
// The create call is made through the API wrapper (not the thunk) so the HTTP 409
// `conflict` body survives — the thunk collapses every error to a message string.
import { createTicketApi, requestTicketAllocationExceptionApi } from '../../api/helpdesk/tickets.api';
import TicketConflictPanel from '../../components/helpdesk/TicketConflictPanel';
import TicketExceptionModal from '../../components/helpdesk/TicketExceptionModal';
import { listTeamsApi, getTeamMembersApi } from '../../api/helpdesk/teams.api';
import { listPmProjectsForTicketsApi } from '../../api/helpdesk/teams.api';
import { getUsersApi, getUserByIdApi } from '../../api/users.api';
import SearchSelect from '../../components/common/SearchSelect';
import QuickCreateProjectModal from '../../components/helpdesk/QuickCreateProjectModal';
import {
  HiOutlineArrowLeft,
  HiOutlineSave,
  HiOutlineChevronDown,
  HiOutlineSearch,
  HiOutlinePlus,
} from 'react-icons/hi';

// ── Static option lists for MySQL ENUM fields (cannot be changed via UI) ─────
// These 2 fields are MySQL ENUMs in hd_tickets — the DB defines the allowed values.
const FIXED_STATUS_OPTS   = ['open', 'in-progress', 'on-hold', 'pending'];
const FIXED_PRIORITY_OPTS = ['Low', 'Medium', 'High', 'Critical'];

/** Human label for status values */
const STATUS_LABEL = {
  'open':        'Open',
  'in-progress': 'In Progress',
  'on-hold':     'On Hold',
  'pending':     'Pending',
};

/**
 * Priority display label → PLI backend value (backend ENUM is lowercase).
 * Original stores capitalized label; we map it on submit.
 */
const PRIORITY_VALUE = {
  Low:      'low',
  Medium:   'medium',
  High:     'high',
  Critical: 'critical',
};

/** Reverse map: PLI value → display label */
const PRIORITY_LABEL = Object.fromEntries(
  Object.entries(PRIORITY_VALUE).map(([label, val]) => [val, label]),
);

/**
 * Impact / Urgency display label → PLI backend ENUM value (lowercase).
 * Backend ENUM is lowercase; frontend shows Pascal case.
 */
const IMPACT_VALUE = { Low: 'low', Medium: 'medium', High: 'high' };
const URGENCY_VALUE = { Low: 'low', Medium: 'medium', High: 'high' };

/**
 * RequestType display label → backend ENUM value.
 * Mode display label → backend ENUM value.
 */
const REQUEST_TYPE_VALUE = {
  'Incident':        'incident',
  'Service Request': 'service_request',
};
const MODE_VALUE = {
  'Web Form':   'web_form',
  'E-Mail':     'email',
  'Phone Call': 'phone',
};

const HD_DOC_CATEGORIES = [
  'SOW / Client Contracts',
  'Requirement Documents / BRD',
  'Solution Architecture Documents',
  'Technical Design Documentation',
  'Others',
];

// PM project statuses hidden by default in the Project picker (case-insensitive)
const CLOSED_PROJECT_STATUSES = ['completed', 'cancelled', 'closed'];
// Roles allowed to create projects when PM settings cannot be read (same default as backend)
const DEFAULT_CREATOR_ROLES = ['admin', 'manager', 'senior_manager'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRIORITY_COLORS = {
  Low:      { active: 'bg-green-100 border-green-300 text-green-700',  idle: 'border-gray-300 hover:bg-gray-50' },
  Medium:   { active: 'bg-yellow-100 border-yellow-300 text-yellow-700', idle: 'border-gray-300 hover:bg-gray-50' },
  High:     { active: 'bg-orange-100 border-orange-300 text-orange-700', idle: 'border-gray-300 hover:bg-gray-50' },
  Critical: { active: 'bg-red-100 border-red-300 text-red-700',       idle: 'border-gray-300 hover:bg-gray-50' },
};

const EMPTY_FORM = {
  requestType:    'Incident',
  title:          '',         // "subject" in original
  description:    '',
  status:         'open',
  mode:           'Web Form',
  category:       '',
  priority:       '',         // stored as PLI lowercase value
  impact:         'Medium',
  urgency:        'Medium',
  dueDate:        '',
  requesterName:  '',
  requesterEmail: '',
  projectId:      '',         // UUID — PM project id
  teamManagerId:  '',         // UUID — reporting manager whose team owns the ticket
  assigneeId:     '',         // UUID — PLI primary assignee (must be in the team)
  billable:       'Non-Billable',
  docFiles:       [],         // array of {file, category, categoryOther}
};

/**
 * Working-days line under the ticket's Total hours field.
 * Tickets are allocated as a TOTAL; the server stores the per-day figure, so this
 * asks the working calendar for the days in the window and reports total ÷ days.
 */
function AllocationDerivedLine({ total, from, to, onDerived }) {
  const [days, setDays]   = useState(null);
  const [error, setError] = useState(null);
  const cbRef = useRef(onDerived);
  cbRef.current = onDerived;

  useEffect(() => {
    if (!from || !to || from > to) { setDays(null); setError(null); return undefined; }
    let alive = true;
    const t = setTimeout(() => {
      api.get('/pm/config/calendar/working-days', { params: { from, to } })
        .then(res => {
          if (!alive) return;
          const d = Number(res.data?.data?.workingDays ?? res.data?.workingDays);
          setDays(Number.isFinite(d) && d > 0 ? d : null);
          setError(null);
        })
        .catch(err => {
          if (!alive) return;
          setDays(null);
          setError(err.response?.data?.message || err.response?.data?.error?.message || 'Could not compute working days');
        });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [from, to]);

  const perDay = total != null && days ? Math.round((total / days) * 10) / 10 : null;
  useEffect(() => { cbRef.current?.({ hoursPerDay: perDay, totalHours: total ?? null, workingDays: days }); }, [perDay, total, days]);

  if (error) return <p className="text-[10px] text-red-500 mt-0.5">{error}</p>;
  if (!from || !to) return <p className="text-[10px] text-amber-600 mt-0.5">Total hours needs both a start and an end date</p>;
  if (!days) return <p className="text-[10px] text-gray-400 mt-0.5">Calculating working days…</p>;
  return (
    <p className={`text-[10px] mt-0.5 ${perDay > 8 ? 'text-amber-600' : 'text-gray-500'}`}>
      = {perDay ?? '—'}h/day over {days} working day{days === 1 ? '' : 's'}
      {perDay != null && ` · ${Math.round((perDay / 8) * 100)}% of capacity`}
    </p>
  );
}

/**
 * AgentCapacityLine — what this ticket does to the chosen agent's day.
 * Same source as the Assign dialog: GET /pm/users/:id/availability, which counts
 * their project periods AND their other open tickets.
 */
function AgentCapacityLine({ userId, from, to, addHoursPerDay, totalHours, suppressWarning = false, onCapacity }) {
  const [avail, setAvail]     = useState(null);
  const [loading, setLoading] = useState(false);
  // Report the agent's real daily capacity up to the page (the conflict panel needs
  // it as a fallback) — this is the only availability fetch on the form, reuse it.
  const capRef = useRef(onCapacity);
  capRef.current = onCapacity;
  useEffect(() => {
    const c = Number(avail?.capacity);
    capRef.current?.(Number.isFinite(c) && c > 0 ? c : null);
  }, [avail]);

  useEffect(() => {
    if (!userId || !from || !to || from > to) { setAvail(null); return undefined; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.get(`/pm/users/${userId}/availability`, { params: { fromDate: from, toDate: to } })
        .then(res => { if (alive) setAvail(res.data?.data ?? res.data ?? null); })
        .catch(() => { if (alive) setAvail(null); })
        .finally(() => { if (alive) setLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [userId, from, to]);

  if (!userId) return <p className="text-[10px] text-gray-500 mt-1">Counts against the agent&apos;s capacity alongside project allocations.</p>;
  if (loading && !avail) return <p className="text-[10px] text-gray-400 mt-1">Checking capacity…</p>;
  if (!avail) return null;

  const r1       = (n) => Math.round((Number(n) || 0) * 10) / 10;
  const capacity = Number(avail.capacity ?? 0);
  const peak     = Number(avail.peakHours ?? 0);
  const free     = Number(avail.freeHours ?? 0);
  const add      = Number(addHoursPerDay ?? 0);
  const exceeds  = capacity > 0 && add > 0 && peak + add > capacity;

  return (
    <div className="mt-1">
      <p className="text-[10px] text-gray-500">
        {r1(free)}h free on their busiest day ({r1(peak)}h / {r1(capacity)}h already committed across projects and tickets)
      </p>
      {exceeds && !suppressWarning && (
        <div className="mt-1 flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700">
          <span>
            Adding {r1(add)}h/day{totalHours ? ` (${r1(totalHours)}h total)` : ''} puts them at {r1(peak + add)}h / {r1(capacity)}h
            {avail.overDays ? ` on ${avail.overDays} day${avail.overDays === 1 ? '' : 's'}` : ''} — over capacity, the request will be refused.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Shared style helpers (compact text-xs, matching original) ────────────────
const inp = (hasErr) =>
  `w-full px-2.5 py-1.5 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${
    hasErr ? 'border-red-500' : 'border-gray-300'
  }`;
const sel = (hasErr) =>
  `w-full px-2.5 py-1.5 border rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
    hasErr ? 'border-red-500' : 'border-gray-300'
  }`;
const LBL = 'block text-xs font-medium text-gray-600 mb-0.5';
const HINT = 'text-[10px] text-gray-400 mb-0.5';
const ERR  = 'text-red-500 text-[10px] mt-0.5';

// ─────────────────────────────────────────────────────────────────────────────

export default function CreateTicket() {
  const dispatch   = useDispatch();
  const navigate   = useNavigate();
  const location   = useLocation();
  const submitting = useSelector(selectSubmitting);
  const hdOptions  = useSelector(selectHdOptions);
  const authUser   = useSelector(s => s.auth.user);
  const authUserId = authUser?._id ?? authUser?.id ?? '';

  // ── Derive live option arrays from Redux (fall back to sensible defaults) ───
  const optCategory    = (hdOptions.category    || []).map(o => o.name);
  const optMode        = (hdOptions.mode        || []).map(o => o.name);
  const optRequestType = (hdOptions.request_type|| []).map(o => o.name);
  const optImpact      = (hdOptions.impact      || []).map(o => o.name);
  const optUrgency     = (hdOptions.urgency     || []).map(o => o.name);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [formData,    setFormData]    = useState(() => {
    const src = location.state?.duplicateFrom;
    // C1 — requester defaults to the logged-in user (still changeable via the picker)
    const selfRequester = {
      requesterName:  authUser?.name  || '',
      requesterEmail: authUser?.email || '',
    };
    if (!src) return { ...EMPTY_FORM, ...selfRequester };
    // Only carry a PM (UUID) project id forward — legacy INT hd_project ids are not selectable here
    const srcPmProjectId = src.pmProjectId || src.pmProject?._id || src.pmProject?.id || src.projectId || '';
    return {
      ...EMPTY_FORM,
      title:          src.title        ? `Copy of ${src.title}` : '',
      description:    src.description  || '',
      category:       src.category     || '',
      mode:           src.mode         || EMPTY_FORM.mode,
      requestType:    src.requestType  || EMPTY_FORM.requestType,
      priority:       src.priority     || EMPTY_FORM.priority,
      impact:         src.impact       || EMPTY_FORM.impact,
      urgency:        src.urgency      || EMPTY_FORM.urgency,
      teamManagerId:  src.teamManagerId || src.teamManager?._id || src.teamManager?.id || '',
      assigneeId:     '',   // do NOT copy assignee — must be re-chosen
      requesterName:  src.requesterName  || src.requesterUser?.name  || selfRequester.requesterName,
      requesterEmail: src.requesterEmail || src.requesterUser?.email || selfRequester.requesterEmail,
      projectId:      UUID_RE.test(String(srcPmProjectId)) ? srcPmProjectId : '',
      dueDate:        '',   // do NOT copy dueDate
    };
  });
  // Read-only context for the selected requester: "<Department> · Reports to <Manager>"
  const [requesterMeta, setRequesterMeta] = useState({ department: '', manager: '' });
  // C3 — teams (reporting managers) + members of the chosen team
  const [teams,          setTeams]          = useState([]);
  const [teamsLoading,   setTeamsLoading]   = useState(false);
  const [members,        setMembers]        = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  // C4 — PM projects
  const [projects,        setProjects]        = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [showClosed,      setShowClosed]      = useState(false);
  // C5 — quick-create project (role-gated)
  const [showProjectModal, setShowProjectModal] = useState(false);
  const canCreateProject = !!authUser?.role && DEFAULT_CREATOR_ROLES.includes(authUser.role);
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [attachment,  setAttachment]  = useState(null);

  // ── Phase 3: effort allocation — only shown/sent when an assignee is chosen ─
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // Tickets are allocated in TOTAL HOURS only — "Hours per day" is not offered here;
  // the per-day figure sent to the server is total ÷ working days in the window.
  const DEFAULT_ALLOC_TOTAL = 10;
  const [alloc, setAlloc] = useState({ allocationMode: 'total', hoursPerDay: '', allocationTotalHours: String(DEFAULT_ALLOC_TOTAL), from: '', to: '' });
  const [allocDerived, setAllocDerived] = useState({ hoursPerDay: null, totalHours: null, workingDays: null }); // per-day derived from the total
  // HTTP 409 `conflict` body from the last create attempt — the ticket was NOT created
  const [allocConflict, setAllocConflict] = useState(null);
  // "Request exception…" opens the shared modal: it collects the reason, then this
  // page creates the ticket WITHOUT an allocation and raises the exception on it.
  const [showException, setShowException] = useState(false);
  // Real daily capacity of the chosen agent (reported by AgentCapacityLine's
  // /pm/users/:id/availability fetch) — used by the conflict panel when the 409
  // body carries no capacity of its own.
  const [agentCapacity, setAgentCapacity] = useState(null);

  /**
   * Apply a conflict suggestion to this form.
   * The form is TOTAL-only, so "Use N hrs/day" is converted back to a total:
   *   total = N × working days in the window (the days AllocationDerivedLine resolved).
   */
  const applyConflictSuggestion = (patch) => {
    setShowException(false);
    if (patch.allocationFrom) setAlloc(p => ({ ...p, from: patch.allocationFrom }));
    if (patch.allocationTo)   setAlloc(p => ({ ...p, to:   patch.allocationTo }));
    if (patch.allocationHoursPerDay != null) {
      const days = Number(allocDerived.workingDays);
      if (Number.isFinite(days) && days > 0) {
        const total = Math.round(Number(patch.allocationHoursPerDay) * days * 2) / 2;
        setAlloc(p => ({ ...p, allocationTotalHours: String(total) }));
      } else {
        toast.error('Working days for this window are not known yet — adjust the total hours manually.');
        return;
      }
    }
    setAllocConflict(null);
  };
  const allocIsTotal    = true;
  const allocRaw        = Number(alloc.allocationTotalHours);
  const allocHoursValid = Number.isFinite(allocRaw) && allocRaw >= 0.5 && allocRaw <= 9999 && Math.round(allocRaw * 2) === allocRaw * 2;
  const allocHoursNum   = allocDerived.hoursPerDay;
  const allocDatesValid = !!alloc.from && !!alloc.to && alloc.from <= alloc.to;
  // When an assignee is (re)chosen, fill defaults: today → dueDate || today+7
  useEffect(() => {
    if (!formData.assigneeId) return;
    const today = new Date();
    const week  = new Date(); week.setDate(week.getDate() + 7);
    setAlloc(prev => ({
      ...prev,
      from:  prev.from  || isoDay(today),
      to:    prev.to    || (formData.dueDate ? formData.dueDate.slice(0, 10) : '') || isoDay(week),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.assigneeId]);

  // ── Document entries ────────────────────────────────────────────────────────
  const [docEntries,              setDocEntries]              = useState([]); // [{file, category, categoryOther}]
  const [pendingDocCategory,      setPendingDocCategory]      = useState('SOW / Client Contracts');
  const [pendingDocCategoryOther, setPendingDocCategoryOther] = useState('');
  const [pendingDocFile,          setPendingDocFile]          = useState(null);

  // ── Requester search ────────────────────────────────────────────────────────
  const [requesters,            setRequesters]            = useState([]);
  const [requesterSearch,       setRequesterSearch]       = useState('');
  const [showRequesterDropdown, setShowRequesterDropdown] = useState(false);
  const requesterRef = useRef(null);

  // ── Requester context line helper ("<Department> · Reports to <Manager>") ───
  const metaFromUser = (u) => ({
    department: u?.department?.name || u?.departmentName || u?.department_name || (typeof u?.department === 'string' ? u.department : '') || '',
    manager:    u?.manager?.name    || u?.managerName    || u?.manager_name    || '',
  });

  // ── On mount: teams, PM projects, PM creator roles, configurable options ────
  useEffect(() => {
    // C3 — teams = reporting managers from the employee master
    setTeamsLoading(true);
    listTeamsApi()
      .then(res => {
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setTeams(list);
        // A duplicated ticket may carry a "self team" (assignee with no manager) that is
        // not a selectable team — drop it rather than submit a hidden, invalid value.
        setFormData(prev => (
          prev.teamManagerId && !list.some(t => String(t._id ?? t.id) === String(prev.teamManagerId))
            ? { ...prev, teamManagerId: '' }
            : prev
        ));
      })
      .catch(() => { setTeams([]); toast.error('Failed to load teams'); })
      .finally(() => setTeamsLoading(false));

    // C4 — all PM projects (closed ones hidden client-side by default)
    setProjectsLoading(true);
    // Helpdesk-side list: every PM project (not membership-filtered), closed ones included
    listPmProjectsForTicketsApi({ includeClosed: 1 })
      .then(res => {
        const list = res.data?.data || [];
        setProjects(Array.isArray(list) ? list : []);
      })
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));

    // C5 — who may create projects: the button is shown for the standard creator roles;
    // the PM create API enforces the real rule (PM settings' allowedCreatorRoles) and
    // the modal surfaces its 403 message if the role is not allowed.

    // C1/C2 — logged-in user's department + reporting manager for the context line.
    // Redux auth carries department but not manager → fetch the full user record.
    if (authUserId && !location.state?.duplicateFrom) {
      setRequesterMeta(metaFromUser(authUser));
      getUserByIdApi(authUserId)
        .then(res => setRequesterMeta(metaFromUser(res.data?.data?.user || res.data?.data)))
        .catch(() => {});
    }

    // Only fetch options if not already loaded (avoid redundant network calls)
    if (!hdOptions || Object.keys(hdOptions).length === 0) {
      dispatch(fetchHdOptions());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── C3: when the team changes, (re)load its members ─────────────────────────
  useEffect(() => {
    if (!formData.teamManagerId) { setMembers([]); return undefined; }
    let cancelled = false;
    setMembersLoading(true);
    getTeamMembersApi(formData.teamManagerId)
      .then(res => {
        if (cancelled) return;
        const list = res.data?.data?.members || [];
        setMembers(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (!cancelled) { setMembers([]); toast.error('Failed to load team members'); } })
      .finally(() => { if (!cancelled) setMembersLoading(false); });
    return () => { cancelled = true; };
  }, [formData.teamManagerId]);

  // ── SearchSelect option lists ────────────────────────────────────────────────
  const teamOptions = useMemo(() => teams.map(t => {
    const id = t._id ?? t.id;
    const n  = Number(t.memberCount ?? 0);
    return { value: id, label: t.name, sub: `${t.email || ''}${t.email ? ' · ' : ''}${n} member${n === 1 ? '' : 's'}` };
  }), [teams]);

  const memberOptions = useMemo(() => members.map(m => {
    const id = m._id ?? m.id;
    return {
      value: id,
      label: m.isManager ? `${m.name} (manager)` : m.name,
      sub:   [m.email, m.designation].filter(Boolean).join(' · '),
    };
  }), [members]);

  const isClosedProject = (p) => CLOSED_PROJECT_STATUSES.includes(String(p.status || '').toLowerCase());
  const projectOptions = useMemo(() => projects
    .filter(p => showClosed || isClosedProject(p) === false || String(p._id ?? p.id) === String(formData.projectId))
    .map(p => {
      const client  = p.clientName || '';
      const manager = p.managerName || '';
      const sub = [client, manager ? `PM: ${manager}` : '', isClosedProject(p) ? p.status : ''].filter(Boolean).join(' · ');
      return { value: p._id ?? p.id, label: p.name, sub };
    }), [projects, showClosed, formData.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // C5 — a project created from the modal joins the list and becomes the selection
  const handleProjectCreated = (project) => {
    if (!project) return;
    const id = project._id ?? project.id;
    setProjects(prev => [project, ...prev.filter(p => String(p._id ?? p.id) !== String(id))]);
    setFormData(prev => ({ ...prev, projectId: id }));
  };

  // ── Debounced requester search (fires whenever search term changes) ──────────
  useEffect(() => {
    if (!showRequesterDropdown) return;
    const t = setTimeout(() => {
      getUsersApi({ search: requesterSearch || undefined, pageSize: 30 })
        .then(res => {
          const list = res.data?.data?.users || res.data?.data || res.data || [];
          setRequesters(Array.isArray(list) ? list : []);
        })
        .catch(() => setRequesters([]));
    }, 300);
    return () => clearTimeout(t);
  }, [requesterSearch, showRequesterDropdown]);

  // ── Click-outside closes requester dropdown ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (requesterRef.current && !requesterRef.current.contains(e.target))
        setShowRequesterDropdown(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ── Select a requester from picker (on-behalf) ──────────────────────────────
  // Team/department context is derived server-side; here we only show it read-only.
  const selectRequester = (r) => {
    setFormData(prev => ({
      ...prev,
      requesterName:  r.name,
      requesterEmail: r.email,
    }));
    setRequesterMeta(metaFromUser(r));
    setRequesterSearch('');
    setShowRequesterDropdown(false);
  };

  // ── C3: Team / Manager change clears the assignee (must be re-chosen in the new team) ─
  const handleTeamChange = (value) => {
    setFormData(prev => ({
      ...prev,
      teamManagerId: value || '',
      assigneeId:    '',
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  // ── Validation (matches original validate() exactly) ────────────────────────
  const validate = () => {
    const newErrors = {};

    const subj = formData.title.trim();
    if (!subj) newErrors.title = 'Subject is required';
    else if (subj.length < 5 || subj.length > 200)
      newErrors.title = 'Subject must be 5–200 characters';

    const desc = formData.description.trim();
    if (!desc) newErrors.description = 'Description is required';
    else if (desc.length < 10 || desc.length > 5000)
      newErrors.description = 'Description must be 10–5000 characters';

    const name = formData.requesterName.trim();
    if (!name) newErrors.requesterName = 'Requester name is required';
    else if (name.length < 2 || name.length > 100)
      newErrors.requesterName = 'Name must be 2–100 characters';

    if (!formData.requesterEmail.trim())
      newErrors.requesterEmail = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.requesterEmail))
      newErrors.requesterEmail = 'Please enter a valid email address';

    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.priority) newErrors.priority  = 'Priority is required';
    if (formData.dueDate && new Date(formData.dueDate) <= new Date()) {
      newErrors.dueDate = 'Due date must be in the future';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Payload builder ─────────────────────────────────────────────────────────
  /**
   * Build the create payload (plain object, or FormData when an attachment is
   * attached — identical either way apart from the file).
   * `withAllocation: false` omits every allocation field: that is the exception
   * path, where the ticket must be created unallocated and the hours are then
   * requested as an exception against the new id.
   */
  const buildCreatePayload = ({ withAllocation = true } = {}) => {
    const normalized = {
      ...formData,
      // Map display labels to backend ENUM values
      priority:    PRIORITY_VALUE[formData.priority]    || formData.priority,
      impact:      IMPACT_VALUE[formData.impact]        || formData.impact.toLowerCase(),
      urgency:     URGENCY_VALUE[formData.urgency]      || formData.urgency.toLowerCase(),
      requestType: REQUEST_TYPE_VALUE[formData.requestType] || formData.requestType,
      mode:        MODE_VALUE[formData.mode]            || formData.mode,
    };
    // Strip empty optional fields (teamManagerId + assigneeId = team model; projectId = PM UUID)
    ['teamManagerId', 'assigneeId', 'dueDate', 'projectId'].forEach(k => {
      if (!normalized[k]) delete normalized[k];
    });
    // Phase 3 — effort allocation only travels with an assignee
    if (withAllocation && normalized.assigneeId && allocHoursValid && allocDatesValid) {
      normalized.allocationMode        = 'total';
      normalized.allocationHoursPerDay = allocHoursNum ?? null;   // derived: total ÷ working days
      normalized.allocationTotalHours  = allocRaw;
      normalized.allocationFrom        = alloc.from;
      normalized.allocationTo          = alloc.to;
    }

    if (!attachment) return normalized;
    const fd = new FormData();
    Object.entries(normalized).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
    });
    fd.append('attachment', attachment);
    return fd;
  };

  /** Upload the documents queued on the form against a freshly created ticket. */
  const uploadQueuedDocs = async (ticketId) => {
    if (!ticketId || docEntries.length === 0) return;
    const { uploadHdDocumentApi } = await import('../../api/helpdesk/helpdesk.api');
    await Promise.allSettled(docEntries.map(entry => {
      const fd = new FormData();
      fd.append('file', entry.file);
      fd.append('category', entry.category === 'Others' ? (entry.categoryOther || 'Others') : entry.category);
      return uploadHdDocumentApi(ticketId, fd);
    }));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSubmitError('');
    setAllocConflict(null);
    setShowException(false);

    try {
      const res    = await createTicketApi(buildCreatePayload());
      const result = res.data?.data ?? res.data ?? {};
      toast.success('Ticket created successfully');
      // Backend renames id → _id via renameIdsForClient; fall back to .id for safety
      const ticketId = result?._id ?? result?.id;
      if (!ticketId) {
        toast.error('Unexpected server response — ticket may have been created. Refresh the list.');
        return;
      }
      // Upload any queued documents
      await uploadQueuedDocs(ticketId);
      navigate(`/helpdesk/tickets/${ticketId}`);
    } catch (err) {
      const body   = err?.response?.data;
      const status = err?.response?.status;
      const msg =
        typeof err === 'string'
          ? err
          : body?.message || body?.error?.message || err?.message || 'Failed to create request. Please try again.';
      // 409 = the allocation would put the agent over capacity — nothing was created.
      // Keep the form open and show the conflict box with one-click fixes.
      if (status === 409 && body?.conflict) {
        setAllocConflict(body.conflict);
        setSubmitError('');
      } else {
        setSubmitError(msg);
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── "Request exception…" — two writes, in order ─────────────────────────────
  /**
   * An exception row must point at an existing ticket, so from the create form the
   * flow is: (a) create the ticket with NO allocation, (b) POST the exception for
   * the allocation the user typed, (c) go to the ticket.
   * Thrown errors surface inline in the modal (creation step only) — once the
   * ticket exists we never leave the user on this form: a duplicate would follow.
   */
  const exceptionInFlight = useRef(false);
  const handleExceptionSubmit = async (reason, body) => {
    if (exceptionInFlight.current) return;                     // double-submit guard
    if (!validate()) throw new Error('Fix the highlighted fields on the form first.');
    exceptionInFlight.current = true;
    setSaving(true);
    setSubmitError('');

    let ticketId = null;
    try {
      // (a) create the ticket WITHOUT any allocation field
      const res    = await createTicketApi(buildCreatePayload({ withAllocation: false }));
      const result = res.data?.data ?? res.data ?? {};
      // (b) the API renames id → _id
      ticketId = result?._id ?? result?.id;
      if (!ticketId) throw new Error('Ticket created but the server returned no id — open it from the ticket list.');
    } catch (err) {
      exceptionInFlight.current = false;
      setSaving(false);
      throw err;                                               // modal shows it inline; form intact
    }

    // From here the ticket EXISTS — always finish on the ticket page.
    await uploadQueuedDocs(ticketId).catch(() => {});
    try {
      // (c) raise the exception for the allocation the user originally typed
      await requestTicketAllocationExceptionApi(ticketId, { ...body, reason });
      toast.success('Ticket created — exception requested, awaiting approval');
    } catch (err) {
      const msg = err?.response?.data?.message
        || err?.response?.data?.error?.message
        || err?.message || '';
      toast.error(`Ticket created, but the allocation exception was NOT raised${msg ? ` (${msg})` : ''} — request it from the ticket.`);
    } finally {
      exceptionInFlight.current = false;
      setSaving(false);
      setShowException(false);
      setAllocConflict(null);
      navigate(`/helpdesk/tickets/${ticketId}`);
    }
  };

  // ── Attachment file-size guard ──────────────────────────────────────────────
  const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast.error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 5 MB.`);
      e.target.value = ''; // reset the file input
      return;
    }
    setAttachment(file);
  };

  // Current priority's display label (e.g. 'medium' → 'Medium')
  const activePriorityLabel = PRIORITY_LABEL[formData.priority];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-[#f5f5f5]">

      {/* ── Header bar — matches original exactly ───────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <HiOutlineArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">New Request</h1>
          </div>
          {/* Template selector (UI element matching original) */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Template:</span>
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
            >
              <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
              Default Request
              <HiOutlineChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Form body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto text-xs">

          {/* Submit-level error */}
          {submitError && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-600 rounded text-xs">
              {submitError}
            </div>
          )}

          {/* ── 2-column grid ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-6">

            {/* ══════════════════════ LEFT COLUMN ══════════════════════════ */}
            <div className="space-y-4">

              {/* ── Card 1: Request Information ─────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Request Information
                </h2>
                <div className="space-y-3">

                  {/* Subject */}
                  <div>
                    <label className={LBL}>Subject <span className="text-red-500">*</span></label>
                    <p className={HINT}>5–200 characters</p>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      placeholder="Enter request subject"
                      minLength={5}
                      maxLength={200}
                      className={inp(errors.title)}
                    />
                    {errors.title && <p className={ERR}>{errors.title}</p>}
                  </div>

                  {/* Description */}
                  <div>
                    <label className={LBL}>Description <span className="text-red-500">*</span></label>
                    <p className={HINT}>10–5000 characters</p>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Describe the issue in detail..."
                      minLength={10}
                      maxLength={5000}
                      className={`${inp(errors.description)} resize-none`}
                    />
                    {errors.description && <p className={ERR}>{errors.description}</p>}
                  </div>

                  {/* Request Type + Status — same row as original */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LBL}>Request Type</label>
                      <select
                        name="requestType"
                        value={formData.requestType}
                        onChange={handleChange}
                        className={sel()}
                      >
                        {(optRequestType.length ? optRequestType : ['Incident', 'Service Request']).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LBL}>Status</label>
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        className={sel()}
                      >
                        {FIXED_STATUS_OPTS.map(o => (
                          <option key={o} value={o}>{STATUS_LABEL[o] || o}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Mode + Category — same row as original */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LBL}>Mode</label>
                      <select
                        name="mode"
                        value={formData.mode}
                        onChange={handleChange}
                        className={sel()}
                      >
                        {(optMode.length ? optMode : ['Web Form', 'E-Mail', 'Phone Call']).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LBL}>
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleChange}
                        className={sel(errors.category)}
                      >
                        <option value="">-- Select --</option>
                        {(optCategory.length ? optCategory : ['General', 'Hardware', 'Software', 'Network', 'Security']).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                      {errors.category && <p className={ERR}>{errors.category}</p>}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Card 2: Requester Details ────────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Requester Details
                </h2>
                <div className="space-y-3">

                  {/* Searchable requester picker */}
                  <div ref={requesterRef} className="relative">
                    <label className={LBL}>
                      Select Requester <span className="text-red-500">*</span>
                    </label>
                    <p className={HINT}>Search name or email to auto-fill below</p>
                    <div className="relative">
                      <HiOutlineSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        value={
                          showRequesterDropdown
                            ? requesterSearch
                            : formData.requesterName
                              ? `${formData.requesterName} (${formData.requesterEmail})`
                              : ''
                        }
                        onChange={e => {
                          setRequesterSearch(e.target.value);
                          setShowRequesterDropdown(true);
                        }}
                        onFocus={() => setShowRequesterDropdown(true)}
                        placeholder="Search or type name..."
                        className="w-full pl-7 pr-2.5 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {showRequesterDropdown && (
                        <div className="absolute z-10 mt-0.5 w-full bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-auto text-xs">
                          {requesters.length === 0 ? (
                            <div className="px-2 py-3 text-gray-500">
                              No users found. Start typing to search.
                            </div>
                          ) : (
                            requesters.map(r => (
                              <button
                                key={r._id ?? r.id}
                                type="button"
                                onClick={() => selectRequester(r)}
                                className="w-full px-2 py-1.5 text-left hover:bg-blue-50 flex justify-between"
                              >
                                <span>{r.name}</span>
                                <span className="text-gray-400 text-[10px]">{r.email}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    {/* C2 — read-only context; team is derived server-side from the department */}
                    <p className="text-[10px] text-gray-500 mt-1">
                      <span className="font-medium text-gray-700">{requesterMeta.department || '—'}</span>
                      <span className="mx-1 text-gray-300">·</span>
                      Reports to <span className="font-medium text-gray-700">{requesterMeta.manager || '—'}</span>
                    </p>
                  </div>

                  {/* Requester Name + Email — always editable (matches original) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LBL}>
                        Requester Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="requesterName"
                        value={formData.requesterName}
                        onChange={handleChange}
                        placeholder="Or enter manually"
                        className={inp(errors.requesterName)}
                      />
                      {errors.requesterName && (
                        <p className={ERR}>{errors.requesterName}</p>
                      )}
                    </div>
                    <div>
                      <label className={LBL}>
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        name="requesterEmail"
                        value={formData.requesterEmail}
                        onChange={handleChange}
                        placeholder="email@example.com"
                        className={inp(errors.requesterEmail)}
                      />
                      {errors.requesterEmail && (
                        <p className={ERR}>{errors.requesterEmail}</p>
                      )}
                    </div>
                  </div>

                  {/* C4/C5 — Project (PM projects) + quick-create */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className={`${LBL} mb-0`}>Project</label>
                      <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showClosed}
                          onChange={e => setShowClosed(e.target.checked)}
                          className="w-3 h-3"
                        />
                        Show closed
                      </label>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <SearchSelect
                          options={projectOptions}
                          value={formData.projectId}
                          onChange={(v) => setFormData(prev => ({ ...prev, projectId: v || '' }))}
                          placeholder={projectsLoading ? 'Loading projects…' : '— Select project —'}
                          loading={projectsLoading}
                          emptyText={showClosed ? 'No projects found' : 'No open projects — tick "Show closed"'}
                          renderFooter={canCreateProject ? () => (
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); setShowProjectModal(true); }}
                              className="w-full text-left px-1.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50 rounded"
                            >
                              + Other Project
                            </button>
                          ) : undefined}
                        />
                      </div>
                      {canCreateProject && (
                        <button
                          type="button"
                          onClick={() => setShowProjectModal(true)}
                          title="Create a project that is not in the list"
                          className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1.5 border border-dashed border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 rounded text-xs font-medium transition-colors whitespace-nowrap"
                        >
                          <HiOutlinePlus className="w-3.5 h-3.5" />
                          Other Project
                        </button>
                      )}
                    </div>
                    <p className={`${HINT} mt-0.5`}>PM projects · completed / cancelled / closed hidden unless "Show closed"</p>
                  </div>

                </div>
              </div>

              {/* ── Billing Type ─────────────────────────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Billing Type
                </h2>
                <div className="flex gap-3">
                  {['Billable', 'Non-Billable'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, billable: t }))}
                      className={`flex-1 py-2 rounded border-2 text-xs font-semibold transition-colors
                        ${formData.billable === t
                          ? t === 'Billable'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-gray-400 bg-gray-100 text-gray-700'
                          : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}
                    >
                      {t === 'Billable' ? '💰 Billable' : '🔧 Non-Billable'}
                    </button>
                  ))}
                </div>
              </div>

            </div>
            {/* ═════════════════ END LEFT COLUMN ══════════════════════════ */}

            {/* ══════════════════════ RIGHT COLUMN ═════════════════════════ */}
            <div className="space-y-4">

              {/* ── Card 3: Classification ───────────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Classification
                </h2>
                <div className="space-y-3">

                  {/* Priority toggle buttons — 4 colour-coded (matches original) */}
                  <div>
                    <label className={LBL}>
                      Priority <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {FIXED_PRIORITY_OPTS.map(p => {
                        const isActive = activePriorityLabel === p;
                        const c = PRIORITY_COLORS[p];
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                priority: PRIORITY_VALUE[p],
                              }));
                              if (errors.priority)
                                setErrors(prev => ({ ...prev, priority: '' }));
                            }}
                            className={`px-2 py-1.5 rounded border text-[11px] font-medium transition-colors ${
                              isActive
                                ? c.active
                                : errors.priority
                                  ? 'border-red-300 hover:bg-gray-50'
                                  : c.idle
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>
                    {errors.priority && <p className={ERR}>{errors.priority}</p>}
                  </div>

                  {/* Impact + Urgency — same row (matches original) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LBL}>Impact</label>
                      <select
                        name="impact"
                        value={formData.impact}
                        onChange={handleChange}
                        className={sel()}
                      >
                        {(optImpact.length ? optImpact : ['Low', 'Medium', 'High']).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LBL}>Urgency</label>
                      <select
                        name="urgency"
                        value={formData.urgency}
                        onChange={handleChange}
                        className={sel()}
                      >
                        {(optUrgency.length ? optUrgency : ['Low', 'Medium', 'High']).map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Due Date — in Classification card (matches original) */}
                  <div>
                    <label className={LBL}>Due Date</label>
                    <input
                      type="datetime-local"
                      name="dueDate"
                      value={formData.dueDate}
                      onChange={handleChange}
                      min={new Date().toISOString().slice(0, 16)}
                      className={inp(!!errors.dueDate)}
                    />
                    {errors.dueDate && <span className={ERR}>{errors.dueDate}</span>}
                  </div>

                </div>
              </div>

              {/* ── Card 4: Assignment ───────────────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Assignment
                </h2>
                <div className="space-y-3">

                  {/* C3 — Team / Manager (reporting manager from the employee master) */}
                  <div>
                    <label className={LBL}>Team / Manager</label>
                    <p className={HINT}>A team is a manager and their direct reports</p>
                    <SearchSelect
                      options={teamOptions}
                      value={formData.teamManagerId}
                      onChange={handleTeamChange}
                      placeholder={teamsLoading ? 'Loading teams…' : '— Select team —'}
                      loading={teamsLoading}
                      emptyText="No teams found"
                    />
                  </div>

                  {/* C3 — Assign to: members of the chosen team, manager first */}
                  <div>
                    <label className={LBL}>Assign to</label>
                    <SearchSelect
                      options={memberOptions}
                      value={formData.assigneeId}
                      onChange={(v) => setFormData(prev => ({ ...prev, assigneeId: v || '' }))}
                      placeholder={
                        !formData.teamManagerId
                          ? 'Select a team first'
                          : membersLoading ? 'Loading members…' : '— Unassigned —'
                      }
                      disabled={!formData.teamManagerId}
                      loading={membersLoading}
                      emptyText="No members in this team"
                    />
                  </div>

                  {/* Phase 3 — effort allocation (revealed once an agent is chosen) */}
                  {formData.assigneeId && (
                    <div className="rounded border border-indigo-100 bg-indigo-50/40 p-2.5">
                      <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide mb-2">Effort allocation</p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className={LBL}>Start date</label>
                          <input
                            type="date"
                            value={alloc.from}
                            onChange={e => setAlloc(p => ({ ...p, from: e.target.value }))}
                            className={inp(false)}
                          />
                        </div>
                        <div>
                          <label className={LBL}>End date</label>
                          <input
                            type="date"
                            value={alloc.to}
                            min={alloc.from || undefined}
                            onChange={e => setAlloc(p => ({ ...p, to: e.target.value }))}
                            className={inp(false)}
                          />
                        </div>
                      </div>
                      {/* Total hours only — tickets are never allocated per day */}
                      <div>
                        <label className={LBL}>Total hours</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={alloc.allocationTotalHours}
                            onChange={e => setAlloc(p => ({ ...p, allocationTotalHours: e.target.value }))}
                            placeholder="e.g. 10"
                            className={inp(!allocHoursValid)}
                          />
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">hours</span>
                        </div>
                        <AllocationDerivedLine
                          total={allocHoursValid ? allocRaw : null}
                          from={alloc.from || null}
                          to={alloc.to || null}
                          onDerived={setAllocDerived}
                        />
                      </div>
                      {!allocHoursValid && <span className={ERR}>Total hours must be at least 0.5 in steps of 0.5</span>}
                      {!allocDatesValid && alloc.from && alloc.to && <span className={ERR}>Start date must be on or before end date</span>}
                      {/* Real capacity for the chosen agent + window (projects AND their other tickets) */}
                      <AgentCapacityLine
                        userId={formData.assigneeId}
                        from={alloc.from || null}
                        to={alloc.to || null}
                        addHoursPerDay={allocHoursValid ? allocDerived.hoursPerDay : null}
                        totalHours={allocHoursValid ? allocRaw : null}
                        suppressWarning={!!allocConflict}
                        onCapacity={setAgentCapacity}
                      />

                      {/* Server refused the allocation (HTTP 409) — nothing was created */}
                      <TicketConflictPanel
                        compact
                        conflict={allocConflict}
                        // Real capacity from the agent's availability fetch above;
                        // the panel prefers the 409 body's own figure when it has one.
                        capacity={agentCapacity}
                        onApply={applyConflictSuggestion}
                        onRequestException={() => setShowException(true)}
                        // The server says exceptions are not allowed for this allocation:
                        // no modal to open, so explain the remaining options.
                        note={allocConflict?.canRequestException === false
                          ? 'An exception cannot be requested for this allocation — reduce the hours or shift the dates using the options above.'
                          : null}
                      />
                    </div>
                  )}

                </div>
              </div>

              {/* ── Attachment ────────────────────────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Attachment
                </h2>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.zip,.txt"
                  onChange={handleFileChange}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {attachment && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Selected: <span className="font-medium">{attachment.name}</span> ({(attachment.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {/* ── Documents ─────────────────────────────────────────────── */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h2 className="text-xs font-semibold text-gray-800 mb-3 uppercase tracking-wide">
                  Documents
                </h2>
                <div className="space-y-2 mb-3">
                  <div className="flex gap-2 items-end flex-wrap">
                    <div>
                      <label className={LBL}>Category</label>
                      <select
                        value={pendingDocCategory}
                        onChange={e => setPendingDocCategory(e.target.value)}
                        className={sel()}
                      >
                        {HD_DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {pendingDocCategory === 'Others' && (
                      <div>
                        <label className={LBL}>Specify</label>
                        <input
                          value={pendingDocCategoryOther}
                          onChange={e => setPendingDocCategoryOther(e.target.value)}
                          placeholder="Category name"
                          className={inp()}
                        />
                      </div>
                    )}
                    <div>
                      <label className={LBL}>File</label>
                      <input
                        type="file"
                        onChange={e => setPendingDocFile(e.target.files[0] || null)}
                        className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!pendingDocFile) return;
                        setDocEntries(prev => [...prev, { file: pendingDocFile, category: pendingDocCategory, categoryOther: pendingDocCategoryOther }]);
                        setPendingDocFile(null);
                        setPendingDocCategoryOther('');
                      }}
                      disabled={!pendingDocFile}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {docEntries.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {docEntries.map((e, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 text-[10px]">
                          <span className="text-gray-700 truncate max-w-[160px]">{e.file.name}</span>
                          <span className="text-gray-500 mx-2">{e.category === 'Others' ? (e.categoryOther || 'Others') : e.category}</span>
                          <button type="button" onClick={() => setDocEntries(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 ml-1">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Action buttons at bottom of right column (matches original) */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || submitting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2196f3] text-white rounded text-xs font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors"
                >
                  {(saving || submitting) ? (
                    <svg
                      className="animate-spin w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12" cy="12" r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <HiOutlineSave className="w-3.5 h-3.5" />
                  )}
                  {(saving || submitting) ? 'Creating...' : 'Create Request'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="px-4 py-2 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>

            </div>
            {/* ═════════════════ END RIGHT COLUMN ═════════════════════════ */}

          </div>
        </form>
      </div>

      {/* Over-capacity → collect a reason, then create the ticket unallocated and
          raise the exception against it (handleExceptionSubmit). Same modal as
          TicketDetail / TicketList — only the write is ours (`onSubmit`). */}
      {showException && allocConflict && (
        <TicketExceptionModal
          open
          conflict={allocConflict}
          ticket={{ reqNumber: formData.title }}
          allocation={{
            assigneeId:            formData.assigneeId,
            assigneeName:          members.find(m => String(m._id ?? m.id) === String(formData.assigneeId))?.name || 'Agent',
            allocationMode:        'total',
            allocationHoursPerDay: allocDerived.hoursPerDay,
            allocationTotalHours:  allocHoursValid ? allocRaw : null,
            allocationFrom:        alloc.from,
            allocationTo:          alloc.to,
          }}
          onSubmit={handleExceptionSubmit}
          submitLabel="Create ticket & request exception"
          submittingLabel="Creating ticket…"
          onClose={() => setShowException(false)}
        />
      )}

      {/* C5 — quick-create PM project (role-gated; same API as PM › New Project) */}
      {canCreateProject && (
        <QuickCreateProjectModal
          open={showProjectModal}
          onClose={() => setShowProjectModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
