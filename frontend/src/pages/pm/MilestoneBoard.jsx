import { useEffect, useState, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import {
  getMilestonesApi, createMilestoneApi, createSubMilestoneApi,
  updateMilestoneApi, deleteMilestoneApi,
  updateMilestoneStatusApi, updateMilestoneProgressApi,
  exportMilestonesApi, getMilestoneTemplateApi,
  validateMilestoneImportApi, commitMilestoneImportApi,
} from '../../api/pm/milestones.api';
import { getProjectByIdApi } from '../../api/pm/projects.api';
import {
  getMilestoneDocumentsApi,
  uploadMilestoneDocumentApi,
  deleteMilestoneDocumentApi,
  downloadMilestoneDocumentUrl,
} from '../../api/pm/documents.api';
import { getUsersApi } from '../../api/users.api';
import {
  HiOutlineArrowLeft, HiOutlinePlus, HiOutlineTrash, HiOutlinePencil,
  HiOutlineFlag, HiOutlineExclamation, HiOutlinePaperClip,
  HiOutlineDownload, HiOutlineUpload, HiOutlineDocumentText,
  HiOutlineX, HiOutlineCheckCircle, HiOutlineCalendar,
} from 'react-icons/hi';

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  delayed: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-400',
};
const MANAGER_ROLES = ['admin', 'manager', 'senior_manager'];
const DOC_CATEGORIES = [
  'SOW / Client Contracts',
  'Requirement Documents / BRD',
  'Solution Architecture Documents',
  'Technical Design Documentation',
  'Others',
];
const CATEGORY_COLORS = {
  'SOW / Client Contracts': 'bg-blue-100 text-blue-700',
  'Requirement Documents / BRD': 'bg-purple-100 text-purple-700',
  'Solution Architecture Documents': 'bg-emerald-100 text-emerald-700',
  'Technical Design Documentation': 'bg-orange-100 text-orange-700',
  'Others': 'bg-gray-100 text-gray-600',
};

const EMPTY_FORM = {
  name: '', description: '', plannedStartDate: '', plannedEndDate: '',
  accountableUserId: '', status: 'not_started', completionPercentage: 0,
};
const EMPTY_SUB_FORM = {
  name: '', plannedStartDate: '', plannedEndDate: '',
  accountableUserId: '', status: 'not_started',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtLabel = (s) =>
  s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
const formatBytes = (n) => {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};
const isDefault = (m) => m.isDefault === true || m.isDefault === 1;

// Map any status label/value → the exact ENUM value the backend accepts
// Handles "Yet To Start" → 'not_started', title-case names, etc.
const MS_STATUS_VALID = new Set(['not_started','in_progress','completed','delayed','on_hold','cancelled']);
const MS_STATUS_ALIAS = {
  'yet_to_start': 'not_started', 'yet to start': 'not_started',
  'not_started': 'not_started',  'not started': 'not_started',
  'in_progress': 'in_progress',  'in progress': 'in_progress',
  'active': 'in_progress',       'on track': 'in_progress',
  'on_track': 'in_progress',
  'completed': 'completed',      'done': 'completed',
  'delayed': 'delayed',          'overdue': 'delayed',
  'on_hold': 'on_hold',          'on hold': 'on_hold',      'hold': 'on_hold',
  'cancelled': 'cancelled',      'canceled': 'cancelled',
};
const resolveStatusVal = (name) => {
  const lower = (name ?? '').toLowerCase().replace(/_/g, ' ').trim();
  const snake = lower.replace(/ /g, '_');
  return MS_STATUS_ALIAS[lower] || MS_STATUS_ALIAS[snake] || (MS_STATUS_VALID.has(snake) ? snake : null);
};

// ── Inline icons (presentational only) ───────────────────────────────────────
const LockIcon = ({ className = 'w-3 h-3 text-gray-400 flex-shrink-0' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const CaretIcon = ({ className = '' }) => (
  <svg className={className} fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
  </svg>
);

// Shared field styles for the default-milestone card
const ACTUAL_DATE_BASE =
  'border rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition-colors';
const actualDateCls = (hasValue, size = 'w-32 px-2 py-1 text-xs') =>
  `${ACTUAL_DATE_BASE} ${size} ${hasValue
    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-700'
    : 'border-dashed border-gray-300 text-gray-500 bg-white'}`;
const plannedInputCls =
  'text-xs border border-dashed border-gray-300 rounded-md px-2 py-1 text-gray-600 bg-white w-32 focus:outline-none focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400 transition-colors';
const statusPillCls = (colorCls) =>
  `appearance-none cursor-pointer pl-3 pr-6 py-1 rounded-full text-xs font-semibold border-0 capitalize focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${colorCls || 'bg-gray-100 text-gray-600'}`;

// ── Component ────────────────────────────────────────────────────────────────
export default function MilestoneBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);

  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [milestoneStatuses, setMilestoneStatuses] = useState([]);
  const [subMilestoneStatuses, setSubMilestoneStatuses] = useState([]);

  // Flat milestone create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Actual date change modal
  const [dateChangeModal, setDateChangeModal] = useState(null); // { milestoneId, field, value } | null
  const [dateChangeReason, setDateChangeReason] = useState('');

  // Sub-milestone inline form
  const [showSubFormFor, setShowSubFormFor] = useState(null);
  const [subForm, setSubForm] = useState(EMPTY_SUB_FORM);
  const [savingSub, setSavingSub] = useState(false);

  // Default milestone weight editing
  const [editingWeightId, setEditingWeightId] = useState(null);
  const [weightInputValue, setWeightInputValue] = useState('');

  // Import / Export
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showImportResult, setShowImportResult] = useState(false);

  // Document modal
  const [docModalMilestone, setDocModalMilestone] = useState(null);
  const [milestoneDocs, setMilestoneDocs] = useState([]);
  const [mDocLoading, setMDocLoading] = useState(false);
  const [mDocFile, setMDocFile] = useState(null);
  const [mDocCategory, setMDocCategory] = useState('SOW / Client Contracts');
  const [mDocCategoryOther, setMDocCategoryOther] = useState('');
  const [mDocUploading, setMDocUploading] = useState(false);

  // Per-card inline edit
  const [editingCardId,  setEditingCardId]  = useState(null);
  const [editingSubId,   setEditingSubId]   = useState(null);
  const [subEditForm,    setSubEditForm]    = useState({ name: '', accountableUserId: '', status: 'not_started', completionPercentage: 0 });

  // Derived
  const canManage = MANAGER_ROLES.includes(user?.role) ||
    (project && String(project.managerId) === String(user?._id || user?.id));
  // Only admin can create / delete / import TOP-LEVEL milestones.
  // Managers can add / edit / delete milestones (not just admin)
  const isAdmin        = user?.role === 'admin';
  const defaultMilestones = milestones.filter(isDefault);
  const flatMilestones = milestones.filter(m => !isDefault(m));

  // Editing / deleting existing top-level rows stays admin-only.
  const canAddTopLevel = isAdmin;

  // Creating NEW top-level milestones is only allowed while the plan is empty.
  // Once the project-type template has produced its default phases, the phase
  // structure is fixed — PMs extend the plan by adding sub-milestones under an
  // existing phase, not by adding more phases.
  const canCreateTopLevel = isAdmin && defaultMilestones.length === 0;
  const totalWeight = defaultMilestones.reduce(
    (sum, m) => sum + (m.weightPercentage != null ? Number(m.weightPercentage) : 0), 0,
  );
  const weightComplete = defaultMilestones.length > 0 && defaultMilestones.every(m => m.weightPercentage != null);
  const weightValid = weightComplete && Math.abs(totalWeight - 100) < 0.01;

  const today = new Date().toISOString().slice(0, 10);
  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  // Normalize DB status values: 'In Progress' → 'in_progress', handle both cases
  const normalizeStatus = (s) => s?.toLowerCase().replace(/ /g, '_') ?? '';

  // ── Data loading ────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([getProjectByIdApi(id), getMilestonesApi(id)]);
      setProject(pRes.data.data);
      setMilestones(mRes.data.data || []);
    } catch { toast.error('Failed to load milestones'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [pRes, mRes] = await Promise.all([getProjectByIdApi(id), getMilestonesApi(id)]);
        const proj = pRes.data.data;
        setProject(proj);
        setMilestones(mRes.data.data || []);
        const uid = String(user?._id || user?.id || '');
        const isMgr = MANAGER_ROLES.includes(user?.role) ||
          (proj && uid && String(proj.managerId) === uid);
        if (isMgr) {
          getUsersApi({ isActive: true, limit: 200 })
            .then(res => setUsers(res.data?.data?.users || res.data?.data || []))
            .catch(() => toast.error('Failed to load users list'));
        }
      } catch { toast.error('Failed to load milestones'); }
      finally { setLoading(false); }
    };
    init(); // eslint-disable-line react-hooks/exhaustive-deps
  }, [id]);

  const MILESTONE_STATUS_FALLBACK = [
    { name: 'Not Started', value: 'not_started' },
    { name: 'In Progress', value: 'in_progress' },
    { name: 'Completed',   value: 'completed' },
    { name: 'Delayed',     value: 'delayed' },
    { name: 'On Hold',     value: 'on_hold' },
    { name: 'Cancelled',   value: 'cancelled' },
  ];
  const SUB_STATUS_FALLBACK = [
    { name: 'Not Started', value: 'not_started' },
    { name: 'In Progress', value: 'in_progress' },
    { name: 'Completed',   value: 'completed' },
    { name: 'On Hold',     value: 'on_hold' },
    { name: 'Cancelled',   value: 'cancelled' },
  ];

  useEffect(() => {
    // Fetch milestone statuses — fall back to hardcoded if API fails OR returns empty array
    api.get('/pm/config/statuses?scope=milestone')
      .then(res => {
        const raw = res.data?.data ?? [];
        setMilestoneStatuses(raw.length > 0 ? raw : MILESTONE_STATUS_FALLBACK);
      })
      .catch(() => setMilestoneStatuses(MILESTONE_STATUS_FALLBACK));

    // Fetch sub-milestone statuses — forSubMilestone may be false for all rows if migration
    // 022 backfill set it to 0. If empty, fall back to milestone statuses set.
    api.get('/pm/config/statuses?scope=sub_milestone')
      .then(res => {
        const raw = res.data?.data ?? [];
        setSubMilestoneStatuses(raw.length > 0 ? raw : SUB_STATUS_FALLBACK);
      })
      .catch(() => setSubMilestoneStatuses(SUB_STATUS_FALLBACK));
  }, []); // run once on mount

  // ── Flat milestone handlers ─────────────────────────────────────────────
  const setF = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); setEditingCardId(null); };
  const openEdit = (m) => {
    setForm({
      name: m.name,
      description: m.description || '',
      plannedStartDate: m.plannedStartDate ? m.plannedStartDate.slice(0, 10) : '',
      plannedEndDate: m.plannedEndDate ? m.plannedEndDate.slice(0, 10) : '',
      accountableUserId: m.accountableUserId || '',
      status: m.status,
      completionPercentage: m.completionPercentage || 0,
    });
    setEditingCardId(m._id || m.id);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Milestone name is required'); return false; }
    setSaving(true);
    try {
      const resolvedId = editingId || editingCardId;
      if (resolvedId) {
        await updateMilestoneApi(id, resolvedId, form);
        toast.success('Milestone updated');
      } else {
        await createMilestoneApi(id, form);
        toast.success('Milestone created');
      }
      setShowForm(false);
      load();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
      return false;
    } finally { setSaving(false); }
  };

  const handleSubEdit = async (smId) => {
    if (!subEditForm.name.trim()) return toast.error('Name is required');
    try {
      await updateMilestoneApi(id, smId, {
        name:                 subEditForm.name,
        accountableUserId:    subEditForm.accountableUserId,
        status:               subEditForm.status,
        completionPercentage: subEditForm.completionPercentage,
      });
      toast.success('Sub-milestone updated');
      setEditingSubId(null);
      setMilestones(prev => prev.map(m => ({
        ...m,
        subMilestones: (m.subMilestones || []).map(sm =>
          (sm._id || sm.id) === smId
            ? { ...sm, ...subEditForm, accountableUser: users?.find(u => (u._id || u.id) === subEditForm.accountableUserId) || sm.accountableUser }
            : sm
        ),
      })));
      load();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed to update'); }
  };

  const handleDelete = async (milestoneId) => {
    if (!window.confirm('Delete this milestone?')) return;
    try {
      await deleteMilestoneApi(id, milestoneId);
      toast.success('Milestone deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  // ── Status / Progress (works for top-level and sub-milestones) ──────────
  const handleStatusChange = async (milestoneId, status) => {
    try {
      await updateMilestoneStatusApi(id, milestoneId, status);
      setMilestones(prev => prev.map(m => {
        if ((m._id || m.id) === milestoneId) return { ...m, status };
        return {
          ...m,
          subMilestones: (m.subMilestones || []).map(sm =>
            (sm._id || sm.id) === milestoneId ? { ...sm, status } : sm,
          ),
        };
      }));
      toast.success('Status updated');
    } catch { toast.error('Failed to update status'); }
  };

  const handleProgressChange = async (milestoneId, pct) => {
    try {
      const res = await updateMilestoneProgressApi(id, milestoneId, Number(pct));
      // A sub's progress rolls up — the server returns the recalculated parent
      const parent   = res?.data?.data?.parentMilestone;
      const parentId = parent ? (parent._id ?? parent.id) : null;
      setMilestones(prev => prev.map(m => {
        if ((m._id || m.id) === milestoneId) return { ...m, completionPercentage: Number(pct) };
        const updated = {
          ...m,
          subMilestones: (m.subMilestones || []).map(sm =>
            (sm._id || sm.id) === milestoneId ? { ...sm, completionPercentage: Number(pct) } : sm,
          ),
        };
        if (parentId && (m._id || m.id) === parentId) updated.completionPercentage = parent.completionPercentage;
        return updated;
      }));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error?.message || 'Failed to update progress');
    }
  };

  // ── Default milestone weight editing ────────────────────────────────────
  const startEditWeight = (m) => {
    setEditingWeightId(m._id || m.id);
    setWeightInputValue(m.weightPercentage != null ? String(m.weightPercentage) : '');
  };

  const handleWeightSave = async (milestoneId) => {
    const val = parseFloat(weightInputValue);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error('Enter a valid percentage between 0 and 100');
      setEditingWeightId(null);
      return;
    }

    // Pre-check the project's 100% budget so the PM gets instant feedback.
    // The backend enforces the same rule — this is convenience, not the guard.
    const othersTotal = defaultMilestones
      .filter(m => (m._id || m.id) !== milestoneId)
      .reduce((sum, m) => sum + (m.weightPercentage != null ? Number(m.weightPercentage) : 0), 0);
    const projected = othersTotal + val;
    if (projected > 100.009) {
      const remaining = Math.max(0, Math.round((100 - othersTotal) * 100) / 100);
      toast.error(
        `Cannot set ${val}% — project would total ${Math.round(projected * 100) / 100}%. ` +
        `Only ${remaining}% remains.`
      );
      return; // keep the editor open so the value can be corrected
    }

    try {
      await updateMilestoneApi(id, milestoneId, { weightPercentage: val });
      setMilestones(prev => prev.map(m =>
        (m._id || m.id) === milestoneId ? { ...m, weightPercentage: val } : m,
      ));
      toast.success('Weight updated');
      setEditingWeightId(null);
    } catch (err) {
      // Surface the backend's specific message (e.g. the budget error)
      toast.error(err?.response?.data?.message || 'Failed to update weight');
    }
  };

  // ── Sub-milestone form handlers ─────────────────────────────────────────
  const setSF = (f, v) => setSubForm(prev => ({ ...prev, [f]: v }));

  const openSubForm = (parentId) => {
    setShowSubFormFor(parentId);
    setSubForm(EMPTY_SUB_FORM);
  };

  const handleCreateSubMilestone = async (parentId) => {
    if (!subForm.name.trim()) return toast.error('Sub-milestone name is required');
    setSavingSub(true);
    try {
      // No weight is sent — the server splits the milestone's weight equally
      await createSubMilestoneApi(id, parentId, subForm);
      toast.success('Sub-milestone created');
      setShowSubFormFor(null);
      setSubForm(EMPTY_SUB_FORM);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create sub-milestone');
    } finally { setSavingSub(false); }
  };

  // ── Export / Import ─────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportMilestonesApi({ projectId: id });
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `milestones-${project?.name || id}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Export failed'); }
    finally { setExporting(false); }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await getMilestoneTemplateApi();
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'milestone-import-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Failed to download template'); }
  };

  const handleValidateImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await validateMilestoneImportApi(fd);
      setImportPreview(res.data.data);
    } catch { toast.error('Validation failed'); }
    finally { setImporting(false); }
  };

  const handleCommitImport = async () => {
    if (!importPreview?.rows) return;
    setImporting(true);
    try {
      const validRows = importPreview.rows.filter(r => r.valid);
      const res = await commitMilestoneImportApi({ projectId: id, rows: validRows });
      const result = res.data?.data;
      // Merge pre-validation client errors with server-side errors so both show up
      const clientErrors = importPreview.rows
        .filter(r => !r.valid)
        .map(r => ({ row: r.rowNumber, reason: r.errors?.join(', ') || 'Validation failed' }));
      const serverErrors = (result?.errors || []).map(e => ({ row: e.row, reason: e.error }));
      setImportResult({
        created: result?.inserted ?? validRows.length, // backend key is 'inserted', not 'created'
        skipped: (result?.skipped ?? 0) + clientErrors.length,
        errors:  [...clientErrors, ...serverErrors],
      });
      setShowImportResult(true);
      setImportPreview(null);
      await load();
    } catch (err) {
      toast.error('Import failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setImporting(false);
    }
  };

  // ── Document modal handlers ─────────────────────────────────────────────
  const openDocModal = async (m) => {
    const milestone = { id: m._id || m.id, name: m.name };
    setDocModalMilestone(milestone);
    setMDocFile(null);
    setMDocCategory('SOW / Client Contracts');
    setMDocCategoryOther('');
    setMDocLoading(true);
    try {
      const res = await getMilestoneDocumentsApi(id, milestone.id);
      setMilestoneDocs(res.data?.data || []);
    } catch { toast.error('Failed to load milestone documents'); setMilestoneDocs([]); }
    finally { setMDocLoading(false); }
  };

  const handleMDocUpload = async () => {
    if (!mDocFile) return toast.error('Select a file first');
    const fd = new FormData();
    fd.append('file', mDocFile);
    fd.append('category', mDocCategory === 'Others' ? (mDocCategoryOther.trim() || 'Others') : mDocCategory);
    setMDocUploading(true);
    try {
      await uploadMilestoneDocumentApi(id, docModalMilestone.id, fd);
      toast.success('Document uploaded');
      setMDocFile(null);
      setMDocCategoryOther('');
      const res = await getMilestoneDocumentsApi(id, docModalMilestone.id);
      setMilestoneDocs(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Upload failed');
    } finally { setMDocUploading(false); }
  };

  const handleMDocDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await deleteMilestoneDocumentApi(id, docModalMilestone.id, docId);
      toast.success('Document deleted');
      setMilestoneDocs(prev => prev.filter(d => (d._id || d.id) !== docId));
    } catch { toast.error('Failed to delete document'); }
  };

  // ── Actual date handlers ─────────────────────────────────────────────────
  const handleActualDateChange = (milestoneId, field, value) => {
    setDateChangeModal({ milestoneId, field, value });
    setDateChangeReason('');
  };

  const confirmDateChange = async () => {
    if (!dateChangeModal) return;
    const { milestoneId, field, value } = dateChangeModal;
    const isActual = field.startsWith('actual');
    const endpoint = isActual ? 'actual-dates' : 'planned-dates';
    try {
      const res = await api.patch(
        `/pm/projects/${id}/milestones/${milestoneId}/${endpoint}`,
        { [field]: value, reason: dateChangeReason },
      );
      // The API echoes the milestone with a trimmed `subMilestones` include
      // (id/status/actualEndDate only) — spreading it as-is would wipe the
      // fully-loaded sub-milestone rows rendered below the card. Drop it, plus
      // the transient `alert` flag, before merging.
      const patch = { ...(res.data.data || {}) };
      delete patch.subMilestones;
      delete patch.alert;

      setMilestones(prev => prev.map(m => {
        if ((m._id || m.id) === milestoneId) return { ...m, ...patch };
        if (!m.subMilestones?.length) return m;
        return {
          ...m,
          subMilestones: m.subMilestones.map(sm =>
            (sm._id || sm.id) === milestoneId ? { ...sm, ...patch } : sm,
          ),
        };
      }));
      if (res.data.data?.alert === 'deadline_near') {
        toast('Deadline approaching — planned end date is within 7 days', { icon: '⚠️' });
      }
      setDateChangeModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to update date');
    }
  };

  // ── Planned-date lock (admin) ────────────────────────────────────────────
  // Planned dates are the baseline and lock once set. An admin can unlock a
  // milestone (with a reason) so a manager can reset them ONCE; the next
  // planned-date save re-locks automatically (enforced server-side).
  const isPlannedUnlocked = (m) => !!m?.plannedDatesUnlockedAt;

  const applyMilestonePatch = (milestoneId, patch) => {
    setMilestones(prev => prev.map(m => {
      if ((m._id || m.id) === milestoneId) return { ...m, ...patch };
      if (!m.subMilestones?.length) return m;
      return {
        ...m,
        subMilestones: m.subMilestones.map(sm =>
          (sm._id || sm.id) === milestoneId ? { ...sm, ...patch } : sm,
        ),
      };
    }));
  };

  const handleUnlockPlanned = async (milestoneId) => {
    const reason = window.prompt(
      'Unlock planned dates for this milestone?\n\n' +
      'A manager will be able to reset them once, after which they lock again.\n' +
      'Enter the reason (required — it is written to the audit log):'
    );
    if (reason === null) return;                       // cancelled
    if (!reason.trim()) return toast.error('A reason is required to unlock planned dates');
    try {
      const res = await api.patch(
        `/pm/projects/${id}/milestones/${milestoneId}/planned-dates/unlock`,
        { reason: reason.trim() },
      );
      const patch = { ...(res.data?.data || {}) };
      delete patch.subMilestones; delete patch.alert;
      applyMilestonePatch(milestoneId, patch);
      toast.success('Planned dates unlocked — the next change will re-lock them');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to unlock');
    }
  };

  const handleLockPlanned = async (milestoneId) => {
    if (!window.confirm('Re-lock planned dates without changing them?')) return;
    try {
      const res = await api.patch(`/pm/projects/${id}/milestones/${milestoneId}/planned-dates/lock`);
      const patch = { ...(res.data?.data || {}) };
      delete patch.subMilestones; delete patch.alert;
      applyMilestonePatch(milestoneId, patch);
      toast.success('Planned dates locked');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to lock');
    }
  };

  // ── Planned date handlers ───────────────────────────────────────────────
  // BUSINESS RULE: planned dates can be entered ONCE. As soon as a value
  // exists it is rendered as locked read-only text, so this handler only ever
  // runs for the first-time entry. The guard below is the safety net.
  // (A re-baseline on an UNLOCKED milestone goes through handleActualDateChange
  //  → confirmDateChange instead, so the reason modal collects a justification.)
  const findMilestoneById = (milestoneId) => {
    for (const m of milestones) {
      if ((m._id || m.id) === milestoneId) return m;
      const sm = (m.subMilestones || []).find(s => (s._id || s.id) === milestoneId);
      if (sm) return sm;
    }
    return null;
  };

  const handlePlannedDateSave = async (milestoneId, plannedStartDate, plannedEndDate) => {
    if (!plannedStartDate && !plannedEndDate) return;

    const current = findMilestoneById(milestoneId);
    if (plannedStartDate && current?.plannedStartDate) {
      return toast.error('Planned start date is locked and cannot be changed');
    }
    if (plannedEndDate && current?.plannedEndDate) {
      return toast.error('Planned end date is locked and cannot be changed');
    }

    try {
      const res = await api.patch(
        `/pm/projects/${id}/milestones/${milestoneId}/planned-dates`,
        {
          plannedStartDate: plannedStartDate || undefined,
          plannedEndDate: plannedEndDate || undefined,
          reason: 'Initial planned date entry',
        },
      );
      // Same trimming as confirmDateChange — never let the echoed payload wipe
      // the fully-loaded sub-milestone rows or leak the transient `alert` flag.
      const patch = { ...(res.data?.data || {}) };
      delete patch.subMilestones;
      delete patch.alert;

      setMilestones(prev => prev.map(m => {
        if ((m._id || m.id) === milestoneId) return { ...m, ...patch };
        if (!m.subMilestones?.length) return m;
        return {
          ...m,
          subMilestones: m.subMilestones.map(sm =>
            (sm._id || sm.id) === milestoneId ? { ...sm, ...patch } : sm,
          ),
        };
      }));
      toast.success('Planned date saved — it is now locked');
      if (res.data?.data?.alert === 'deadline_near') {
        toast('Deadline approaching — planned end date is within 7 days', { icon: '⚠️' });
      }
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save planned date');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate(`/pm/projects/${id}`)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Milestones</h1>
          <p className="text-sm text-gray-500 truncate">{project?.name || '...'}</p>
        </div>

        {/* Weight validation chip — only when default milestones exist */}
        {defaultMilestones.length > 0 && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${
            weightValid
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-orange-50 text-orange-700 border-orange-200'
          }`}>
            {weightValid
              ? <HiOutlineCheckCircle className="w-4 h-4" />
              : <HiOutlineExclamation className="w-4 h-4" />
            }
            Weight: {totalWeight.toFixed(1)} / 100%
            {!weightComplete && <span className="text-xs ml-1 opacity-70">(incomplete)</span>}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Export milestones to Excel"
          >
            <HiOutlineDownload className="w-4 h-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate(`/pm/projects/${id}/gantt`)}
              className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Gantt View
            </button>
          )}
          {/* Hidden once default phases exist — only sub-milestones may be added then */}
          {canCreateTopLevel && (
            <>
              <button
                type="button"
                onClick={() => { setShowImport(true); setImportPreview(null); setImportFile(null); }}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                title="Import milestones from Excel"
              >
                <HiOutlineUpload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <HiOutlinePlus className="w-4 h-4" /> Add Milestone
              </button>
            </>
          )}
        </div>
      </div>

      {/* Flat milestone create/edit form */}
      {showForm && !editingCardId && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">{editingId ? 'Edit Milestone' : 'New Milestone'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Milestone Name *</label>
              <input value={form.name} onChange={e => setF('name', e.target.value)} className={inputCls} placeholder="e.g. Design Phase Complete" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={2} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Planned Start Date</label>
              {editingId && milestones.find(m => (m._id || m.id) === editingId)?.plannedStartDate
                ? <div className="flex items-center gap-1.5 px-3 py-2 border border-gray-100 rounded-lg bg-gray-50 text-sm text-gray-500"><LockIcon /> {fmtDate(milestones.find(m => (m._id || m.id) === editingId).plannedStartDate)}</div>
                : <input type="date" value={form.plannedStartDate} onChange={e => setF('plannedStartDate', e.target.value)} className={inputCls} />
              }
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Planned End Date (Deadline)</label>
              {editingId && milestones.find(m => (m._id || m.id) === editingId)?.plannedEndDate
                ? <div className="flex items-center gap-1.5 px-3 py-2 border border-gray-100 rounded-lg bg-gray-50 text-sm text-gray-500"><LockIcon /> {fmtDate(milestones.find(m => (m._id || m.id) === editingId).plannedEndDate)}</div>
                : <input type="date" value={form.plannedEndDate} onChange={e => setF('plannedEndDate', e.target.value)} className={inputCls} />
              }
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Accountable Person</label>
              <select value={form.accountableUserId} onChange={e => setF('accountableUserId', e.target.value)} className={inputCls}>
                <option value="">Select person</option>
                {users.map(u => <option key={u._id || u.id} value={u._id || u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
              <select value={form.status} onChange={e => setF('status', e.target.value)} className={inputCls}>
                {milestoneStatuses.map(s => {
                  const val = resolveStatusVal(s.value ?? s.name ?? s);
                  if (!val) return null;
                  const label = s.name ?? s;
                  return <option key={val} value={val}>{label}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Completion % ({form.completionPercentage}%)
              </label>
              <input
                type="range" min="0" max="100" step="5"
                value={form.completionPercentage}
                onChange={e => setF('completionPercentage', Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Loading...</div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════
              DEFAULT MILESTONES — card per milestone + sub-table
          ════════════════════════════════════════════════════ */}
          {defaultMilestones.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Default Milestones</h2>

              {defaultMilestones.map(m => {
                const mId = m._id || m.id;
                const subs = m.subMilestones || [];
                const isEditingWeight = editingWeightId === mId;
                const mStatus = normalizeStatus(m.status);
                const mProgress = Math.round(m.completionPercentage || 0);
                const dueInDays = m.plannedEndDate
                  ? Math.ceil((new Date(m.plannedEndDate) - new Date()) / 86400000)
                  : null;
                const showDueBadge = dueInDays !== null && dueInDays <= 7 && dueInDays >= 0
                  && (m.completionPercentage ?? 0) < 80;

                return (
                  <div key={mId} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

                    {/* ── Card header ───────────────────────────────────── */}
                    <div className="px-5 py-4 border-b border-gray-100">

                      {/* Title row */}
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                          <HiOutlineFlag className="w-4 h-4 text-emerald-600" />
                        </span>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-gray-900 truncate min-w-0">{m.name}</h3>
                            <span className="px-1.5 py-0.5 text-[10px] rounded font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                              Default
                            </span>
                            {showDueBadge && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                                <HiOutlineExclamation className="w-3 h-3" />
                                {dueInDays === 0 ? 'Due today' : `Due in ${dueInDays}d`}
                              </span>
                            )}
                          </div>
                          {m.description && (
                            <p className="text-xs text-gray-400 mt-1 truncate max-w-xl">{m.description}</p>
                          )}
                        </div>

                        {/* Status + Docs */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {canManage ? (
                            <div className="relative">
                              <select
                                value={mStatus || 'not_started'}
                                onChange={e => handleStatusChange(mId, e.target.value)}
                                className={statusPillCls(STATUS_COLORS[mStatus])}
                                title="Change milestone status"
                              >
                                {milestoneStatuses.map(s => {
                                  const val = resolveStatusVal(s.value ?? s.name ?? s);
                                  if (!val) return null;
                                  const label = s.name ?? s;
                                  return <option key={val} value={val}>{label}</option>;
                                })}
                              </select>
                              <CaretIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
                            </div>
                          ) : (
                            <span className={`text-xs px-3 py-1 rounded-full font-semibold capitalize ${STATUS_COLORS[mStatus] || 'bg-gray-100 text-gray-600'}`}>
                              {fmtLabel(mStatus)}
                            </span>
                          )}

                          <button
                            onClick={() => openDocModal(m)}
                            className="p-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Milestone documents"
                          >
                            <HiOutlinePaperClip className="w-4 h-4" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => editingCardId === mId ? setEditingCardId(null) : openEdit(m)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${editingCardId === mId ? 'bg-gray-100 text-gray-600' : 'bg-white border border-gray-200 text-gray-600 hover:border-emerald-400 hover:text-emerald-700'}`}
                              title="Edit milestone"
                            >
                              <HiOutlinePencil className="w-3 h-3" />
                              {editingCardId === mId ? 'Cancel' : 'Edit'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Two-column date panel */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 sm:pl-11">

                        {/* PLANNED */}
                        <div className={`rounded-lg px-4 py-3 ${isPlannedUnlocked(m) ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <HiOutlineCalendar className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Planned</span>
                            {isPlannedUnlocked(m) && (
                              <span className="text-[10px] font-semibold text-amber-700 bg-white border border-amber-200 rounded px-1.5 py-0.5" title="An admin has unlocked these dates. The next change re-locks them.">
                                Unlocked
                              </span>
                            )}
                            {/* Admin-only lock control — only meaningful once a date exists */}
                            {isAdmin && (m.plannedStartDate || m.plannedEndDate) && (
                              isPlannedUnlocked(m) ? (
                                <button
                                  type="button"
                                  onClick={() => handleLockPlanned(mId)}
                                  className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-800 hover:bg-white border border-transparent hover:border-gray-200 rounded px-2 py-0.5 transition-colors"
                                  title="Re-lock without changing"
                                >
                                  Lock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUnlockPlanned(mId)}
                                  className="ml-auto text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:bg-white border border-transparent hover:border-blue-200 rounded px-2 py-0.5 transition-colors"
                                  title="Unlock so a manager can reset the planned dates once"
                                >
                                  Unlock
                                </button>
                              )
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-10 flex-shrink-0 text-xs text-gray-400">Start</span>
                              {canManage ? (
                                <>
                                  {m.plannedStartDate && isPlannedUnlocked(m) ? (
                                    <input
                                      type="date"
                                      defaultValue={m.plannedStartDate.slice(0, 10)}
                                      title="Unlocked — pick a new planned start (you will be asked for a reason)"
                                      onChange={e => e.target.value && e.target.value !== m.plannedStartDate.slice(0, 10) && handleActualDateChange(mId, 'plannedStartDate', e.target.value)}
                                      className={plannedInputCls + ' border-amber-400'}
                                    />
                                  ) : m.plannedStartDate ? (
                                    <span
                                      className="inline-flex items-center gap-1 text-xs text-gray-700 font-medium"
                                      title="Planned start date is locked — ask an admin to unlock it"
                                    >
                                      <LockIcon /> {fmtDate(m.plannedStartDate)}
                                    </span>
                                  ) : (
                                    <input
                                      type="date"
                                      title="Set planned start date (can only be set once)"
                                      onChange={e => e.target.value && handlePlannedDateSave(mId, e.target.value, null)}
                                      className={plannedInputCls}
                                    />
                                  )}
                                </>
                              ) : (
                                m.plannedStartDate ? <span className="text-xs text-gray-700">{fmtDate(m.plannedStartDate)}</span> : <span className="text-gray-400">—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 flex-shrink-0 text-xs text-gray-400">End</span>
                              {canManage ? (
                                <>
                                  {m.plannedEndDate && isPlannedUnlocked(m) ? (
                                    <input
                                      type="date"
                                      defaultValue={m.plannedEndDate.slice(0, 10)}
                                      min={m.plannedStartDate ? m.plannedStartDate.slice(0, 10) : undefined}
                                      title="Unlocked — pick a new planned end (you will be asked for a reason)"
                                      onChange={e => e.target.value && e.target.value !== m.plannedEndDate.slice(0, 10) && handleActualDateChange(mId, 'plannedEndDate', e.target.value)}
                                      className={plannedInputCls + ' border-amber-400'}
                                    />
                                  ) : m.plannedEndDate ? (
                                    <span
                                      className="inline-flex items-center gap-1 text-xs text-gray-700 font-medium"
                                      title="Planned end date is locked — ask an admin to unlock it"
                                    >
                                      <LockIcon /> {fmtDate(m.plannedEndDate)}
                                    </span>
                                  ) : (
                                    <input
                                      type="date"
                                      min={m.plannedStartDate ? m.plannedStartDate.slice(0, 10) : undefined}
                                      title="Set planned end date (can only be set once)"
                                      onChange={e => e.target.value && handlePlannedDateSave(mId, null, e.target.value)}
                                      className={plannedInputCls}
                                    />
                                  )}
                                </>
                              ) : (
                                m.plannedEndDate ? <span className="text-xs text-gray-700">{fmtDate(m.plannedEndDate)}</span> : <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ACTUAL */}
                        <div className="bg-emerald-50/30 border border-emerald-100/70 rounded-lg px-4 py-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <HiOutlineCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Actual</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="w-10 flex-shrink-0 text-xs text-gray-400">Start</span>
                              <input
                                type="date"
                                value={m.actualStartDate ? m.actualStartDate.slice(0, 10) : ''}
                                onChange={e => handleActualDateChange(mId, 'actualStartDate', e.target.value)}
                                title={m.actualStartDate ? 'Change actual start date' : 'Add actual start date'}
                                className={actualDateCls(!!m.actualStartDate)}
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-10 flex-shrink-0 text-xs text-gray-400">End</span>
                              <input
                                type="date"
                                value={m.actualEndDate ? m.actualEndDate.slice(0, 10) : ''}
                                onChange={e => handleActualDateChange(mId, 'actualEndDate', e.target.value)}
                                title={m.actualEndDate ? 'Change actual end date' : 'Add actual end date'}
                                className={actualDateCls(!!m.actualEndDate)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Meta strip — weight · sub count · progress */}
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap sm:pl-11">
                        {canManage
                          ? isEditingWeight
                            ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  value={weightInputValue}
                                  onChange={e => setWeightInputValue(e.target.value)}
                                  onBlur={() => handleWeightSave(mId)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleWeightSave(mId);
                                    if (e.key === 'Escape') setEditingWeightId(null);
                                  }}
                                  placeholder={`${m.minPct ?? 0}–${m.maxPct ?? 100}`}
                                  autoFocus
                                  className="w-20 px-2 py-1 text-xs border border-emerald-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
                                />
                                <span className="text-xs text-gray-400">% weight</span>
                              </div>
                            )
                            : m.weightPercentage != null
                              ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-xs text-gray-500">{m.weightPercentage}% weight</span>
                                  <button
                                    onClick={() => startEditWeight(m)}
                                    className="p-1 rounded text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                    title="Edit weight"
                                  >
                                    <HiOutlinePencil className="w-3 h-3" />
                                  </button>
                                </span>
                              )
                              : (
                                <button
                                  onClick={() => startEditWeight(m)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 border border-dashed border-gray-300 rounded-md text-xs text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                                  title={`Set weight percentage (${m.minPct ?? 0}–${m.maxPct ?? 100}%)`}
                                >
                                  <HiOutlinePencil className="w-3 h-3" />
                                  Set weight
                                </button>
                              )
                          : m.weightPercentage != null
                            ? <span className="text-xs text-gray-500">{m.weightPercentage}% weight</span>
                            : null
                        }

                        {(canManage || m.weightPercentage != null) && <span className="text-gray-200">·</span>}
                        <span className="text-xs text-gray-500">
                          {subs.length} sub-milestone{subs.length !== 1 ? 's' : ''}
                        </span>

                        <div className="flex items-center gap-2 ml-auto">
                          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Progress</span>
                          <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                              style={{ width: `${mProgress}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-9 text-right">{mProgress}%</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Per-card inline edit panel ───────────────────── */}
                    {editingCardId === mId && (
                      <div className="border-t border-emerald-100 bg-emerald-50/30 px-5 py-4">
                        <p className="text-xs font-semibold text-emerald-700 mb-3 uppercase tracking-wide">Edit Milestone</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
                            <input value={form.name} onChange={e => setF('name', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Accountable Person</label>
                            <select value={form.accountableUserId} onChange={e => setF('accountableUserId', e.target.value)} className={inputCls}>
                              <option value="">Unassigned</option>
                              {users.map(u => <option key={u._id||u.id} value={u._id||u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                            <select value={form.status} onChange={e => setF('status', e.target.value)} className={inputCls}>
                              {milestoneStatuses.map(s => {
                                const val = resolveStatusVal(s.value ?? s.name ?? s);
                                if (!val) return null;
                                return <option key={val} value={val}>{s.name ?? s}</option>;
                              })}
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                            <textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={2} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">
                              Completion — <span className="text-emerald-600 font-semibold">{form.completionPercentage}%</span>
                            </label>
                            <input
                              type="range" min="0" max="100" step="5"
                              value={form.completionPercentage}
                              onChange={e => setF('completionPercentage', Number(e.target.value))}
                              disabled={subs.length > 0}
                              className="w-full accent-emerald-600 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            {subs.length > 0 && (
                              <p className="text-[11px] text-gray-400 mt-1">Calculated from its sub-milestones</p>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-3">
                          <button onClick={() => setEditingCardId(null)} className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                          <button onClick={async () => { const ok = await handleSave(); if (ok) setEditingCardId(null); }} disabled={saving} className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save Changes'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Sub-milestones table ──────────────────────────── */}
                    {subs.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50/60 border-b border-gray-100">
                            <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                              <th className="pl-6 pr-3 py-2.5 text-left w-10">#</th>
                              <th className="px-3 py-2.5 text-left">Sub-Milestone</th>
                              <th className="px-3 py-2.5 text-left">Accountable</th>
                              <th className="px-3 py-2.5 text-left">Planned Dates</th>
                              <th className="px-3 py-2.5 text-left">Actual Dates</th>
                              <th className="px-3 py-2.5 text-left">Status</th>
                              <th className="px-3 py-2.5 text-left">Progress</th>
                              <th className="px-3 py-2.5 text-right pr-6">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {subs.map((sm, idx) => {
                              const smId = sm._id || sm.id;
                              const smStatus = normalizeStatus(sm.status);
                              const smProgress = Math.round(sm.completionPercentage || 0);
                              const isDelayed = sm.plannedEndDate && sm.plannedEndDate.slice(0, 10) < today && smStatus !== 'completed';
                              const canLogActual = ['in_progress', 'completed'].includes(smStatus);
                              const smDueInDays = sm.plannedEndDate
                                ? Math.ceil((new Date(sm.plannedEndDate) - new Date()) / 86400000)
                                : null;
                              const smDueBadge = smDueInDays !== null && smDueInDays <= 7 && smDueInDays >= 0
                                && (sm.completionPercentage ?? 0) < 80;
                              return (
                                <Fragment key={smId}>
                                <tr
                                  className={isDelayed ? 'bg-red-50/60 transition-colors' : 'hover:bg-gray-50/60 transition-colors'}
                                >
                                  <td className="pl-6 pr-3 py-3 text-gray-300 text-xs align-top">{idx + 1}</td>

                                  {/* Name */}
                                  <td className="px-3 py-3 align-top">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-medium text-gray-800 text-sm">{sm.name}</span>
                                      {smDueBadge && (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                                          <HiOutlineExclamation className="w-2.5 h-2.5" />
                                          {smDueInDays === 0 ? 'Due today' : `${smDueInDays}d`}
                                        </span>
                                      )}
                                      {isDelayed && (
                                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-medium" title="Overdue">
                                          <HiOutlineExclamation className="w-2.5 h-2.5" /> Overdue
                                        </span>
                                      )}
                                    </div>
                                    {sm.weightPercentage != null && (
                                      <p className="text-[11px] text-gray-400 mt-0.5" title="Equal share of the milestone, set automatically">
                                        {m.weightPercentage != null
                                          ? `${Math.round(Number(m.weightPercentage) * Number(sm.weightPercentage)) / 100}% of project · `
                                          : ''}
                                        {Number(sm.weightPercentage)}% of milestone
                                      </p>
                                    )}
                                  </td>

                                  {/* Accountable */}
                                  <td className="px-3 py-3 text-gray-500 text-xs align-top">
                                    {sm.accountableUser?.name || <span className="text-gray-300">Unassigned</span>}
                                  </td>

                                  {/* Planned dates (merged) */}
                                  <td className={`px-3 py-3 align-top ${isPlannedUnlocked(sm) ? 'bg-amber-50/70' : ''}`}>
                                    {/* Admin lock control for this sub-milestone */}
                                    {isAdmin && (sm.plannedStartDate || sm.plannedEndDate) && (
                                      <div className="mb-1 flex items-center gap-1.5">
                                        {isPlannedUnlocked(sm) && (
                                          <span className="text-[10px] font-semibold text-amber-700">Unlocked</span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => isPlannedUnlocked(sm) ? handleLockPlanned(smId) : handleUnlockPlanned(smId)}
                                          className={`text-[10px] font-medium rounded px-1.5 py-0.5 border border-transparent transition-colors ${
                                            isPlannedUnlocked(sm)
                                              ? 'text-gray-500 hover:text-gray-800 hover:border-gray-200 hover:bg-white'
                                              : 'text-blue-600 hover:text-blue-800 hover:border-blue-200 hover:bg-white'}`}
                                          title={isPlannedUnlocked(sm) ? 'Re-lock without changing' : 'Unlock so a manager can reset the planned dates once'}
                                        >
                                          {isPlannedUnlocked(sm) ? 'Lock' : 'Unlock'}
                                        </button>
                                      </div>
                                    )}
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-7 flex-shrink-0 text-[10px] uppercase tracking-wide text-gray-300">St</span>
                                        {canManage ? (
                                          <>
                                            {sm.plannedStartDate && isPlannedUnlocked(sm) ? (
                                              <input
                                                type="date"
                                                defaultValue={sm.plannedStartDate.slice(0, 10)}
                                                title="Unlocked — pick a new planned start (you will be asked for a reason)"
                                                onChange={e => e.target.value && e.target.value !== sm.plannedStartDate.slice(0, 10) && handleActualDateChange(smId, 'plannedStartDate', e.target.value)}
                                                className="block text-[11px] border border-amber-400 rounded px-1.5 py-0.5 text-gray-700 bg-white focus:outline-none focus:border-amber-500 w-28"
                                              />
                                            ) : sm.plannedStartDate ? (
                                              <span
                                                className="inline-flex items-center gap-0.5 text-xs text-gray-600"
                                                title="Planned start date is locked — ask an admin to unlock it"
                                              >
                                                <LockIcon /> {fmtDate(sm.plannedStartDate)}
                                              </span>
                                            ) : (
                                              <input
                                                type="date"
                                                title="Set planned start date (can only be set once)"
                                                onChange={e => e.target.value && handlePlannedDateSave(smId, e.target.value, null)}
                                                className="block text-[11px] border border-dashed border-gray-300 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:border-emerald-400 w-28"
                                              />
                                            )}
                                          </>
                                        ) : (
                                          sm.plannedStartDate ? <span className="text-xs text-gray-600">{fmtDate(sm.plannedStartDate)}</span> : <span className="text-gray-400">—</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-7 flex-shrink-0 text-[10px] uppercase tracking-wide text-gray-300">En</span>
                                        {canManage ? (
                                          <>
                                            {sm.plannedEndDate && isPlannedUnlocked(sm) ? (
                                              <input
                                                type="date"
                                                defaultValue={sm.plannedEndDate.slice(0, 10)}
                                                min={sm.plannedStartDate ? sm.plannedStartDate.slice(0, 10) : undefined}
                                                title="Unlocked — pick a new planned end (you will be asked for a reason)"
                                                onChange={e => e.target.value && e.target.value !== sm.plannedEndDate.slice(0, 10) && handleActualDateChange(smId, 'plannedEndDate', e.target.value)}
                                                className="block text-[11px] border border-amber-400 rounded px-1.5 py-0.5 text-gray-700 bg-white focus:outline-none focus:border-amber-500 w-28"
                                              />
                                            ) : sm.plannedEndDate ? (
                                              <span
                                                className={`inline-flex items-center gap-0.5 text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-600'}`}
                                                title="Planned end date is locked — ask an admin to unlock it"
                                              >
                                                <LockIcon className={`w-3 h-3 flex-shrink-0 ${isDelayed ? 'text-red-400' : 'text-gray-400'}`} />
                                                {fmtDate(sm.plannedEndDate)}
                                              </span>
                                            ) : (
                                              <input
                                                type="date"
                                                min={sm.plannedStartDate ? sm.plannedStartDate.slice(0, 10) : undefined}
                                                title="Set planned end date (can only be set once)"
                                                onChange={e => e.target.value && handlePlannedDateSave(smId, null, e.target.value)}
                                                className="block text-[11px] border border-dashed border-gray-300 rounded px-1.5 py-0.5 text-gray-600 focus:outline-none focus:border-emerald-400 w-28"
                                              />
                                            )}
                                          </>
                                        ) : (
                                          sm.plannedEndDate ? <span className={`text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{fmtDate(sm.plannedEndDate)}</span> : <span className="text-gray-400">—</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Actual dates (merged) — gated by canLogActual */}
                                  <td className="px-3 py-3 align-top">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-7 flex-shrink-0 text-[10px] uppercase tracking-wide text-gray-300">St</span>
                                        {canLogActual ? (
                                          <input
                                            type="date"
                                            value={sm.actualStartDate ? sm.actualStartDate.slice(0, 10) : ''}
                                            onChange={e => handleActualDateChange(smId, 'actualStartDate', e.target.value)}
                                            title={sm.actualStartDate ? 'Change actual start date' : 'Add actual start date'}
                                            className={`block ${actualDateCls(!!sm.actualStartDate, 'w-28 px-1.5 py-0.5 text-[11px]')}`}
                                          />
                                        ) : (
                                          <span className="text-xs text-gray-500">{sm.actualStartDate ? fmtDate(sm.actualStartDate) : '—'}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-7 flex-shrink-0 text-[10px] uppercase tracking-wide text-gray-300">En</span>
                                        {canLogActual ? (
                                          <input
                                            type="date"
                                            value={sm.actualEndDate ? sm.actualEndDate.slice(0, 10) : ''}
                                            onChange={e => handleActualDateChange(smId, 'actualEndDate', e.target.value)}
                                            title={sm.actualEndDate ? 'Change actual end date' : 'Add actual end date'}
                                            className={`block ${actualDateCls(!!sm.actualEndDate, 'w-28 px-1.5 py-0.5 text-[11px]')}`}
                                          />
                                        ) : (
                                          <span className="text-xs text-gray-500">{sm.actualEndDate ? fmtDate(sm.actualEndDate) : '—'}</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Status */}
                                  <td className="px-3 py-3 align-top">
                                    {canManage ? (
                                      <div className="relative inline-block">
                                        <select
                                          value={smStatus || 'not_started'}
                                          onChange={e => handleStatusChange(smId, e.target.value)}
                                          className={statusPillCls(STATUS_COLORS[smStatus])}
                                          title="Change sub-milestone status"
                                        >
                                          {subMilestoneStatuses.map(s => {
                                            const val = resolveStatusVal(s.value ?? s.name ?? s);
                                            if (!val) return null;
                                            const label = s.name ?? s;
                                            return <option key={val} value={val}>{label}</option>;
                                          })}
                                        </select>
                                        <CaretIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
                                      </div>
                                    ) : (
                                      <span className={`text-xs px-3 py-1 rounded-full font-semibold capitalize ${STATUS_COLORS[smStatus] || 'bg-gray-100 text-gray-600'}`}>
                                        {fmtLabel(smStatus)}
                                      </span>
                                    )}
                                  </td>

                                  {/* Progress */}
                                  <td className="px-3 py-3 align-top">
                                    {canManage ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="range" min="0" max="100" step="5"
                                          defaultValue={sm.completionPercentage || 0}
                                          onPointerUp={e => handleProgressChange(smId, e.target.value)}
                                          onChange={e => {}}
                                          className="w-20 accent-emerald-600 cursor-pointer"
                                          title="Drag to update progress"
                                        />
                                        <span className="text-xs font-medium text-gray-600 w-9 text-right">{smProgress}%</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${smProgress}%` }} />
                                        </div>
                                        <span className="text-xs font-medium text-gray-600 w-9 text-right">{smProgress}%</span>
                                      </div>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="px-3 py-3 pr-6 align-top">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => openDocModal(sm)}
                                        className="p-1.5 rounded-md text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                                        title="Sub-milestone documents"
                                      >
                                        <HiOutlinePaperClip className="w-3.5 h-3.5" />
                                      </button>
                                      {canManage && (
                                        <button
                                          onClick={() => { setEditingSubId(editingSubId === smId ? null : smId); setSubEditForm({ name: sm.name, accountableUserId: sm.accountableUser?._id || sm.accountableUser?.id || '', status: normalizeStatus(sm.status) || 'not_started', completionPercentage: sm.completionPercentage || 0 }); }}
                                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                          title="Edit sub-milestone"
                                        >
                                          <HiOutlinePencil className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      {canManage && (
                                        <button
                                          onClick={() => handleDelete(smId)}
                                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                          title="Delete sub-milestone"
                                        >
                                          <HiOutlineTrash className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {editingSubId === smId && (
                                  <tr className="bg-blue-50/40 border-b border-blue-100">
                                    <td colSpan={8} className="px-8 py-4">
                                      <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-3">Edit Sub-milestone</p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                        {/* Name */}
                                        <div className="md:col-span-2">
                                          <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
                                          <input
                                            value={subEditForm.name}
                                            onChange={e => setSubEditForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="Sub-milestone name"
                                            className={inputCls}
                                          />
                                        </div>
                                        {/* Accountable */}
                                        <div>
                                          <label className="text-xs font-medium text-gray-600 block mb-1">Accountable Person</label>
                                          <select
                                            value={subEditForm.accountableUserId}
                                            onChange={e => setSubEditForm(f => ({ ...f, accountableUserId: e.target.value }))}
                                            className={inputCls}
                                          >
                                            <option value="">Unassigned</option>
                                            {users.map(u => <option key={u._id||u.id} value={u._id||u.id}>{u.name}</option>)}
                                          </select>
                                        </div>
                                        {/* Status */}
                                        <div>
                                          <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                                          <select
                                            value={subEditForm.status}
                                            onChange={e => setSubEditForm(f => ({ ...f, status: e.target.value }))}
                                            className={inputCls}
                                          >
                                            {subMilestoneStatuses.map(s => {
                                              const val = resolveStatusVal(s.value ?? s.name ?? s);
                                              if (!val) return null;
                                              return <option key={val} value={val}>{s.name ?? s}</option>;
                                            })}
                                          </select>
                                        </div>
                                        {/* Completion % */}
                                        <div className="sm:col-span-2 md:col-span-4">
                                          <label className="text-xs font-medium text-gray-600 block mb-1">
                                            Completion — <span className="text-emerald-600 font-semibold">{subEditForm.completionPercentage}%</span>
                                          </label>
                                          <input
                                            type="range" min="0" max="100" step="5"
                                            value={subEditForm.completionPercentage}
                                            onChange={e => setSubEditForm(f => ({ ...f, completionPercentage: Number(e.target.value) }))}
                                            className="w-full accent-emerald-600"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2 mt-3">
                                        <button onClick={() => setEditingSubId(null)} className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                                        <button onClick={() => handleSubEdit(smId)} className="px-4 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Save Changes</button>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-6 py-6 text-center">
                        <p className="text-xs text-gray-400">No sub-milestones yet.</p>
                        {canManage && showSubFormFor !== mId && (
                          <button
                            onClick={() => openSubForm(mId)}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg border border-dashed border-emerald-300 transition-colors"
                          >
                            <HiOutlinePlus className="w-3.5 h-3.5" /> Add Sub-milestone
                          </button>
                        )}
                      </div>
                    )}

                    {/* Inline sub-milestone creation form */}
                    {showSubFormFor === mId && (
                      <div className="border-t border-emerald-100 bg-emerald-50/30 px-5 py-4">
                        <p className="text-xs font-semibold text-emerald-700 mb-3 uppercase tracking-wide">
                          New Sub-milestone
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="sm:col-span-2 md:col-span-3">
                            <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
                            <input
                              value={subForm.name}
                              onChange={e => setSF('name', e.target.value)}
                              placeholder="Sub-milestone name"
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Planned Start Date</label>
                            <input type="date" value={subForm.plannedStartDate} onChange={e => setSF('plannedStartDate', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Planned End Date</label>
                            <input type="date" value={subForm.plannedEndDate} onChange={e => setSF('plannedEndDate', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Accountable Person</label>
                            <select value={subForm.accountableUserId} onChange={e => setSF('accountableUserId', e.target.value)} className={inputCls}>
                              <option value="">Select person</option>
                              {users.map(u => <option key={u._id || u.id} value={u._id || u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Weight</label>
                            {/* Always an equal split of the milestone — shown, never typed */}
                            <p className="text-xs text-gray-500 mt-2">
                              {Math.round(10000 / (subs.length + 1)) / 100}% of milestone
                              {m.weightPercentage != null
                                ? ` · ${Math.round(Number(m.weightPercentage) * 100 / (subs.length + 1)) / 100}% of project`
                                : ''}
                              <span className="block text-[11px] text-gray-400">Split equally across {subs.length + 1} sub-milestone{subs.length ? 's' : ''}</span>
                            </p>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                            <select value={subForm.status} onChange={e => setSF('status', e.target.value)} className={inputCls}>
                              {subMilestoneStatuses.map(s => {
                                const val = resolveStatusVal(s.value ?? s.name ?? s);
                                if (!val) return null;
                                const label = s.name ?? s;
                                return <option key={val} value={val}>{label}</option>;
                              })}
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                          <button
                            onClick={() => setShowSubFormFor(null)}
                            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleCreateSubMilestone(mId)}
                            disabled={savingSub}
                            className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {savingSub ? 'Saving...' : 'Add Sub-milestone'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Card footer — Add Sub-milestone trigger */}
                    {canManage && showSubFormFor !== mId && subs.length > 0 && (
                      <div className="px-5 pb-4 pt-0 border-t border-gray-100 bg-gray-50/40">
                        <button
                          onClick={() => openSubForm(mId)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg border border-dashed border-emerald-300 transition-colors mt-3"
                        >
                          <HiOutlinePlus className="w-3.5 h-3.5" />
                          Add Sub-milestone
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              FLAT (non-default) MILESTONES — backward-compat table
          ════════════════════════════════════════════════════ */}
          {flatMilestones.length > 0 && (
            <div className="space-y-2">
              {defaultMilestones.length > 0 && (
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Other Milestones</h2>
              )}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">Milestone</th>
                      <th className="px-5 py-3 text-left">Accountable</th>
                      <th className="px-5 py-3 text-left">Planned Start</th>
                      <th className="px-5 py-3 text-left">Planned End</th>
                      <th className="px-5 py-3 text-left">Actual Start</th>
                      <th className="px-5 py-3 text-left">Actual End</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-left">Progress</th>
                      <th className="px-5 py-3 text-left">Docs</th>
                      {canAddTopLevel && <th className="px-5 py-3 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {flatMilestones.map((m, i) => {
                      const mId = m._id || m.id;
                      const isDelayed = m.plannedEndDate && m.plannedEndDate.slice(0, 10) < today && normalizeStatus(m.status) !== 'completed';
                      return (
                        <tr key={mId} className={isDelayed ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900 flex items-center flex-wrap gap-1">
                              {m.name}
                              {(() => {
                                if (!m.plannedEndDate) return null;
                                const daysLeft = Math.ceil((new Date(m.plannedEndDate) - new Date()) / 86400000);
                                if (daysLeft <= 7 && daysLeft >= 0 && (m.completionPercentage ?? 0) < 80) {
                                  return (
                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                                      ⚠ {daysLeft === 0 ? 'Due today' : `${daysLeft}d`}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </p>
                            {m.description && <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>}
                          </td>
                          <td className="px-5 py-3 text-gray-600">{m.accountableUser?.name || '—'}</td>
                          <td className="px-5 py-3 text-gray-500 text-xs">
                            {canManage ? (
                              <>
                                {m.plannedStartDate ? (
                                  <span className="text-xs text-gray-500 flex items-center gap-1" title="Planned start date is locked — it can only be set once">
                                    <LockIcon /> {fmtDate(m.plannedStartDate)}
                                  </span>
                                ) : (
                                  <input
                                    type="date"
                                    title="Set planned start date (can only be set once)"
                                    onChange={e => e.target.value && handlePlannedDateSave(mId, e.target.value, null)}
                                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                )}
                              </>
                            ) : (
                              m.plannedStartDate ? <span className="text-xs text-gray-500">{fmtDate(m.plannedStartDate)}</span> : <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className={`px-5 py-3 text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {canManage ? (
                              <>
                                {m.plannedEndDate ? (
                                  <span className={`text-xs flex items-center gap-1 ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-500'}`} title="Planned end date is locked — it can only be set once">
                                    <LockIcon className={`w-3 h-3 flex-shrink-0 ${isDelayed ? 'text-red-400' : 'text-gray-400'}`} /> {fmtDate(m.plannedEndDate)}
                                    {isDelayed && <span className="text-red-500 font-bold" title="Overdue">⚠</span>}
                                  </span>
                                ) : (
                                  <input
                                    type="date"
                                    min={m.plannedStartDate ? m.plannedStartDate.slice(0, 10) : undefined}
                                    title="Set planned end date (can only be set once)"
                                    onChange={e => e.target.value && handlePlannedDateSave(mId, null, e.target.value)}
                                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                )}
                              </>
                            ) : (
                              m.plannedEndDate ? <span className={`text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{fmtDate(m.plannedEndDate)}{isDelayed && <span className="text-red-500 font-bold ml-1" title="Overdue">⚠</span>}</span> : <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400">
                            <input
                              type="date"
                              value={m.actualStartDate ? m.actualStartDate.slice(0, 10) : ''}
                              onChange={e => handleActualDateChange(mId, 'actualStartDate', e.target.value)}
                              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-400">
                            <input
                              type="date"
                              value={m.actualEndDate ? m.actualEndDate.slice(0, 10) : ''}
                              onChange={e => handleActualDateChange(mId, 'actualEndDate', e.target.value)}
                              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            />
                          </td>
                          <td className="px-5 py-3">
                            {canManage ? (
                              <div className="relative inline-block">
                                <select
                                  value={normalizeStatus(m.status)}
                                  onChange={e => handleStatusChange(mId, e.target.value)}
                                  className={statusPillCls(STATUS_COLORS[normalizeStatus(m.status)])}
                                >
                                  {milestoneStatuses.map(s => {
                                    const val = resolveStatusVal(s.value ?? s.name ?? s);
                                    if (!val) return null;
                                    const label = s.name ?? s;
                                    return <option key={val} value={val}>{label}</option>;
                                  })}
                                </select>
                                <CaretIcon className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 opacity-60" />
                              </div>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[normalizeStatus(m.status)] || 'bg-gray-100'}`}>
                                {fmtLabel(normalizeStatus(m.status))}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {canManage && !(m.subMilestones || []).length ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="range" min="0" max="100" step="5"
                                  value={m.completionPercentage || 0}
                                  onChange={e => handleProgressChange(mId, e.target.value)}
                                  className="w-20"
                                />
                                <span className="text-xs text-gray-500 w-8">{Math.round(m.completionPercentage || 0)}%</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-gray-200 rounded-full">
                                  <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${Math.round(m.completionPercentage || 0)}%` }} />
                                </div>
                                <span className="text-xs text-gray-500">{Math.round(m.completionPercentage || 0)}%</span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => openDocModal(m)}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Manage milestone documents"
                            >
                              <HiOutlinePaperClip className="w-3.5 h-3.5" /> Docs
                            </button>
                          </td>
                          {canAddTopLevel && (
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <button onClick={() => { setForm({ name: m.name, description: m.description || '', plannedStartDate: m.plannedStartDate ? m.plannedStartDate.slice(0, 10) : '', plannedEndDate: m.plannedEndDate ? m.plannedEndDate.slice(0, 10) : '', accountableUserId: m.accountableUserId || '', status: m.status, completionPercentage: m.completionPercentage || 0 }); setEditingId(mId); setShowForm(true); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors">
                                  <HiOutlinePencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDelete(mId)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                                  <HiOutlineTrash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {milestones.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <HiOutlineFlag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No milestones yet</p>
              {canCreateTopLevel && (
                <button onClick={openCreate} className="mt-3 text-sm text-emerald-600 hover:underline">
                  Add the first milestone
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ══ Milestone Documents Modal ══════════════════════════════════════ */}
      {docModalMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <HiOutlinePaperClip className="w-4 h-4 text-emerald-600" />
                  Documents
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{docModalMilestone.name}</p>
              </div>
              <button onClick={() => setDocModalMilestone(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <HiOutlineX className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {canManage && (
                <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload Document</p>
                  <div className="flex gap-3 flex-wrap items-end">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Category</label>
                      <select
                        value={mDocCategory}
                        onChange={e => setMDocCategory(e.target.value)}
                        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    {mDocCategory === 'Others' && (
                      <div className="flex-1 min-w-full">
                        <label className="text-xs text-gray-500 block mb-1">Specify Category</label>
                        <input
                          value={mDocCategoryOther}
                          onChange={e => setMDocCategoryOther(e.target.value)}
                          placeholder="Enter category name"
                          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-40">
                      <label className="text-xs text-gray-500 block mb-1">File</label>
                      <input
                        type="file"
                        onChange={e => setMDocFile(e.target.files[0] || null)}
                        className="block w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                      />
                    </div>
                    <button
                      onClick={handleMDocUpload}
                      disabled={mDocUploading || !mDocFile}
                      className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {mDocUploading ? 'Uploading…' : 'Upload'}
                    </button>
                  </div>
                </div>
              )}

              {mDocLoading ? (
                <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
              ) : milestoneDocs.length === 0 ? (
                <div className="text-center py-8">
                  <HiOutlineDocumentText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No documents uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {milestoneDocs.map(doc => {
                    const docId = doc._id || doc.id;
                    return (
                      <div key={docId} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 group">
                        <HiOutlineDocumentText className="w-7 h-7 text-gray-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 flex-wrap">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[doc.category] || 'bg-gray-100 text-gray-600'}`}>
                              {doc.category}
                            </span>
                            <span>{formatBytes(doc.sizeBytes)}</span>
                            <span>{doc.uploadedBy?.name || '—'}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={downloadMilestoneDocumentUrl(id, docModalMilestone.id, docId)}
                            download
                            className="p-1.5 hover:bg-emerald-50 rounded text-gray-400 hover:text-emerald-600 transition-colors"
                            title="Download"
                          >
                            <HiOutlineDownload className="w-4 h-4" />
                          </a>
                          {canManage && (
                            <button
                              onClick={() => handleMDocDelete(docId)}
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

            <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setDocModalMilestone(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Date Change Reason Modal ══════════════════════════════════════ */}
      {dateChangeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              {dateChangeModal.field.startsWith('planned') ? 'Reason for Re-baselining' : 'Reason for Date Change'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {dateChangeModal.field.startsWith('planned')
                ? 'You are changing a planned (baseline) date. The dates will lock again after this save. This reason is written to the audit log.'
                : 'Please provide a reason for changing this date.'}
            </p>
            <textarea
              value={dateChangeReason}
              onChange={e => setDateChangeReason(e.target.value)}
              placeholder="e.g. Client requested extension, dependency delayed..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDateChangeModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancel
              </button>
              <button
                onClick={confirmDateChange}
                disabled={!dateChangeReason.trim()}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Import Modal ═══════════════════════════════════════════════════ */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Import Milestones</h2>
              <button onClick={() => setShowImport(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <HiOutlineX className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleDownloadTemplate} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
                  <HiOutlineDocumentText className="w-4 h-4" />
                  Download Template
                </button>
                <span className="text-gray-400 text-xs">— fill it in, then upload below</span>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => { setImportFile(e.target.files[0] || null); setImportPreview(null); }}
                  className="hidden"
                  id="import-file"
                />
                <label htmlFor="import-file" className="cursor-pointer">
                  <HiOutlineUpload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">{importFile ? importFile.name : 'Click to select .xlsx file'}</p>
                </label>
              </div>
              {importFile && !importPreview && (
                <button type="button" onClick={handleValidateImport} disabled={importing}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {importing ? 'Validating...' : 'Validate File'}
                </button>
              )}
              {importPreview && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <HiOutlineCheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-gray-700">{importPreview.rows.filter(r => r.valid).length} valid rows</span>
                    {importPreview.errorCount > 0 && <span className="text-red-600 ml-2">· {importPreview.errorCount} errors</span>}
                  </div>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-60 overflow-y-auto text-xs">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-500">Row</th>
                          <th className="px-3 py-2 text-left text-gray-500">Project</th>
                          <th className="px-3 py-2 text-left text-gray-500">Milestone</th>
                          <th className="px-3 py-2 text-left text-gray-500">Status</th>
                          <th className="px-3 py-2 text-left text-gray-500">Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importPreview.rows.map(row => (
                          <tr key={row.rowNumber} className={row.valid ? '' : 'bg-red-50'}>
                            <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                            <td className="px-3 py-2 font-medium text-gray-800">{row.projectName}</td>
                            <td className="px-3 py-2 text-gray-700">{row.name}</td>
                            <td className="px-3 py-2 text-gray-600">{row.status}</td>
                            <td className="px-3 py-2 text-red-600">{row.errors?.join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            {importPreview && importPreview.rows.filter(r => r.valid).length > 0 && (
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
                <button type="button" onClick={() => setShowImport(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleCommitImport} disabled={importing}
                  className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                  {importing ? 'Importing...' : `Import ${importPreview.rows.filter(r => r.valid).length} Rows`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Import Result Modal ════════════════════════════════════════════ */}
      {showImportResult && importResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Results</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                <span className="text-2xl font-bold text-emerald-600">{importResult.created}</span>
                <span className="text-sm text-emerald-700">milestones imported successfully</span>
              </div>
              {importResult.skipped > 0 && (
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                  <span className="text-2xl font-bold text-amber-600">{importResult.skipped}</span>
                  <span className="text-sm text-amber-700">rows skipped (validation errors)</span>
                </div>
              )}
              {importResult.errors?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Skipped rows:</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {importResult.errors.map((e, i) => (
                      <div key={i} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                        Row {e.row}: {e.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowImportResult(false)}
              className="mt-4 w-full py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
