import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineLockClosed,
  HiOutlineCheck,
  HiOutlineClipboardList,
  HiOutlineSave,
  HiOutlineEye,
  HiOutlineX,
  HiOutlineExclamation,
} from 'react-icons/hi';
import {
  getKpiPlansApi,
  getKpiPlanByIdApi,
  createKpiPlanApi,
  updateKpiPlanStatusApi,
  publishKpiPlanApi,
  addKpiPlanItemApi,
  updateKpiPlanItemApi,
  deleteKpiPlanItemApi,
} from '../../api/kpiPlan.api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import {
  getCurrentFinancialYear,
  DEFAULT_HEAD_WEIGHTAGES,
  KPI_HEADS,
  KPI_HEAD_LABELS,
  KPI_PLAN_STATUS_LABELS,
  KPI_PLAN_STATUS_COLORS,
  FINANCIAL_YEARS,
  ROLE_OPTIONS,
} from '../../utils/constants';
import { getDepartmentsApi } from '../../api/departments.api';

const KPI_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => !['admin', 'final_approver'].includes(r.value));

// ── Theme per head ────────────────────────────────────────────────────────────
const HEAD_STYLES = {
  Performance:     { active: 'border-violet-500 text-violet-700 bg-violet-50',   inactive: 'text-gray-500 hover:text-violet-600 hover:border-violet-300',  badge: 'bg-violet-100 text-violet-700',   banner: 'from-violet-600 to-violet-700' },
  CustomerCentric: { active: 'border-blue-500 text-blue-700 bg-blue-50',          inactive: 'text-gray-500 hover:text-blue-600 hover:border-blue-300',       badge: 'bg-blue-100 text-blue-700',       banner: 'from-blue-600 to-blue-700'    },
  CoreValues:      { active: 'border-emerald-500 text-emerald-700 bg-emerald-50', inactive: 'text-gray-500 hover:text-emerald-600 hover:border-emerald-300', badge: 'bg-emerald-100 text-emerald-700', banner: 'from-emerald-600 to-emerald-700' },
  Trainings:       { active: 'border-amber-500 text-amber-700 bg-amber-50',       inactive: 'text-gray-500 hover:text-amber-600 hover:border-amber-300',     badge: 'bg-amber-100 text-amber-700',     banner: 'from-amber-500 to-amber-600'  },
};

const EMPTY_DRAFT = () => ({
  _id: `draft_${Date.now()}_${Math.random()}`,
  title: '',
  description: '',
  monthlyWeightage: '',
  category: 'Other',
  unit: 'Number',
  assignedTo: 'team_member',
  targetValue: '',
  thresholdValue: '',
  stretchTarget: '',
  remarks: '',
});

const toPayload = (row) => ({
  title: row.title?.trim(),
  description: row.description || '',
  monthlyWeightage: Number(row.monthlyWeightage) || 0,
  category: row.category || 'Other',
  unit: row.unit || 'Number',
  assignedTo: row.assignedTo || 'team_member',
  targetValue: row.targetValue !== '' && row.targetValue != null ? Number(row.targetValue) : null,
  thresholdValue: row.thresholdValue !== '' && row.thresholdValue != null ? Number(row.thresholdValue) : null,
  stretchTarget: row.stretchTarget !== '' && row.stretchTarget != null ? Number(row.stretchTarget) : null,
  remarks: row.remarks || null,
});

// ── Main Component ────────────────────────────────────────────────────────────
export default function KpiPlanManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state || {};

  const [fy, setFy]               = useState(navState.fy   || getCurrentFinancialYear());
  const [filterDept, setFilterDept] = useState(navState.dept || '');
  const [filterRole, setFilterRole] = useState(navState.role || '');

  const [selectedPlan, setSelectedPlan] = useState(null);
  const [items, setItems]         = useState([]);
  const [activeHead, setActiveHead] = useState(KPI_HEADS[0]);
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [notFound, setNotFound]   = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [draftRows, setDraftRows] = useState([]);

  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showWeightageError, setShowWeightageError] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [toast, setToast]         = useState(null);

  useEffect(() => {
    getDepartmentsApi().then((r) => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (fy && filterDept && filterRole) loadPlanByFilters();
    else { setSelectedPlan(null); setItems([]); setNotFound(false); }
  }, [fy, filterDept, filterRole]);

  useEffect(() => {
    setDraftRows([]); setEditingId(null); setEditValues({});
  }, [activeHead, selectedPlan?.id]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadPlanByFilters = async () => {
    setLoading(true); setNotFound(false); setSelectedPlan(null); setItems([]);
    try {
      const res = await getKpiPlansApi({ financialYear: fy, departmentId: filterDept, role: filterRole, limit: 1 });
      const list = res.data.data?.plans || res.data.data || [];
      if (list.length > 0) {
        const plan = list[0];
        const full = await getKpiPlanByIdApi(plan.id || plan._id);
        const p = full.data.data;
        setSelectedPlan(p);
        setItems(p.items || []);
        setActiveHead(KPI_HEADS[0]);
        setDraftRows([]); setEditingId(null);
      } else { setNotFound(true); }
    } catch { setNotFound(true); }
    finally { setLoading(false); }
  };

  const handleAutoCreate = async () => {
    setSaving(true);
    try {
      await createKpiPlanApi({ financialYear: fy, departmentId: filterDept, role: filterRole, headWeightages: { ...DEFAULT_HEAD_WEIGHTAGES } });
      setToast({ type: 'success', msg: 'KPI plan created successfully!' });
      await loadPlanByFilters();
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to create KPI plan';
      setToast({ type: 'error', msg });
    } finally {
      setSaving(false);
    }
  };

  const refreshPlan = async (id) => {
    try {
      const res = await getKpiPlanByIdApi(id || selectedPlan?.id);
      const p = res.data.data;
      if (p) { setSelectedPlan(p); setItems(p.items || []); setShowWeightageError(false); }
    } catch { /* ignore */ }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Status / Publish ──────────────────────────────────────────────────────
  const handleUpdateStatus = async (status) => {
    setSaving(true);
    try {
      await updateKpiPlanStatusApi(selectedPlan.id, status);
      showToast(`KPI marked as ${KPI_PLAN_STATUS_LABELS[status]}`);
      await refreshPlan(selectedPlan.id);
    } catch (e) { showToast(e.response?.data?.error?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      const res = await publishKpiPlanApi(selectedPlan.id);
      showToast(res.data?.message || 'KPI published successfully');
      setShowPublishConfirm(false);
      await refreshPlan(selectedPlan.id);
    } catch (e) { showToast(e.response?.data?.error?.message || 'Failed to publish', 'error'); }
    finally { setSaving(false); }
  };

  // ── KPI item CRUD ─────────────────────────────────────────────────────────
  const handleSaveDraft = async (draft) => {
    if (!draft.title?.trim()) { showToast('KPI title is required', 'error'); return; }
    const newWt = Number(draft.monthlyWeightage) || 0;
    const remaining = Math.round((100 - allItemsTotal) * 100) / 100;
    if (Math.round((allItemsTotal + newWt) * 100) / 100 > 100) {
      showToast(`Cannot add ${newWt}% — only ${remaining}% remaining (total is ${allItemsTotal}%)`, 'error');
      return;
    }
    setSaving(true);
    try {
      await addKpiPlanItemApi(selectedPlan.id, { ...toPayload(draft), kpiHead: activeHead });
      setDraftRows((p) => p.filter((r) => r._id !== draft._id));
      showToast('KPI added');
      await refreshPlan(selectedPlan.id);
    } catch (e) { showToast(e.response?.data?.error?.message || 'Failed to add KPI', 'error'); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async (itemId) => {
    if (!editValues.title?.trim()) { showToast('KPI title is required', 'error'); return; }
    const newWt = Number(editValues.monthlyWeightage) || 0;
    const otherTotal = Math.round(
      items.filter((i) => i.id !== itemId).reduce((s, i) => s + Number(i.monthlyWeightage || 0), 0) * 100
    ) / 100;
    if (Math.round((otherTotal + newWt) * 100) / 100 > 100) {
      const remaining = Math.round((100 - otherTotal) * 100) / 100;
      showToast(`Cannot set ${newWt}% — only ${remaining}% remaining (others use ${otherTotal}%)`, 'error');
      return;
    }
    setSaving(true);
    try {
      await updateKpiPlanItemApi(selectedPlan.id, itemId, toPayload(editValues));
      setEditingId(null); setEditValues({});
      showToast('KPI updated');
      await refreshPlan(selectedPlan.id);
    } catch (e) { showToast(e.response?.data?.error?.message || 'Failed to update KPI', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Remove this KPI? This cannot be undone.')) return;
    try {
      await deleteKpiPlanItemApi(selectedPlan.id, itemId);
      showToast('KPI removed');
      await refreshPlan(selectedPlan.id);
    } catch (e) { showToast(e.response?.data?.error?.message || 'Failed', 'error'); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const allItemsTotal = Math.round(
    items.reduce((s, i) => s + Number(i.monthlyWeightage || 0), 0) * 100
  ) / 100;
  const allItemsTotalOk = Math.round(allItemsTotal) === 100;

  const headItems = items.filter((i) => i.kpiHead === activeHead);
  const headItemsWeightTotal = Math.round(
    headItems.reduce((s, i) => s + Number(i.monthlyWeightage || 0), 0) * 100
  ) / 100;

  const canPublish = allItemsTotalOk && items.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* ── Filter + Plan toolbar ──────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 min-w-0">
        {/* Left: filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Financial Year</label>
            <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-field text-sm py-1.5 w-32">
              {FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-gray-300 text-lg hidden sm:block">›</span>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Department</label>
            <select
              value={filterDept}
              onChange={(e) => { setFilterDept(e.target.value); setFilterRole(''); }}
              className="input-field text-sm py-1.5 w-44"
            >
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <span className="text-gray-300 text-lg hidden sm:block">›</span>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Role</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="input-field text-sm py-1.5 w-44"
            >
              <option value="">Select Role</option>
              {KPI_ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          {loading && <LoadingSpinner size="sm" />}
        </div>

        {/* Right: status badge + weightage + action buttons */}
        {selectedPlan && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="w-px h-6 bg-gray-200 hidden sm:block" />
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
              selectedPlan.isPublished
                ? 'bg-emerald-100 text-emerald-700'
                : (KPI_PLAN_STATUS_COLORS[selectedPlan.status] || 'bg-gray-100 text-gray-600')
            }`}>
              {selectedPlan.isPublished ? 'Published' : (KPI_PLAN_STATUS_LABELS[selectedPlan.status] || selectedPlan.status)}
            </span>

            {!selectedPlan.isPublished && (
              <>
                {selectedPlan.status === 'draft' && (
                  <button onClick={() => handleUpdateStatus('saved')} disabled={saving}
                    className="btn-secondary text-xs flex items-center gap-1 whitespace-nowrap">
                    <HiOutlineSave className="h-4 w-4" /> Save KPI
                  </button>
                )}
                {(selectedPlan.status === 'draft' || selectedPlan.status === 'saved') && (
                  <button onClick={() => handleUpdateStatus('ready_for_review')} disabled={saving}
                    className="btn-secondary text-xs flex items-center gap-1 whitespace-nowrap">
                    <HiOutlineEye className="h-4 w-4" /> Ready for Review
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => {
                if (!canPublish) { setShowWeightageError(true); return; }
                setShowWeightageError(false);
                setShowPublishConfirm(true);
              }}
              disabled={saving}
              className="btn-success text-xs flex items-center gap-1 whitespace-nowrap"
            >
              <HiOutlineCheck className="h-4 w-4" />
              {selectedPlan.isPublished ? 'Re-sync Assignments' : 'Publish'}
            </button>
          </div>
        )}
      </div>

      {/* ── Published plan — live-edit info banner ─────────────────────────── */}
      {selectedPlan?.isPublished && !(showWeightageError || allItemsTotal > 100) && (
        <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-blue-50 text-blue-700 border-b border-blue-100">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-blue-400" />
          Published plan — adding, editing, or deleting KPI items will immediately update all employees whose assignments are not yet in progress.
        </div>
      )}

      {/* ── Weightage error sub-row (only on publish attempt or when over 100%) ── */}
      {selectedPlan && (showWeightageError || allItemsTotal > 100) && (
        <div className="px-6 py-1.5 text-xs font-semibold flex items-center gap-2 bg-red-50 text-red-600 border-b border-red-100">
          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400" />
          {allItemsTotal > 100
            ? `${Math.round((allItemsTotal - 100) * 100) / 100}% over 100% — reduce weightage on some KPIs`
            : items.length === 0
              ? 'No KPI items added yet — add at least one KPI before publishing'
              : `${Math.round((100 - allItemsTotal) * 100) / 100}% remaining — total must be exactly 100% to publish`}
        </div>
      )}

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">

        {/* Empty state */}
        {!filterDept || !filterRole ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <HiOutlineClipboardList className="h-14 w-14 text-gray-300" />
            <p className="text-base font-medium text-gray-500">Select filters to load a KPI plan</p>
            <p className="text-sm">Choose Financial Year → Department → Role above</p>
          </div>
        ) : notFound ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <HiOutlineClipboardList className="h-14 w-14 text-gray-300" />
            <p className="text-base font-medium text-gray-600">No KPI plan found</p>
            <p className="text-sm text-gray-400">No plan for the selected FY, Department and Role.</p>
            <button
              onClick={handleAutoCreate}
              disabled={saving}
              className="mt-2 btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <HiOutlinePlus className="h-4 w-4" />
              {saving ? 'Creating…' : 'Create KPI'}
            </button>
          </div>
        ) : !selectedPlan ? (
          <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>
        ) : (

          <div>
            {/* ── KPI Head Cards (clickable tabs) ───────────────────────────── */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {KPI_HEADS.map((head) => {
                  const s = HEAD_STYLES[head];
                  const isActive = activeHead === head;
                  const headWt = Math.round(
                    items.filter((i) => i.kpiHead === head).reduce((sum, i) => sum + Number(i.monthlyWeightage || 0), 0) * 100
                  ) / 100;
                  return (
                    <button
                      key={head}
                      onClick={() => setActiveHead(head)}
                      className={`rounded-xl border-2 px-4 py-3 text-left transition-all cursor-pointer hover:shadow-md ${
                        isActive ? s.active + ' shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`text-xs font-semibold mb-1 ${isActive ? '' : 'text-gray-500'}`}>
                        {KPI_HEAD_LABELS[head]}
                      </div>
                      <div className={`text-2xl font-bold ${isActive ? '' : 'text-gray-700'}`}>
                        {headWt}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── KPI Table ─────────────────────────────────────────────────── */}
            <div className="p-4 overflow-x-auto">
              {headItems.length === 0 && draftRows.length === 0 ? (
                <div className="text-center py-14 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <HiOutlineClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">No KPIs in {KPI_HEAD_LABELS[activeHead]} yet</p>
                  {allItemsTotal < 100 && (
                    <button
                      onClick={() => setDraftRows((p) => [...p, EMPTY_DRAFT()])}
                      className="mt-3 btn-primary text-sm flex items-center gap-1.5 mx-auto"
                    >
                      <HiOutlinePlus className="h-4 w-4" /> Add KPI Row
                    </button>
                  )}
                  {allItemsTotal >= 100 && (
                    <p className="mt-2 text-xs text-emerald-600 font-medium">Total weightage is 100% — ready to publish.</p>
                  )}
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
                      <th className="px-3 py-2.5 text-center w-10 border border-gray-200">#</th>
                      <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[260px]">
                        KPI <span className="text-red-400">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[220px]">
                        Target Definition
                      </th>
                      <th className="px-3 py-2.5 text-center border border-gray-200 w-28">
                        Weightage % <span className="text-red-400">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-center border border-gray-200 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Existing items */}
                    {headItems.map((item, idx) => {
                      const isEditing = editingId === item.id;
                      const ev = editValues;
                      const otherMax = Math.round((100 - items.filter(i => i.id !== item.id).reduce((s, x) => s + Number(x.monthlyWeightage || 0), 0)) * 100) / 100;
                      return (
                        <tr key={item.id} className={`border-b border-gray-200 transition-colors ${isEditing ? 'bg-yellow-50' : 'bg-white hover:bg-gray-50'}`}>
                            <td className="px-3 py-3 text-center text-gray-400 text-xs border border-gray-200">
                              {idx + 1}
                            </td>

                            <td className="px-2 py-2 border border-gray-200">
                              {isEditing
                                ? <input
                                    value={ev.title || ''}
                                    onChange={(e) => setEditValues((p) => ({ ...p, title: e.target.value }))}
                                    className="input-field text-sm w-full py-1.5"
                                    placeholder="KPI title *"
                                    autoFocus
                                  />
                                : <span className="font-medium text-gray-800 block px-1">{item.title}</span>
                              }
                            </td>

                            <td className="px-2 py-2 border border-gray-200">
                              {isEditing
                                ? <input
                                    value={ev.description || ''}
                                    onChange={(e) => setEditValues((p) => ({ ...p, description: e.target.value }))}
                                    className="input-field text-sm w-full py-1.5"
                                    placeholder="Target definition"
                                  />
                                : <span className="text-sm text-gray-600 block px-1">{item.description || '—'}</span>
                              }
                            </td>

                            <td className="px-2 py-2 text-center border border-gray-200">
                              {isEditing
                                ? <input
                                    type="number" min="0" step="0.01"
                                    max={otherMax}
                                    value={ev.monthlyWeightage ?? ''}
                                    onChange={(e) => setEditValues((p) => ({ ...p, monthlyWeightage: e.target.value }))}
                                    className="input-field text-sm py-1.5 text-center w-full"
                                    placeholder="0"
                                  />
                                : <span className="font-semibold text-gray-700">{item.monthlyWeightage ?? 0}%</span>
                              }
                            </td>

                            <td className="px-2 py-2 text-center border border-gray-200">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button onClick={() => handleSaveEdit(item.id)} disabled={saving}
                                    className="p-1.5 rounded bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white"
                                    title="Save">
                                    <HiOutlineCheck className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => { setEditingId(null); setEditValues({}); }}
                                    className="p-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-600"
                                    title="Cancel">
                                    <HiOutlineX className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => { setEditingId(item.id); setEditValues({ ...item }); }}
                                    className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                                    title="Edit">
                                    <HiOutlinePencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button onClick={() => handleDelete(item.id)}
                                    className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                    title="Remove">
                                    <HiOutlineTrash className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                        </tr>
                      );
                    })}

                    {/* Draft rows */}
                    {draftRows.map((draft, idx) => (
                      <DraftRow
                        key={draft._id}
                        draft={draft}
                        rowNumber={headItems.length + idx + 1}
                        saving={saving}
                        onChange={(field, val) =>
                          setDraftRows((prev) =>
                            prev.map((r) => r._id === draft._id ? { ...r, [field]: val } : r)
                          )
                        }
                        onSave={() => handleSaveDraft(draft)}
                        onRemove={() => setDraftRows((prev) => prev.filter((r) => r._id !== draft._id))}
                        remaining={Math.round((100 - allItemsTotal) * 100) / 100}
                      />
                    ))}

                    {/* Head totals row */}
                    {(headItems.length > 0 || draftRows.length > 0) && (
                      <tr className="bg-gray-50 font-semibold text-sm">
                        <td colSpan={3} className="px-3 py-2.5 text-right text-gray-600 border border-gray-200">
                          {KPI_HEAD_LABELS[activeHead]} Total:
                        </td>
                        <td className="px-2 py-2.5 text-center border border-gray-200">
                          <span className="font-bold text-base text-gray-800">{headItemsWeightTotal}%</span>
                        </td>
                        <td className="border border-gray-200" />
                      </tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Add KPI — bottom left (only when table has rows and capacity remains) */}
              {(headItems.length > 0 || draftRows.length > 0) && allItemsTotal < 100 && (
                <div className="flex justify-start mt-3">
                  <button
                    onClick={() => setDraftRows((p) => [...p, EMPTY_DRAFT()])}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    <HiOutlinePlus className="h-4 w-4" /> Add KPI Row
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ── Publish confirm ─────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={showPublishConfirm}
        title={`${selectedPlan?.isPublished ? 'Re-sync' : 'Publish'} KPI — ${selectedPlan?.department?.name} FY ${selectedPlan?.financialYear}`}
        message={
          <div className="space-y-2 text-sm">
            <p>{selectedPlan?.isPublished
              ? 'This will update all DRAFT/ASSIGNED employee assignments with the current KPI items. Assignments already in progress will not be changed.'
              : 'This plan will be locked and applied to new KPI assignments.'
            }</p>
            <ul className="text-gray-600 space-y-1 mt-2 border-t pt-2">
              <li>• Total KPI items: <strong>{items.length}</strong></li>
              <li>• Overall weightage: <strong>{allItemsTotal}%</strong></li>
              {KPI_HEADS.map((h) => {
                const hw = Math.round(items.filter((i) => i.kpiHead === h).reduce((s, i) => s + Number(i.monthlyWeightage || 0), 0) * 100) / 100;
                const cnt = items.filter((i) => i.kpiHead === h).length;
                return (
                  <li key={h}>• {KPI_HEAD_LABELS[h]}: <strong>{hw}%</strong> — {cnt} KPI{cnt !== 1 ? 's' : ''}</li>
                );
              })}
            </ul>
          </div>
        }
        confirmLabel={selectedPlan?.isPublished ? 'Re-sync Assignments →' : 'Publish KPI →'}
        onConfirm={handlePublish}
        onCancel={() => setShowPublishConfirm(false)}
        loading={saving}
      />
    </div>
  );
}

// ── DraftRow ──────────────────────────────────────────────────────────────────
function DraftRow({ draft, rowNumber, saving, onChange, onSave, onRemove, remaining }) {
  return (
    <tr className="bg-blue-50/60 border-b border-blue-100">
      <td className="px-3 py-2 text-center text-gray-400 text-xs border border-gray-200">{rowNumber}</td>

      <td className="px-2 py-1.5 border border-gray-200">
        <input
          value={draft.title}
          onChange={(e) => onChange('title', e.target.value)}
          className="input-field text-sm py-1.5 w-full"
          placeholder="KPI title *"
          autoFocus
        />
      </td>

      <td className="px-2 py-1.5 border border-gray-200">
        <input
          value={draft.description}
          onChange={(e) => onChange('description', e.target.value)}
          className="input-field text-sm py-1.5 w-full"
          placeholder="Target definition"
        />
      </td>

      <td className="px-2 py-1.5 border border-gray-200">
        <input
          type="number" min="0" max={remaining} step="0.01"
          value={draft.monthlyWeightage}
          onChange={(e) => onChange('monthlyWeightage', e.target.value)}
          className="input-field text-sm py-1.5 text-center w-full"
          placeholder={`max ${remaining}`}
        />
      </td>

      <td className="px-2 py-1.5 text-center border border-gray-200">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={onSave}
            disabled={saving || !draft.title.trim()}
            className="p-1.5 rounded bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white"
            title="Save row"
          >
            <HiOutlineCheck className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded bg-red-100 hover:bg-red-200 text-red-500"
            title="Remove row"
          >
            <HiOutlineTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
