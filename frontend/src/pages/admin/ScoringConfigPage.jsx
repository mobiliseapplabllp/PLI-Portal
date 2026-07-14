import { useEffect, useState } from 'react';
import { HiOutlineClipboardList, HiOutlineExclamationCircle } from 'react-icons/hi';
import { getScoringConfigsApi, createScoringConfigApi, updateScoringConfigApi } from '../../api/scoringConfig.api';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { FINANCIAL_YEARS, getCurrentFinancialYear } from '../../utils/constants';

const DEFAULT_FORM = {
  financialYear: getCurrentFinancialYear(),
  meetsMultiplier: 1.0,
  belowMultiplier: -0.5,
  exceedsMultiplier: 1.5,
  isActive: true,
};

export default function ScoringConfigPage() {
  const [configs, setConfigs]                   = useState([]);
  const [loading, setLoading]                   = useState(true);
  const [saving, setSaving]                     = useState(false);
  const [showModal, setShowModal]               = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editing, setEditing]                   = useState(null);
  const [historyConfig, setHistoryConfig]       = useState(null);
  const [form, setForm]                         = useState(DEFAULT_FORM);
  const [pendingSubmit, setPendingSubmit]       = useState(null);

  const loadConfigs = () => {
    setLoading(true);
    getScoringConfigsApi()
      .then((res) => setConfigs(res.data.data))
      .catch(() => toast.error('Failed to load scoring configs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadConfigs(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEdit = (config) => {
    setEditing(config);
    setForm({
      financialYear:    config.financialYear,
      meetsMultiplier:   parseFloat(config.meetsMultiplier),
      belowMultiplier:   parseFloat(config.belowMultiplier),
      exceedsMultiplier: parseFloat(config.exceedsMultiplier),
      isActive: config.isActive,
    });
    setShowModal(true);
  };

  const openHistory = (config) => {
    setHistoryConfig(config);
    setShowHistoryModal(true);
  };

  // Called when the user clicks Save in the modal.
  // For updates: collect payload and show the impact-warning confirmation modal first.
  const handleSaveClick = async () => {
    if (editing) {
      // Show impact warning before sending update
      setPendingSubmit({
        meetsMultiplier:   parseFloat(form.meetsMultiplier),
        belowMultiplier:   parseFloat(form.belowMultiplier),
        exceedsMultiplier: parseFloat(form.exceedsMultiplier),
        isActive: form.isActive,
      });
      setShowModal(false);
      setShowConfirmModal(true);
    } else {
      await _doCreate();
    }
  };

  const _doCreate = async () => {
    try {
      await createScoringConfigApi({
        financialYear:    form.financialYear,
        meetsMultiplier:   parseFloat(form.meetsMultiplier),
        belowMultiplier:   parseFloat(form.belowMultiplier),
        exceedsMultiplier: parseFloat(form.exceedsMultiplier),
        isActive: form.isActive,
      });
      toast.success('Scoring config created');
      setShowModal(false);
      loadConfigs();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create scoring config');
    }
  };

  // Called when admin confirms the impact warning.
  const handleConfirmedUpdate = async () => {
    setSaving(true);  // show spinner inside confirm modal first
    try {
      await updateScoringConfigApi(editing.id, pendingSubmit);
      setShowConfirmModal(false);  // close modal only after save + recalc is complete
      toast.success(`Scoring config updated for FY ${editing.financialYear}. All quarters recalculated.`);
      setPendingSubmit(null);
      setEditing(null);
      loadConfigs();
    } catch (err) {
      setShowConfirmModal(false);
      toast.error(err.response?.data?.error?.message || 'Failed to update scoring config');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    // Re-open the edit modal so the user can go back and change values
    setShowModal(true);
  };

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="KPI Scoring Configuration"
        subtitle="Configure KPI status multipliers per Financial Year. One config applies to all quarters (Q1–Q4) within that FY."
        actions={<button onClick={openCreate} className="btn-primary">+ Add Config</button>}
      />

      {/* System defaults banner */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
        <HiOutlineClipboardList className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>System defaults</strong> (used when no config exists for a FY):
          Meets = 1.0 &nbsp;|&nbsp; Below = −0.5 &nbsp;|&nbsp; Exceeds = 1.5
          &nbsp;·&nbsp; These apply to <strong>all quarters</strong> in that year.
        </span>
      </div>

      <div className="space-y-4">
        {configs.length === 0 ? (
          <div className="card text-center py-10 text-gray-400">
            <p>No scoring configs configured yet.</p>
            <p className="text-sm mt-1">System defaults (Meets=1, Below=−0.5, Exceeds=1.5) will apply to all periods.</p>
          </div>
        ) : (
          configs.map((config) => (
            <div key={config.id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-semibold text-gray-900 text-base">
                    FY {config.financialYear}
                    <span className="ml-2 text-xs font-normal text-gray-400">Applies to Q1 · Q2 · Q3 · Q4</span>
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    {config.isActive ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>
                    )}
                    {config.createdBy && (
                      <span className="text-xs text-gray-400">by {config.createdBy.name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openHistory(config)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    History
                  </button>
                  <button
                    onClick={() => openEdit(config)}
                    className="text-xs text-primary-600 hover:underline font-medium"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Multiplier display */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-center">
                  <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">Below</div>
                  <div className="text-2xl font-bold text-amber-700 mt-1">{parseFloat(config.belowMultiplier).toFixed(1)}</div>
                  <div className="text-xs text-amber-500 mt-0.5">multiplier</div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-center">
                  <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">Meets</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">{parseFloat(config.meetsMultiplier).toFixed(1)}</div>
                  <div className="text-xs text-blue-500 mt-0.5">multiplier</div>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-center">
                  <div className="text-xs text-green-600 font-medium uppercase tracking-wide">Exceeds</div>
                  <div className="text-2xl font-bold text-green-700 mt-1">{parseFloat(config.exceedsMultiplier).toFixed(1)}</div>
                  <div className="text-xs text-green-500 mt-0.5">multiplier</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit Config — FY ${editing.financialYear}` : 'Create Scoring Config'}
        size="md"
      >
        {!editing && (
          <div className="mb-5">
            <label className="label-text">Financial Year</label>
            <select {...field('financialYear')} className="input-field">
              {FINANCIAL_YEARS.map((fy) => (
                <option key={fy} value={fy}>FY {fy}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              This config will apply to <strong>all quarters (Q1–Q4)</strong> within FY {form.financialYear}.
            </p>
          </div>
        )}

        <div className="space-y-4 mb-5">
          <p className="text-xs text-gray-500">
            Score = Σ(monthly weightage × multiplier) across 3 months. Null status = 0 contribution.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label-text text-amber-700">Below Multiplier</label>
              <input
                type="number"
                step="0.1"
                {...field('belowMultiplier')}
                className="input-field border-amber-300 focus:ring-amber-400"
                placeholder="-0.5"
              />
              <p className="text-xs text-gray-400 mt-0.5">Typically negative</p>
            </div>
            <div>
              <label className="label-text text-blue-700">Meets Multiplier</label>
              <input
                type="number"
                step="0.1"
                {...field('meetsMultiplier')}
                className="input-field border-blue-300 focus:ring-blue-400"
                placeholder="1.0"
              />
              <p className="text-xs text-gray-400 mt-0.5">Baseline = 1.0</p>
            </div>
            <div>
              <label className="label-text text-green-700">Exceeds Multiplier</label>
              <input
                type="number"
                step="0.1"
                {...field('exceedsMultiplier')}
                className="input-field border-green-300 focus:ring-green-400"
                placeholder="1.5"
              />
              <p className="text-xs text-gray-400 mt-0.5">Above 1.0</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active (use for calculations)</label>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSaveClick} className="btn-primary">
            {editing ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </Modal>

      {/* ── Impact Confirmation Modal (edit only) ── */}
      <Modal
        open={showConfirmModal}
        onClose={handleCancelConfirm}
        title="Confirm Scoring Config Change"
        size="md"
      >
        <div className="flex gap-3 mb-4">
          <HiOutlineExclamationCircle className="w-8 h-8 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-1">
              This change will impact all quarters in FY {editing?.financialYear}
            </p>
            <p className="text-sm text-gray-600">
              Updating the scoring multipliers for <strong>FY {editing?.financialYear}</strong> will affect
              score calculations for <strong>all quarters — Q1, Q2, Q3, and Q4</strong> — including
              past quarters, the current quarter, and upcoming quarters in this financial year.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-gray-600 list-disc list-inside">
              <li><strong>Pending employees</strong> — their calculated scores will be recalculated immediately on save.</li>
              <li><strong>Already approved employees</strong> — FA final scores will also be recalculated with the new multipliers.</li>
              <li><strong>Future quarters</strong> — new scores will automatically use the updated multipliers.</li>
            </ul>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-5">
          All quarters will be automatically recalculated when you confirm. The Final Approver Workbench
          will reflect the updated scores immediately after this save completes.
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={handleCancelConfirm} disabled={saving} className="btn-secondary">Go Back</button>
          <button onClick={handleConfirmedUpdate} disabled={saving} className="btn-primary bg-amber-600 hover:bg-amber-700 flex items-center gap-2 disabled:opacity-70">
            {saving && (
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {saving ? 'Updating & Recalculating…' : 'Yes, Update Config'}
          </button>
        </div>
      </Modal>

      {/* ── History Modal ── */}
      <Modal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`Change History — FY ${historyConfig?.financialYear}`}
        size="md"
      >
        <p className="text-sm text-gray-500 mb-3">
          All changes to this scoring config are recorded in the audit log.
        </p>
        <div className="text-center py-6 text-gray-400 text-sm">
          <p>Full audit history is available in the <a href="/admin/audit-logs" className="text-primary-600 underline">Audit Logs</a> section.</p>
          <p className="mt-1">Filter by entity type: <code className="bg-gray-100 px-1 rounded">scoring_config</code></p>
        </div>
        <div className="flex justify-end">
          <button onClick={() => setShowHistoryModal(false)} className="btn-secondary">Close</button>
        </div>
      </Modal>
    </div>
  );
}
