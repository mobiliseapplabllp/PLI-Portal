/**
 * AssignKpis — 3-step guided flow for managers to assign KPIs.
 * Step 1: Select Employee + Month
 * Step 2: Preview KPI Plan (auto-populated from HR Admin's published plan)
 * Step 3: Review + Assign
 *
 * KPI item CRUD is NO LONGER available to managers — handled exclusively by HR Admin.
 */
import { useEffect, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchTeam } from '../../store/usersSlice';
import { createAssignmentApi, assignToEmployeeApi, getAssignmentsApi, getAssignmentByIdApi } from '../../api/kpiAssignments.api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import {
  MONTHS,
  FINANCIAL_YEARS,
  getCurrentFinancialYear,
  getVisibleMonthOptions,
} from '../../utils/constants';
import { getMonthName } from '../../utils/formatters';
import { HiOutlineCheck, HiOutlineExclamation, HiOutlineCheckCircle } from 'react-icons/hi';

const STEPS = ['Select Employee & Month', 'Confirm KPI Plan', 'Assign'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center mb-6">
      {STEPS.map((label, idx) => {
        const done = idx < current;
        const active = idx === current;
        return (
          <div key={idx} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                done ? 'bg-primary-600 text-white' : active ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-400' : 'bg-gray-100 text-gray-400'
              }`}>
                {done ? <HiOutlineCheck className="h-4 w-4" /> : idx + 1}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap ${active ? 'text-primary-700 font-semibold' : done ? 'text-primary-500' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 ${done ? 'bg-primary-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AssignKpis() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { team } = useSelector((state) => state.users);

  const [step, setStep] = useState(0);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [financialYear, setFinancialYear] = useState(() => getCurrentFinancialYear());
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingAssignment, setExistingAssignment] = useState(null);
  const [existingItems, setExistingItems] = useState([]);
  const [assigning, setAssigning] = useState(false);

  const visibleMonthOptions = useMemo(() => getVisibleMonthOptions(), []);

  useEffect(() => {
    if (user?._id) dispatch(fetchTeam(user._id));
  }, [dispatch, user]);

  const checkExisting = async () => {
    if (!selectedEmployee || !financialYear || !month) return;
    setLoading(true);
    try {
      const res = await getAssignmentsApi({ employee: selectedEmployee, financialYear, month, limit: 1 });
      const existing = res.data.data?.[0] || res.data.data?.assignments?.[0];
      if (existing) {
        const detail = await getAssignmentByIdApi(existing.id || existing._id);
        setExistingAssignment(detail.data.data.assignment);
        setExistingItems(detail.data.data.items || []);
      } else {
        setExistingAssignment(null);
        setExistingItems([]);
      }
    } catch {
      setExistingAssignment(null);
      setExistingItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleStep1Next = async () => {
    if (!selectedEmployee || !financialYear || !month) {
      toast.error('Please select employee, financial year and month');
      return;
    }
    await checkExisting();
    setStep(1);
  };

  const handleCreateAndNext = async () => {
    if (existingAssignment) {
      // Already exists — skip creation
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      const res = await createAssignmentApi({ financialYear, month: Number(month), employee: selectedEmployee });
      const newAsgmt = res.data.data;
      // Load items (auto-populated from KPI plan)
      const detail = await getAssignmentByIdApi(newAsgmt.id || newAsgmt._id);
      setExistingAssignment(detail.data.data.assignment);
      setExistingItems(detail.data.data.items || []);
      toast.success('Assignment created — KPI items auto-populated from HR Admin plan');
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create assignment');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!existingAssignment) return;
    setAssigning(true);
    try {
      await assignToEmployeeApi(existingAssignment.id || existingAssignment._id);
      toast.success('KPIs assigned to employee');
      navigate('/manager/team');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to assign');
    } finally {
      setAssigning(false);
    }
  };

  const selectedEmp = team.find((t) => (t.id || t._id) === selectedEmployee);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Assign KPIs</h1>
        <p className="text-sm text-gray-500 mt-1">KPI items are auto-populated from the published HR Admin plan for the selected month.</p>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 0: Employee + Month ──────────────────────────── */}
      {step === 0 && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Select Employee & Month</h2>
          <div>
            <label className="label-text">Employee *</label>
            <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="input-field">
              <option value="">Select employee</option>
              {team.map((emp) => (
                <option key={emp.id || emp._id} value={emp.id || emp._id}>
                  {emp.name} ({emp.employeeCode || emp.email})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Financial Year *</label>
              <select value={financialYear} onChange={(e) => setFinancialYear(e.target.value)} className="input-field">
                {FINANCIAL_YEARS.map((y) => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Month *</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="input-field">
                <option value="">Select month</option>
                {visibleMonthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={handleStep1Next} disabled={!selectedEmployee || !month || loading} className="btn-primary">
              {loading ? 'Checking...' : 'Next →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: KPI Plan Preview ─────────────────────────── */}
      {step === 1 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              KPI Plan — {selectedEmp?.name} · {getMonthName(Number(month))} {financialYear}
            </h2>
            {existingAssignment && <StatusBadge status={existingAssignment.status} />}
          </div>

          {loading ? (
            <div className="flex justify-center py-6"><LoadingSpinner /></div>
          ) : existingAssignment && existingItems.length > 0 ? (
            <>
              <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                <HiOutlineCheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-800">
                    {existingAssignment ? 'Existing assignment found.' : '✓ KPI Plan found and auto-populated.'}
                  </p>
                  <p className="text-emerald-600 text-xs mt-0.5">{existingItems.length} KPI items · Total weightage: {existingAssignment.totalWeightage || existingItems.reduce((s, i) => s + Number(i.weightage || 0), 0)}%</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left px-3 py-2">KPI Title</th>
                      <th className="text-left px-2 py-2">Category</th>
                      <th className="text-center px-2 py-2">Monthly %</th>
                      <th className="text-center px-2 py-2">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {existingItems.map((item) => (
                      <tr key={item.id || item._id}>
                        <td className="px-3 py-2 font-medium">{item.title}</td>
                        <td className="px-2 py-2 text-gray-500">{item.category}</td>
                        <td className="px-2 py-2 text-center">{item.weightage}%</td>
                        <td className="px-2 py-2 text-center">{item.targetValue ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : existingAssignment ? (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <HiOutlineExclamation className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Assignment exists but has no KPI items.</p>
                <p className="text-amber-600 text-xs mt-0.5">Contact HR Admin to publish a KPI plan for this month.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <HiOutlineExclamation className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">No published KPI plan found for this team/month.</p>
                <p className="text-amber-600 text-xs mt-0.5">KPI items will be empty until HR Admin publishes a plan. You can still create the assignment.</p>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(0)} className="btn-secondary">← Back</button>
            <button onClick={handleCreateAndNext} disabled={loading} className="btn-primary">
              {loading ? 'Creating...' : existingAssignment ? 'Continue →' : 'Create Assignment →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Review + Assign ───────────────────────────── */}
      {step === 2 && (
        <div className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Review & Assign</h2>

          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Employee:</span>
              <span className="font-semibold">{selectedEmp?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Period:</span>
              <span className="font-semibold">{getMonthName(Number(month))} {financialYear}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">KPI Items:</span>
              <span className="font-semibold">{existingItems.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status:</span>
              <StatusBadge status={existingAssignment?.status || 'draft'} />
            </div>
          </div>

          {existingAssignment?.status === 'draft' && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-600">
              ℹ Clicking "Assign KPIs" will notify the employee and move the assignment to "Assigned" status.
              The employee must then submit their monthly commitment.
            </div>
          )}

          {existingAssignment?.status === 'assigned' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-600 flex items-center gap-2">
              <HiOutlineCheckCircle className="h-4 w-4 flex-shrink-0" />
              KPIs already assigned. Employee can now submit their commitment.
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="btn-secondary">← Back</button>
            {existingAssignment?.status === 'draft' ? (
              <button onClick={handleAssign} disabled={assigning || existingItems.length === 0} className="btn-primary">
                {assigning ? 'Assigning...' : 'Assign KPIs →'}
              </button>
            ) : (
              <button onClick={() => navigate('/manager/team')} className="btn-secondary">
                Go to Team →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
