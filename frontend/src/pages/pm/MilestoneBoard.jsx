import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
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
  HiOutlineX, HiOutlineCheckCircle,
} from 'react-icons/hi';

// ── Constants ────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'cancelled'];
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
  name: '', description: '', startDate: '', endDate: '',
  accountableUserId: '', status: 'not_started', completionPercentage: 0,
};
const EMPTY_SUB_FORM = {
  name: '', startDate: '', endDate: '',
  accountableUserId: '', weightPercentage: '', status: 'not_started',
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

// ── Component ────────────────────────────────────────────────────────────────
export default function MilestoneBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);

  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Flat milestone create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

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

  // Document modal
  const [docModalMilestone, setDocModalMilestone] = useState(null);
  const [milestoneDocs, setMilestoneDocs] = useState([]);
  const [mDocLoading, setMDocLoading] = useState(false);
  const [mDocFile, setMDocFile] = useState(null);
  const [mDocCategory, setMDocCategory] = useState('SOW / Client Contracts');
  const [mDocCategoryOther, setMDocCategoryOther] = useState('');
  const [mDocUploading, setMDocUploading] = useState(false);

  // Derived
  const canManage = MANAGER_ROLES.includes(user?.role) ||
    (project && String(project.managerId) === String(user?._id || user?.id));
  // Only admin can create / delete / import TOP-LEVEL milestones.
  // Default milestone templates are seeded by admin only.
  const isAdmin       = user?.role === 'admin';
  const canAddTopLevel = isAdmin;
  const defaultMilestones = milestones.filter(isDefault);
  const flatMilestones = milestones.filter(m => !isDefault(m));
  const totalWeight = defaultMilestones.reduce(
    (sum, m) => sum + (m.weightPercentage != null ? Number(m.weightPercentage) : 0), 0,
  );
  const weightComplete = defaultMilestones.length > 0 && defaultMilestones.every(m => m.weightPercentage != null);
  const weightValid = weightComplete && Math.abs(totalWeight - 100) < 0.01;

  const today = new Date().toISOString().slice(0, 10);
  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

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

  // ── Flat milestone handlers ─────────────────────────────────────────────
  const setF = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };
  const openEdit = (m) => {
    setForm({
      name: m.name,
      description: m.description || '',
      startDate: m.startDate ? m.startDate.slice(0, 10) : '',
      endDate: m.endDate ? m.endDate.slice(0, 10) : '',
      accountableUserId: m.accountableUserId || '',
      status: m.status,
      completionPercentage: m.completionPercentage || 0,
    });
    setEditingId(m._id || m.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Milestone name is required');
    setSaving(true);
    try {
      if (editingId) {
        await updateMilestoneApi(id, editingId, form);
        toast.success('Milestone updated');
      } else {
        await createMilestoneApi(id, form);
        toast.success('Milestone created');
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
    } finally { setSaving(false); }
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
    } catch { toast.error('Failed to update status'); }
  };

  const handleProgressChange = async (milestoneId, pct) => {
    try {
      await updateMilestoneProgressApi(id, milestoneId, Number(pct));
      setMilestones(prev => prev.map(m => {
        if ((m._id || m.id) === milestoneId) return { ...m, completionPercentage: Number(pct) };
        return {
          ...m,
          subMilestones: (m.subMilestones || []).map(sm =>
            (sm._id || sm.id) === milestoneId ? { ...sm, completionPercentage: Number(pct) } : sm,
          ),
        };
      }));
    } catch { toast.error('Failed to update progress'); }
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
    try {
      await updateMilestoneApi(id, milestoneId, { weightPercentage: val });
      setMilestones(prev => prev.map(m =>
        (m._id || m.id) === milestoneId ? { ...m, weightPercentage: val } : m,
      ));
      toast.success('Weight updated');
    } catch { toast.error('Failed to update weight'); }
    finally { setEditingWeightId(null); }
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
      const payload = {
        ...subForm,
        weightPercentage: subForm.weightPercentage !== '' ? Number(subForm.weightPercentage) : undefined,
      };
      await createSubMilestoneApi(id, parentId, payload);
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
      await commitMilestoneImportApi(validRows);
      toast.success(`${validRows.length} milestone(s) imported`);
      setShowImport(false);
      setImportPreview(null);
      setImportFile(null);
      load();
    } catch { toast.error('Import failed'); }
    finally { setImporting(false); }
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
          {canAddTopLevel && (
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
                onClick={() => navigate(`/pm/projects/${id}/gantt`)}
                className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Gantt View
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
      {showForm && (
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
              <label className="text-xs font-medium text-gray-600 block mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setF('startDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">End Date (Deadline)</label>
              <input type="date" value={form.endDate} onChange={e => setF('endDate', e.target.value)} className={inputCls} />
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
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtLabel(s)}</option>)}
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

                return (
                  <div key={mId} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

                    {/* Card header */}
                    <div className="flex items-start gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
                      <HiOutlineFlag className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{m.name}</span>
                          <span className="px-1.5 py-0.5 text-xs rounded font-medium bg-emerald-100 text-emerald-700">
                            Default
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-lg">{m.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                          {m.startDate && <span>Start: {fmtDate(m.startDate)}</span>}
                          {m.endDate && <span>Due: {fmtDate(m.endDate)}</span>}
                          <span>{subs.length} sub-milestone{subs.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>

                      {/* Weight + Docs */}
                      <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
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
                                  className="w-24 px-2 py-1 text-sm border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center"
                                />
                                <span className="text-sm text-gray-400">%</span>
                              </div>
                            )
                            : m.weightPercentage != null
                              ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm font-semibold text-gray-700">{m.weightPercentage}%</span>
                                  <button
                                    onClick={() => startEditWeight(m)}
                                    className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition-colors"
                                    title="Edit weight"
                                  >
                                    <HiOutlinePencil className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )
                              : (
                                <button
                                  onClick={() => startEditWeight(m)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                                  title="Set weight percentage"
                                >
                                  <HiOutlinePencil className="w-3 h-3" />
                                  Set % ({m.minPct ?? 0}–{m.maxPct ?? 100})
                                </button>
                              )
                          : m.weightPercentage != null
                            ? <span className="text-sm font-semibold text-gray-700">{m.weightPercentage}%</span>
                            : null
                        }

                        <button
                          onClick={() => openDocModal(m)}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Milestone documents"
                        >
                          <HiOutlinePaperClip className="w-3.5 h-3.5" /> Docs
                        </button>
                      </div>
                    </div>

                    {/* Sub-milestones table */}
                    {subs.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50/60 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                            <tr>
                              <th className="pl-8 pr-3 py-2 text-left">#</th>
                              <th className="px-3 py-2 text-left">Sub-milestone</th>
                              <th className="px-3 py-2 text-left">Accountable</th>
                              <th className="px-3 py-2 text-left">Start</th>
                              <th className="px-3 py-2 text-left">Due Date</th>
                              <th className="px-3 py-2 text-left">Status</th>
                              <th className="px-3 py-2 text-left">Progress</th>
                              <th className="px-3 py-2 text-left">Docs</th>
                              {canManage && <th className="px-3 py-2 text-left">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {subs.map((sm, idx) => {
                              const smId = sm._id || sm.id;
                              const isDelayed = sm.endDate && sm.endDate.slice(0, 10) < today && sm.status !== 'completed';
                              return (
                                <tr key={smId} className={isDelayed ? 'bg-red-50' : 'hover:bg-emerald-50/30'}>
                                  <td className="pl-8 pr-3 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                                  <td className="px-3 py-2.5">
                                    <span className="font-medium text-gray-800 text-sm">{sm.name}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-500 text-sm">{sm.accountableUser?.name || '—'}</td>
                                  <td className="px-3 py-2.5 text-gray-400 text-xs">{fmtDate(sm.startDate)}</td>
                                  <td className={`px-3 py-2.5 text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                                    {fmtDate(sm.endDate)}
                                    {isDelayed && <span className="ml-1 text-red-500 font-bold" title="Overdue">⚠</span>}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {canManage ? (
                                      <select
                                        value={sm.status || 'not_started'}
                                        onChange={e => handleStatusChange(smId, e.target.value)}
                                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer capitalize ${STATUS_COLORS[sm.status] || 'bg-gray-100'}`}
                                      >
                                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                                      </select>
                                    ) : (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[sm.status] || 'bg-gray-100'}`}>
                                        {fmtLabel(sm.status)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {canManage ? (
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="range" min="0" max="100" step="5"
                                          value={sm.completionPercentage || 0}
                                          onChange={e => handleProgressChange(smId, e.target.value)}
                                          className="w-20 accent-emerald-600"
                                        />
                                        <span className="text-xs text-gray-500 w-8">{sm.completionPercentage || 0}%</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <div className="w-20 h-1.5 bg-gray-200 rounded-full">
                                          <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${sm.completionPercentage || 0}%` }} />
                                        </div>
                                        <span className="text-xs text-gray-500">{sm.completionPercentage || 0}%</span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <button
                                      onClick={() => openDocModal(sm)}
                                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                                    >
                                      <HiOutlinePaperClip className="w-3.5 h-3.5" /> Docs
                                    </button>
                                  </td>
                                  {canManage && (
                                    <td className="px-3 py-2.5">
                                      <button
                                        onClick={() => handleDelete(smId)}
                                        className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors"
                                        title="Delete"
                                      >
                                        <HiOutlineTrash className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-8 py-5 text-sm text-gray-400 text-center">
                        No sub-milestones yet.
                        {canManage && showSubFormFor !== mId && (
                          <button onClick={() => openSubForm(mId)} className="ml-2 text-emerald-600 hover:underline">
                            Add one
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
                            <label className="text-xs font-medium text-gray-600 block mb-1">Start Date</label>
                            <input type="date" value={subForm.startDate} onChange={e => setSF('startDate', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">End Date</label>
                            <input type="date" value={subForm.endDate} onChange={e => setSF('endDate', e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Accountable Person</label>
                            <select value={subForm.accountableUserId} onChange={e => setSF('accountableUserId', e.target.value)} className={inputCls}>
                              <option value="">Select person</option>
                              {users.map(u => <option key={u._id || u.id} value={u._id || u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Weight %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={subForm.weightPercentage}
                              onChange={e => setSF('weightPercentage', e.target.value)}
                              placeholder="Optional"
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                            <select value={subForm.status} onChange={e => setSF('status', e.target.value)} className={inputCls}>
                              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{fmtLabel(s)}</option>)}
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
                    {canManage && showSubFormFor !== mId && (
                      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                        <button
                          onClick={() => openSubForm(mId)}
                          className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                        >
                          <HiOutlinePlus className="w-4 h-4" />
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
                      <th className="px-5 py-3 text-left">Start</th>
                      <th className="px-5 py-3 text-left">Due Date</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-left">Progress</th>
                      <th className="px-5 py-3 text-left">Docs</th>
                      {canAddTopLevel && <th className="px-5 py-3 text-left">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {flatMilestones.map((m, i) => {
                      const mId = m._id || m.id;
                      const isDelayed = m.endDate && m.endDate.slice(0, 10) < today && m.status !== 'completed';
                      return (
                        <tr key={mId} className={isDelayed ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-gray-900">{m.name}</p>
                            {m.description && <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>}
                          </td>
                          <td className="px-5 py-3 text-gray-600">{m.accountableUser?.name || '—'}</td>
                          <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(m.startDate)}</td>
                          <td className={`px-5 py-3 text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {fmtDate(m.endDate)}
                            {isDelayed && <span className="text-red-500 font-bold ml-1" title="Overdue">⚠</span>}
                          </td>
                          <td className="px-5 py-3">
                            {canManage ? (
                              <select
                                value={m.status}
                                onChange={e => handleStatusChange(mId, e.target.value)}
                                className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer capitalize ${STATUS_COLORS[m.status] || 'bg-gray-100'}`}
                              >
                                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                              </select>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[m.status] || 'bg-gray-100'}`}>
                                {fmtLabel(m.status)}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {canManage ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="range" min="0" max="100" step="5"
                                  value={m.completionPercentage || 0}
                                  onChange={e => handleProgressChange(mId, e.target.value)}
                                  className="w-20"
                                />
                                <span className="text-xs text-gray-500 w-8">{m.completionPercentage || 0}%</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 bg-gray-200 rounded-full">
                                  <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${m.completionPercentage || 0}%` }} />
                                </div>
                                <span className="text-xs text-gray-500">{m.completionPercentage || 0}%</span>
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
                                <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors">
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
              {canAddTopLevel && (
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
    </div>
  );
}
