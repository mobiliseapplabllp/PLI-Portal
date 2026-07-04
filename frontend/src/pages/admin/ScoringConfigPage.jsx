import { useEffect, useState } from 'react';
import { HiOutlineLockClosed, HiOutlineClipboardList } from 'react-icons/hi';
import { getScoringConfigsApi, createScoringConfigApi, updateScoringConfigApi } from '../../api/scoringConfig.api';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { FINANCIAL_YEARS, getCurrentFinancialYear } from '../../utils/constants';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

const DEFAULT_FORM = {
  financialYear: getCurrentFinancialYear(),
  quarter: 'Q1',
  meetsMultiplier: 1.0,
  belowMultiplier: -0.5,
  exceedsMultiplier: 1.5,
  isActive: true,
};

export default function ScoringConfigPage() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyConfig, setHistoryConfig] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);

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
    if (config.isLocked) {
      toast.error('This config is locked — quarterly approvals have been submitted for this period.');
      return;
    }
    setEditing(config);
    setForm({
      financialYear: config.financialYear,
      quarter: config.quarter,
      meetsMultiplier: parseFloat(config.meetsMultiplier),
      belowMultiplier: parseFloat(config.belowMultiplier),
      exceedsMultiplier: parseFloat(config.exceedsMultiplier),
      isActive: config.isActive,
    });
    setShowModal(true);
  };

  const openHistory = (config) => {
    setHistoryConfig(config);
    setShowHistoryModal(true);
  };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await updateScoringConfigApi(editing.id, {
          meetsMultiplier: parseFloat(form.meetsMultiplier),
          belowMultiplier: parseFloat(form.belowMultiplier),
          exceedsMultiplier: parseFloat(form.exceedsMultiplier),
          isActive: form.isActive,
        });
      } else {
        await createScoringConfigApi({
          financialYear: form.financialYear,
          quarter: form.quarter,
          meetsMultiplier: parseFloat(form.meetsMultiplier),
          belowMultiplier: parseFloat(form.belowMultiplier),
          exceedsMultiplier: parseFloat(form.exceedsMultiplier),
          isActive: form.isActive,
        });
      }
      toast.success(editing ? 'Scoring config updated' : 'Scoring config created');
      setShowModal(false);
      loadConfigs();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save scoring config');
    }
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
        subtitle="Configure status multipliers per Financial Year and Quarter. Multipliers are locked once quarterly approvals are submitted."
        actions={<button onClick={openCreate} className="btn-primary">+ Add Config</button>}
      />

      {/* Default values banner */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
        <HiOutlineClipboardList className="w-4 h-4 flex-shrink-0" />
        <span>
          <strong>System defaults</strong> (used when no config exists for a period):
          Meets = 1.0 &nbsp;|&nbsp; Below = −0.5 &nbsp;|&nbsp; Exceeds = 1.5
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
                <div className="flex items-center gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {config.financialYear} — {config.quarter}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      {config.isLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                          <HiOutlineLockClosed className="w-3 h-3" /> Locked — submissions exist
                        </span>
                      ) : config.isActive ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Inactive</span>
                      )}
                      {config.createdBy && (
                        <span className="text-xs text-gray-400">by {config.createdBy.name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openHistory(config)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    History
                  </button>
                  {!config.isLocked && (
                    <button
                      onClick={() => openEdit(config)}
                      className="text-xs text-primary-600 hover:underline font-medium"
                    >
                      Edit
                    </button>
                  )}
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

      {/* Create / Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Edit Config — ${editing.financialYear} ${editing.quarter}` : 'Create Scoring Config'}
        size="md"
      >
        {!editing && (
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="label-text">Financial Year</label>
              <select {...field('financialYear')} className="input-field">
                {FINANCIAL_YEARS.map((fy) => (
                  <option key={fy} value={fy}>FY {fy}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text">Quarter</label>
              <select {...field('quarter')} className="input-field">
                {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
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
          <button onClick={handleSubmit} className="btn-primary">{editing ? 'Update' : 'Create'}</button>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        open={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`Change History — ${historyConfig?.financialYear} ${historyConfig?.quarter}`}
        size="md"
      >
        <p className="text-sm text-gray-500 mb-3">
          All changes to this scoring config are recorded below. View in Audit Logs for full detail.
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
