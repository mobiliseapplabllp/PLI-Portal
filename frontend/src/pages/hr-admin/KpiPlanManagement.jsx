import { useEffect, useState } from 'react';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineLockClosed,
  HiOutlineRefresh,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineCheck,
  HiOutlineClipboardList,
} from 'react-icons/hi';
import {
  getKpiPlansApi,
  getKpiPlanByIdApi,
  createKpiPlanApi,
  publishKpiPlanApi,
  addKpiPlanItemApi,
  updateKpiPlanItemApi,
  deleteKpiPlanItemApi,
} from '../../api/kpiPlan.api';
import WeightageGauge from '../../components/common/WeightageGauge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { getCurrentFinancialYear, MONTHS, KPI_CATEGORIES, KPI_UNITS } from '../../utils/constants';
import { getDepartmentsApi } from '../../api/departments.api';
import { getUsersApi } from '../../api/users.api';

const EMPTY_ITEM = {
  title: '', description: '', category: 'Financial', unit: 'Number',
  monthlyWeightage: '', quarterlyWeightage: '', targetValue: '', thresholdValue: '',
  stretchTarget: '', remarks: '',
};

export default function KpiPlanManagement() {
  const [fy, setFy] = useState(getCurrentFinancialYear());
  const [monthFilter, setMonthFilter] = useState('');
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ ...EMPTY_ITEM });
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlan, setNewPlan] = useState({ financialYear: fy, month: '', scope: 'team', managerId: '', departmentId: '' });
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => { fetchPlans(); }, [fy, monthFilter]);

  // Load departments + managers once for the create-plan modal dropdowns
  useEffect(() => {
    getDepartmentsApi().then((res) => setDepartments(res.data.data || [])).catch(() => {});
    getUsersApi({ role: 'manager', limit: 200 }).then((res) => setManagers(res.data.data || [])).catch(() => {});
  }, []);
  // items are set directly by fetchPlans() and refreshSelectedPlan() — no separate effect needed

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const params = { financialYear: fy, limit: 100 };
      if (monthFilter) params.month = monthFilter;
      const res = await getKpiPlansApi(params);
      const list = res.data.data?.plans || res.data.data || [];
      setPlans(list);
      if (selectedPlan) {
        const updated = list.find((p) => p.id === selectedPlan.id);
        if (updated) {
          setSelectedPlan(updated);
          setItems(updated.items || []);
        }
      }
    } catch { setError('Failed to load plans.'); }
    finally { setLoading(false); }
  };

  // Re-fetch a single plan by ID and update the right-panel state immediately.
  // Used after add/edit/delete/publish so items refresh without waiting for the full list re-fetch.
  const refreshSelectedPlan = async (planId) => {
    try {
      const res = await getKpiPlanByIdApi(planId || selectedPlan?.id);
      const updated = res.data.data;
      if (updated) {
        setSelectedPlan(updated);
        setItems(updated.items || []);
        // Also update the plan in the left-panel list
        setPlans((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      }
    } catch { /* silently ignore — fetchPlans will sync on next filter change */ }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreatePlan = async () => {
    setSaving(true);
    try {
      await createKpiPlanApi({ ...newPlan, financialYear: fy });
      showToast('Plan created successfully');
      setShowCreateModal(false);
      setNewPlan({ financialYear: fy, month: '', scope: 'team', managerId: '', departmentId: '' });
      fetchPlans();
    } catch (e) {
      showToast(e.response?.data?.error?.message || 'Failed to create plan', 'error');
    } finally { setSaving(false); }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await publishKpiPlanApi(selectedPlan.id);
      showToast('Plan published successfully');
      setShowPublishConfirm(false);
      await refreshSelectedPlan(selectedPlan.id);
      fetchPlans();
    } catch (e) {
      showToast(e.response?.data?.error?.message || 'Failed to publish plan', 'error');
    } finally { setSaving(false); }
  };

  // Auto-derive quarterly weightage from yearly: round(yearly / 4)
  // Also convert empty-string numeric fields to null so the validator is happy.
  const deriveWeightages = (item) => {
    const yearly = Math.round(Number(item.monthlyWeightage) || 0);
    const quarterly = Math.round(yearly / 4);
    const num = (v) => (v === '' || v == null ? null : Number(v));
    return {
      ...item,
      monthlyWeightage: yearly,
      quarterlyWeightage: quarterly,
      targetValue: num(item.targetValue),
      thresholdValue: num(item.thresholdValue),
      stretchTarget: num(item.stretchTarget),
    };
  };

  const handleAddItem = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    try {
      await addKpiPlanItemApi(selectedPlan.id, deriveWeightages(newItem));
      showToast('KPI item added');
      setShowAddForm(false);
      setNewItem({ ...EMPTY_ITEM });
      await refreshSelectedPlan(selectedPlan.id);
    } catch (e) {
      showToast(e.response?.data?.error?.message || 'Failed to add item', 'error');
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async (itemId) => {
    setSaving(true);
    try {
      await updateKpiPlanItemApi(selectedPlan.id, itemId, deriveWeightages(editItem));
      showToast('Item updated');
      setExpandedItemId(null);
      setEditItem(null);
      await refreshSelectedPlan(selectedPlan.id);
    } catch (e) {
      showToast(e.response?.data?.error?.message || 'Failed to update item', 'error');
    } finally { setSaving(false); }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Remove this KPI item? This cannot be undone.')) return;
    try {
      await deleteKpiPlanItemApi(selectedPlan.id, itemId);
      showToast('Item removed');
      await refreshSelectedPlan(selectedPlan.id);
    } catch (e) {
      showToast(e.response?.data?.error?.message || 'Failed to delete item', 'error');
    }
  };

  const monthName = (m) => MONTHS.find((x) => x.value === Number(m))?.label || m;

  const usedMonthly = items.reduce((s, i) => s + Number(i.monthlyWeightage || 0), 0);
  const usedQuarterly = items.reduce((s, i) => s + Number(i.quarterlyWeightage || 0), 0);
  const remainingMonthly = 100 - usedMonthly;
  const canPublish = !selectedPlan?.isPublished && usedMonthly === 100;

  return (
    <div className="flex h-full gap-0 bg-gray-50">
      {/* ── Left panel: plan list ─────────────────────────────── */}
      <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
        {/* Filter bar */}
        <div className="p-4 border-b border-gray-100 space-y-2">
          <div className="flex gap-2">
            <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-field text-xs flex-1">
              {['2024-25', '2025-26', '2026-27'].map((y) => <option key={y}>{y}</option>)}
            </select>
            <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="input-field text-xs flex-1">
              <option value="">All months</option>
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <button onClick={() => setShowCreateModal(true)} className="w-full btn-primary text-xs">
            <HiOutlinePlus className="inline h-4 w-4 mr-1" /> New KPI Plan
          </button>
        </div>

        {/* Plan cards */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : plans.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">No plans found</div>
          ) : (
            plans.map((plan) => (
              <button
                key={plan.id}
                onClick={async () => {
                  setSelectedPlan(plan);
                  setItems(plan.items || []);          // optimistic: show whatever the list has
                  setShowAddForm(false);
                  setExpandedItemId(null);
                  // Always re-fetch full plan with items (list may not include items until restart)
                  try {
                    const res = await getKpiPlanByIdApi(plan.id);
                    const full = res.data.data;
                    if (full) { setSelectedPlan(full); setItems(full.items || []); }
                  } catch { /* keep optimistic state */ }
                }}
                className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                  selectedPlan?.id === plan.id
                    ? 'border-violet-400 bg-violet-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 truncate max-w-[160px]">
                      {plan.scope === 'team' ? '👥' : '🏢'} {plan.manager?.name || plan.department?.name || 'Plan'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{monthName(plan.month)} {fy}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {plan.items?.length || 0} items · Monthly: {Math.round(plan.totalMonthlyWeightage || 0)}%
                    </div>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                    plan.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {plan.isPublished ? 'Published' : 'Draft'}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: plan detail ──────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedPlan ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <HiOutlineClipboardList className="h-16 w-16 mb-4 text-gray-300" />
            <p className="text-lg font-medium">Select a plan to view details</p>
            <p className="text-sm mt-1">Or create a new KPI plan using the button on the left</p>
          </div>
        ) : (
          <div className="space-y-5 max-w-4xl">
            {/* Plan header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedPlan.manager?.name || selectedPlan.department?.name || 'Plan'} — {monthName(selectedPlan.month)} {fy}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Scope: {selectedPlan.scope === 'team' ? 'Team' : 'Department'} · FY: {fy}
                  {selectedPlan.isPublished && <span className="ml-2 text-emerald-600 font-medium">✓ Published</span>}
                </p>
              </div>
              {selectedPlan.isPublished && (
                <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">
                  <HiOutlineLockClosed className="h-3.5 w-3.5" /> Locked for editing
                </div>
              )}
            </div>

            {/* Weightage gauge */}
            <WeightageGauge
              monthly={usedMonthly}
              quarterly={usedQuarterly}
            />

            {/* Action bar */}
            {!selectedPlan.isPublished && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowAddForm(true); setExpandedItemId(null); }}
                  className="btn-primary text-xs"
                >
                  <HiOutlinePlus className="inline h-4 w-4 mr-1" /> Add KPI Item
                </button>
                <button
                  onClick={() => setShowPublishConfirm(true)}
                  disabled={!canPublish}
                  className={`btn-success text-xs ${!canPublish ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={!canPublish ? 'Monthly weightage must equal 100%' : 'Publish this plan'}
                >
                  <HiOutlineCheck className="inline h-4 w-4 mr-1" /> Publish Plan
                </button>
                {!canPublish && usedMonthly !== 100 && (
                  <span className="text-xs text-amber-600">
                    Yearly weightage: {usedMonthly}% (need 100% to publish)
                  </span>
                )}
              </div>
            )}

            {/* Add item inline form */}
            {showAddForm && !selectedPlan.isPublished && (
              <ItemForm
                data={newItem}
                onChange={setNewItem}
                remainingMonthly={remainingMonthly}
                onSave={handleAddItem}
                onCancel={() => { setShowAddForm(false); setNewItem({ ...EMPTY_ITEM }); }}
                saving={saving}
                title="Add KPI Item"
              />
            )}

            {/* Items table */}
            {items.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <HiOutlineClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p>No KPI items yet. Add items to build this plan.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800 truncate">{item.title}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{item.category}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Yearly: {item.monthlyWeightage}% · Quarterly: {Math.round((item.monthlyWeightage || 0) / 4)}%
                          {item.targetValue != null && ` · Target: ${item.targetValue}`}
                        </div>
                      </div>
                      {!selectedPlan.isPublished && (
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            onClick={() => {
                              setExpandedItemId(expandedItemId === item.id ? null : item.id);
                              setEditItem({ ...item });
                            }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          >
                            {expandedItemId === item.id
                              ? <HiOutlineChevronUp className="h-4 w-4" />
                              : <HiOutlinePencil className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline edit */}
                    {expandedItemId === item.id && editItem && !selectedPlan.isPublished && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <ItemForm
                          data={editItem}
                          onChange={setEditItem}
                          remainingMonthly={remainingMonthly + Number(item.monthlyWeightage || 0)}
                          onSave={() => handleSaveEdit(item.id)}
                          onCancel={() => { setExpandedItemId(null); setEditItem(null); }}
                          saving={saving}
                          title="Edit KPI Item"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 ${
          toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Publish confirm */}
      <ConfirmDialog
        isOpen={showPublishConfirm}
        title={`Publish "${selectedPlan?.manager?.name || selectedPlan?.department?.name} — ${monthName(selectedPlan?.month)}${fy}"`}
        message={
          <div className="space-y-2 text-sm">
            <p>This plan will be locked for editing and automatically applied to new assignments.</p>
            <ul className="text-gray-600 space-y-1">
              <li>• {items.length} KPI items</li>
              <li>• Yearly total: {usedMonthly}%</li>
              <li>• Quarterly total (auto): {usedQuarterly}%</li>
            </ul>
            {usedQuarterly < 100 && (
              <p className="text-amber-600 text-xs">⚠ Quarterly weightage is {usedQuarterly}% (auto-derived as yearly ÷ 4). This is fine — quarterly credits are caps, not requirements.</p>
            )}
          </div>
        }
        confirmLabel="Publish Plan →"
        onConfirm={handlePublish}
        onCancel={() => setShowPublishConfirm(false)}
        loading={saving}
      />

      {/* Create plan modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Create KPI Plan</h3>
            <div className="space-y-3">
              <div>
                <label className="label-text">Financial Year</label>
                <select value={newPlan.financialYear} onChange={(e) => setNewPlan({ ...newPlan, financialYear: e.target.value })} className="input-field">
                  {['2024-25', '2025-26', '2026-27'].map((y) => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">Month *</label>
                <select value={newPlan.month} onChange={(e) => setNewPlan({ ...newPlan, month: e.target.value })} className="input-field">
                  <option value="">Select month</option>
                  {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">Scope</label>
                <select value={newPlan.scope} onChange={(e) => setNewPlan({ ...newPlan, scope: e.target.value })} className="input-field">
                  <option value="team">Team (Manager-specific)</option>
                  <option value="department">Department-wide</option>
                </select>
              </div>
              {newPlan.scope === 'team' && (
                <div>
                  <label className="label-text">Manager *</label>
                  <select
                    value={newPlan.managerId}
                    onChange={(e) => setNewPlan({ ...newPlan, managerId: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select manager</option>
                    {managers.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.employeeCode || m.email})
                      </option>
                    ))}
                  </select>
                  {managers.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">No managers found in the system.</p>
                  )}
                </div>
              )}
              {newPlan.scope === 'department' && (
                <div>
                  <label className="label-text">Department *</label>
                  <select
                    value={newPlan.departmentId}
                    onChange={(e) => setNewPlan({ ...newPlan, departmentId: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                  {departments.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">No departments found. Add departments first.</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreateModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleCreatePlan}
                disabled={
                  saving ||
                  !newPlan.month ||
                  (newPlan.scope === 'team' && !newPlan.managerId) ||
                  (newPlan.scope === 'department' && !newPlan.departmentId)
                }
                className="btn-primary flex-1"
              >
                {saving ? 'Creating...' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemForm({ data, onChange, remainingMonthly, onSave, onCancel, saving, title }) {
  const set = (field, val) => onChange((prev) => ({ ...prev, [field]: val }));

  // Auto-derive quarterly from yearly (round integer)
  const yearlyVal = Math.round(Number(data.monthlyWeightage) || 0);
  const autoQuarterly = Math.round(yearlyVal / 4);
  const exceedsLimit = yearlyVal > remainingMonthly;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label-text">KPI Title *</label>
          <input value={data.title} onChange={(e) => set('title', e.target.value)} className="input-field" placeholder="e.g. Revenue Growth" />
        </div>
        <div>
          <label className="label-text">Category</label>
          <select value={data.category} onChange={(e) => set('category', e.target.value)} className="input-field">
            {KPI_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label-text">Unit</label>
          <select value={data.unit} onChange={(e) => set('unit', e.target.value)} className="input-field">
            {KPI_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>

        {/* Yearly Weightage — user input */}
        <div>
          <label className="label-text">Yearly Weightage % *</label>
          <input
            type="number" min="1" max="100" step="1"
            value={data.monthlyWeightage}
            onChange={(e) => set('monthlyWeightage', String(Math.round(Number(e.target.value))))}
            className={`input-field ${exceedsLimit ? 'border-red-400 ring-1 ring-red-300' : ''}`}
            placeholder={`≤ ${remainingMonthly}%`}
          />
          {exceedsLimit && (
            <p className="text-xs text-red-500 mt-0.5">Exceeds 100% limit (remaining: {remainingMonthly}%)</p>
          )}
        </div>

        {/* Quarterly Weightage — auto-calculated read-only */}
        <div>
          <label className="label-text">
            Quarterly Weightage %
            <span className="ml-1 text-xs text-gray-400 font-normal">(auto = yearly ÷ 4)</span>
          </label>
          <div className={`input-field bg-gray-50 text-gray-600 select-none cursor-default ${yearlyVal ? '' : 'text-gray-300'}`}>
            {yearlyVal ? `${autoQuarterly}%` : '—'}
          </div>
        </div>

        <div>
          <label className="label-text">Target Value</label>
          <input type="number" value={data.targetValue} onChange={(e) => set('targetValue', e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="label-text">Threshold Value</label>
          <input type="number" value={data.thresholdValue} onChange={(e) => set('thresholdValue', e.target.value)} className="input-field" />
        </div>
        <div className="col-span-2">
          <label className="label-text">Description</label>
          <textarea value={data.description} onChange={(e) => set('description', e.target.value)} className="input-field" rows={2} />
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn-secondary text-xs">Cancel</button>
        <button
          onClick={onSave}
          disabled={saving || !data.title || !data.monthlyWeightage || exceedsLimit}
          className="btn-primary text-xs"
        >
          {saving ? 'Saving...' : 'Save Item'}
        </button>
      </div>
    </div>
  );
}
