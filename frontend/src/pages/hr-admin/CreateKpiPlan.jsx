import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineClipboardList,
  HiOutlinePencilAlt,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
  HiOutlineOfficeBuilding,
  HiOutlineCalendar,
  HiOutlineUserGroup,
} from 'react-icons/hi';
import { createKpiPlanApi } from '../../api/kpiPlan.api';
import { getDepartmentsApi } from '../../api/departments.api';
import { getCurrentFinancialYear, DEFAULT_HEAD_WEIGHTAGES, FINANCIAL_YEARS, ROLE_OPTIONS } from '../../utils/constants';

const KPI_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => !['admin', 'final_approver'].includes(r.value));

const STEPS = [
  {
    icon: HiOutlineClipboardList,
    title: 'Create KPI',
    desc: 'Select department, financial year and role to initialise the plan.',
  },
  {
    icon: HiOutlinePencilAlt,
    title: 'Add KPI Items',
    desc: 'Add KPIs under each head — Performance, Customer Centric, Core Values, Trainings.',
  },
  {
    icon: HiOutlineCheckCircle,
    title: 'Publish',
    desc: 'Once all KPIs are set and total weightage reaches 100%, publish to activate.',
  },
];

export default function CreateKpiPlan() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    financialYear: getCurrentFinancialYear(),
    departmentId: '',
    role: '',
  });

  useEffect(() => {
    getDepartmentsApi()
      .then((r) => setDepartments(r.data.data || []))
      .catch(() => {});
  }, []);

  const goToEdit = () => {
    navigate('/hr-admin/kpi-plans', {
      state: { fy: form.financialYear, dept: form.departmentId, role: form.role },
    });
  };

  const handleChange = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    setError('');
    setIsDuplicate(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.departmentId) { setError('Please select a department.'); return; }
    if (!form.role) { setError('Please select a role.'); return; }
    setError('');
    setIsDuplicate(false);
    setSaving(true);
    try {
      await createKpiPlanApi({ ...form, headWeightages: { ...DEFAULT_HEAD_WEIGHTAGES } });
      navigate('/hr-admin/kpi-plans', {
        state: { fy: form.financialYear, dept: form.departmentId, role: form.role },
      });
    } catch (err) {
      const errData = err.response?.data?.error;
      if (errData?.duplicate || err.response?.status === 409) {
        setIsDuplicate(true);
        setError('A KPI plan already exists for this combination.');
      } else if (errData?.details?.length) {
        setError(errData.details.map((d) => d.message).join(' · '));
      } else {
        setError(errData?.message || 'Failed to create plan. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !saving && !!form.departmentId && !!form.role;

  return (
    <div className="min-h-full bg-gray-50 flex flex-col">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/hr-admin/kpi-plans')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <HiOutlineArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <div>
          <h1 className="text-base font-semibold text-gray-900">New KPI</h1>
          <p className="text-xs text-gray-400 mt-0.5">HR Admin · KPI Management</p>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-4xl flex gap-8 items-start">

          {/* ── Left: steps guide ──────────────────────────────────────────── */}
          <div className="hidden lg:flex flex-col w-64 flex-shrink-0 pt-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">How it works</p>
            <div className="flex flex-col gap-0">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                const isFirst = i === 0;
                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isFirst ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {isFirst ? <Icon className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                      </div>
                      {i < STEPS.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" style={{ minHeight: 28 }} />}
                    </div>
                    <div className="pb-6">
                      <p className={`text-sm font-semibold ${isFirst ? 'text-violet-700' : 'text-gray-500'}`}>
                        {step.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right: form card ───────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">

              {/* Card header */}
              <div className="px-8 pt-8 pb-6 border-b border-gray-100">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                    <HiOutlineClipboardList className="h-5 w-5 text-violet-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900">KPI Details</h2>
                </div>
                <p className="text-sm text-gray-400 ml-12">
                  Fill in the details below. You'll be taken directly to the plan to add KPI items.
                </p>
              </div>

              {/* Form body */}
              <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">

                {/* Error banner */}
                {error && (
                  <div className="flex gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                    <HiOutlineExclamationCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-700">{error}</p>
                      {isDuplicate && (
                        <button
                          type="button"
                          onClick={goToEdit}
                          className="mt-1.5 text-xs font-semibold text-violet-700 hover:text-violet-900 hover:underline flex items-center gap-1"
                        >
                          <HiOutlinePencilAlt className="h-3.5 w-3.5" />
                          Open existing plan in Edit KPI →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Fields row — FY + Department side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <HiOutlineCalendar className="h-4 w-4 text-gray-400" />
                        Financial Year <span className="text-red-400">*</span>
                      </span>
                    </label>
                    <select
                      value={form.financialYear}
                      onChange={(e) => handleChange('financialYear', e.target.value)}
                      className="input-field"
                    >
                      {FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <HiOutlineOfficeBuilding className="h-4 w-4 text-gray-400" />
                        Department <span className="text-red-400">*</span>
                      </span>
                    </label>
                    <select
                      value={form.departmentId}
                      onChange={(e) => handleChange('departmentId', e.target.value)}
                      className="input-field"
                    >
                      <option value="">Select department…</option>
                      {departments.map((d) => (
                        <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                      ))}
                    </select>
                    {departments.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">No departments found. Add them in Admin settings first.</p>
                    )}
                  </div>
                </div>

                {/* Role field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <HiOutlineUserGroup className="h-4 w-4 text-gray-400" />
                      Role <span className="text-red-400">*</span>
                    </span>
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => handleChange('role', e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select role…</option>
                    {KPI_ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Each role gets its own independent KPI plan.</p>
                </div>


                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/hr-admin/kpi-plans')}
                    disabled={saving}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Creating…
                      </>
                    ) : 'Create KPI →'}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
