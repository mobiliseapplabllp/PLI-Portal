/**
 * CreateTicket.jsx
 * Layout matches original NewRequest.jsx exactly:
 *   LEFT  → Card 1: Request Information (Subject, Description, Type+Status, Mode+Category)
 *         → Card 2: Requester Details (Search, Name+Email, Project+Team)
 *   RIGHT → Card 3: Classification (Priority, Impact+Urgency, Due Date)
 *         → Card 4: Assignment (Group, Agent)
 *         → Attachment + Action buttons
 *
 * PLI adaptations: Redux dispatch, lowercase ENUM values, ID-based group/assignee,
 * react-hot-toast, PLI API wrappers.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  createTicket,
  fetchHdOptions,
  selectSubmitting,
  selectHdOptions,
} from '../../store/helpdeskSlice';
import { getGroupsApi } from '../../api/helpdesk/groups.api';
import { getHdProjectsApi } from '../../api/helpdesk/hdProjects.api';
import { getUsersApi } from '../../api/users.api';
import {
  HiOutlineArrowLeft,
  HiOutlineSave,
  HiOutlineChevronDown,
  HiOutlineSearch,
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
  projectId:      '',
  raisedByTeam:   '',         // group name string (matches original's formData.team)
  groupId:        '',         // INT — PLI uses ID not name
  assigneeId:     '',         // UUID — PLI primary assignee
  billable:       'Non-Billable',
  docFiles:       [],         // array of {file, category, categoryOther}
};

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

  // ── Derive live option arrays from Redux (fall back to sensible defaults) ───
  const optCategory    = (hdOptions.category    || []).map(o => o.name);
  const optMode        = (hdOptions.mode        || []).map(o => o.name);
  const optRequestType = (hdOptions.request_type|| []).map(o => o.name);
  const optImpact      = (hdOptions.impact      || []).map(o => o.name);
  const optUrgency     = (hdOptions.urgency     || []).map(o => o.name);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [formData,    setFormData]    = useState(() => {
    const src = location.state?.duplicateFrom;
    if (!src) return EMPTY_FORM;
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
      groupId:        src.groupId      || '',
      assigneeId:     '',   // do NOT copy assignee — must be re-chosen
      requesterName:  src.requesterName || src.requesterUser?.name || '',
      requesterEmail: src.requesterEmail || src.requesterUser?.email || '',
      projectId:      src.projectId    || '',
      raisedByTeam:   src.raisedByTeam || '',
      dueDate:        '',   // do NOT copy dueDate
    };
  });
  const [groups,      setGroups]      = useState([]);
  const [groupUsers,  setGroupUsers]  = useState([]);
  const [projects,    setProjects]    = useState([]);
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [attachment,  setAttachment]  = useState(null);

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

  // ── On mount: load groups + configurable options ────────────────────────────
  useEffect(() => {
    getGroupsApi()
      .then(res => setGroups(res.data?.data || res.data || []))
      .catch(() => toast.error('Failed to load groups'));
    // Only fetch options if not already loaded (avoid redundant network calls)
    if (!hdOptions || Object.keys(hdOptions).length === 0) {
      dispatch(fetchHdOptions());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Reload agent list whenever Assignment Group changes ──────────────────────
  useEffect(() => {
    if (!formData.groupId) { setGroupUsers([]); return; }
    getUsersApi({ groupId: formData.groupId, pageSize: 200 })
      .then(res => setGroupUsers(res.data?.data?.users || res.data?.data || []))
      .catch(() => setGroupUsers([]));
  }, [formData.groupId]);

  // ── Select a requester from picker ──────────────────────────────────────────
  const selectRequester = (r) => {
    const hdGroupId   = r.hdGroupId || r.hd_group_id || null;
    const hdGroupName = r.hdGroup?.name || r.hdGroupName || r.groupName || r.group_name || r.department || '';

    setFormData(prev => ({
      ...prev,
      requesterName:  r.name,
      requesterEmail: r.email,
      raisedByTeam:   hdGroupName,
      projectId:      '',     // Reset project on requester change
    }));
    setRequesterSearch('');
    setShowRequesterDropdown(false);

    // Load projects scoped to requester's helpdesk group
    if (hdGroupId) {
      getHdProjectsApi({ groupId: hdGroupId })
        .then(res => setProjects(res.data?.data || res.data || []))
        .catch(() => setProjects([]));
    } else {
      // No helpdesk group assigned — load all projects as fallback
      getHdProjectsApi()
        .then(res => setProjects(res.data?.data || res.data || []))
        .catch(() => setProjects([]));
    }
  };

  // ── Assignment group change: clear agent (matches original handleAssignmentGroupChange) ─
  const handleAssignmentGroupChange = (value) => {
    setFormData(prev => ({
      ...prev,
      groupId:    value,
      assigneeId: '',
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

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSubmitError('');

    try {
      let payload;

      // Build the normalised payload shared by both paths
      const normalized = {
        ...formData,
        // Map display labels to backend ENUM values
        priority:    PRIORITY_VALUE[formData.priority]    || formData.priority,
        impact:      IMPACT_VALUE[formData.impact]        || formData.impact.toLowerCase(),
        urgency:     URGENCY_VALUE[formData.urgency]      || formData.urgency.toLowerCase(),
        requestType: REQUEST_TYPE_VALUE[formData.requestType] || formData.requestType,
        mode:        MODE_VALUE[formData.mode]            || formData.mode,
      };
      // Strip empty optional fields
      ['groupId', 'assigneeId', 'dueDate', 'projectId', 'raisedByTeam'].forEach(k => {
        if (!normalized[k]) delete normalized[k];
      });

      if (attachment) {
        const fd = new FormData();
        Object.entries(normalized).forEach(([k, v]) => {
          if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
        });
        fd.append('attachment', attachment);
        payload = fd;
      } else {
        payload = normalized;
      }

      const result = await dispatch(createTicket(payload)).unwrap();
      toast.success('Ticket created successfully');
      // Backend renames id → _id via renameIdsForClient; fall back to .id for safety
      const ticketId = result?._id ?? result?.id;
      if (!ticketId) {
        toast.error('Unexpected server response — ticket may have been created. Refresh the list.');
        return;
      }
      // Upload any queued documents
      if (docEntries.length > 0 && ticketId) {
        const { uploadHdDocumentApi } = await import('../../api/helpdesk/helpdesk.api');
        await Promise.allSettled(docEntries.map(entry => {
          const fd = new FormData();
          fd.append('file', entry.file);
          fd.append('category', entry.category === 'Others' ? (entry.categoryOther || 'Others') : entry.category);
          return uploadHdDocumentApi(ticketId, fd);
        }));
      }
      navigate(`/helpdesk/tickets/${ticketId}`);
    } catch (err) {
      const msg =
        typeof err === 'string'
          ? err
          : err?.message || 'Failed to create request. Please try again.';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
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
                                key={r.id}
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

                  {/* Project + Raised by Team — same row (matches original layout) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={LBL}>Project</label>
                      <p className={HINT}>Projects from requester's team</p>
                      <select
                        name="projectId"
                        value={formData.projectId}
                        onChange={handleChange}
                        className={sel()}
                      >
                        <option value="">
                          {projects.length
                            ? '-- Select Project --'
                            : !formData.requesterName
                              ? '-- Select requester first --'
                              : '-- No projects found --'}
                        </option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {p.status && p.status !== 'Active' ? ` (${p.status})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={LBL}>Raised by Team</label>
                      <p className={HINT}>Which team raised it (≠ Assignment Group)</p>
                      <select
                        value={formData.raisedByTeam}
                        onChange={e =>
                          setFormData(prev => ({ ...prev, raisedByTeam: e.target.value }))
                        }
                        className={sel()}
                      >
                        <option value="">-- Select Group --</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.name}>{g.name}</option>
                        ))}
                      </select>
                    </div>
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

                  {/* Group */}
                  <div>
                    <label className={LBL}>Group</label>
                    <select
                      name="groupId"
                      value={formData.groupId}
                      onChange={e => handleAssignmentGroupChange(e.target.value)}
                      className={sel()}
                    >
                      <option value="">-- Select Group --</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Assign to Agent — disabled until group selected (matches original) */}
                  <div>
                    <label className={LBL}>Assign to Agent</label>
                    <select
                      name="assigneeId"
                      value={formData.assigneeId}
                      onChange={handleChange}
                      disabled={!formData.groupId}
                      className={`${sel()} ${!formData.groupId ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <option value="">
                        {!formData.groupId ? '-- Select a group first --' : '-- Unassigned --'}
                      </option>
                      {groupUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name}{u.role ? ` (${u.role})` : ''}
                        </option>
                      ))}
                    </select>
                    {formData.groupId && groupUsers.length === 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">No users in this group</p>
                    )}
                  </div>

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
    </div>
  );
}
