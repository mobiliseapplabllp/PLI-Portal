import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import {
  getDeptQuarterlyStatusApi,
  buildQuarterlyApprovalDataApi,
  initQuarterlyApprovalApi,
  getQuarterlyApprovalApi,
  submitQuarterlyApprovalApi,
} from '../../api/finalApprover.api';
import { getCurrentFinancialYear, MONTHS, QUARTER_MONTHS } from '../../utils/constants';
import StatusBadge from '../../components/common/StatusBadge';
import NumericChip from '../../components/common/NumericChip';
import AutoCalcBadge from '../../components/common/AutoCalcBadge';
import StatusSelector from '../../components/common/StatusSelector';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const monthName = (m) => MONTHS.find((x) => x.value === Number(m))?.label?.slice(0, 3) || m;

// ── List view ────────────────────────────────────────────────────────────────
function WorkbenchList() {
  const navigate = useNavigate();
  const [fy, setFy] = useState(getCurrentFinancialYear());
  const [quarter, setQuarter] = useState('Q1');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, [fy, quarter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await getDeptQuarterlyStatusApi({ financialYear: fy, quarter });
      setData(res.data.data);
    } catch { /* handled by empty state */ }
    finally { setLoading(false); }
  };

  const employees = data?.employees || [];
  const qMonths = QUARTER_MONTHS[quarter] || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Approval Workbench</h1>
        <div className="flex items-center gap-3">
          <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-field text-sm w-28">
            {['2024-25', '2025-26', '2026-27'].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="input-field text-sm w-20">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <option key={q}>{q}</option>)}
          </select>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-gray-100">
            <HiOutlineRefresh className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No employees with KPI assignments for this quarter.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const allReviewed = emp.allMonthsReviewed;
            const hasApproval = emp.quarterlyApprovalExists;
            return (
              <div key={emp.id} className={`card hover:shadow-md transition-shadow ${allReviewed && !hasApproval ? 'ring-1 ring-emerald-300' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-gray-900">{emp.name}</div>
                    <div className="text-xs text-gray-400">{emp.employeeCode}</div>
                  </div>
                  {hasApproval && (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      ✓ Approved
                    </span>
                  )}
                </div>

                <div className="flex gap-2 mb-3">
                  {qMonths.map((m) => {
                    const status = emp.monthStatuses?.[m];
                    return (
                      <div key={m} className="flex-1 text-center">
                        <div className="text-xs text-gray-400 mb-1">{monthName(m)}</div>
                        <StatusBadge status={status || 'draft'} />
                      </div>
                    );
                  })}
                </div>

                {hasApproval ? (
                  <button
                    onClick={() => navigate(`/final-approver/workbench/${emp.id}/${fy}/${quarter}`)}
                    className="w-full text-center text-sm text-cyan-700 hover:text-cyan-800 font-medium py-2 border border-cyan-200 rounded-lg hover:bg-cyan-50 transition-colors"
                  >
                    View Approval
                  </button>
                ) : allReviewed ? (
                  <button
                    onClick={() => navigate(`/final-approver/workbench/${emp.id}/${fy}/${quarter}`)}
                    className="w-full btn-primary text-sm"
                  >
                    Begin Quarterly Review →
                  </button>
                ) : (
                  <div className="text-xs text-gray-400 text-center py-1">
                    {Object.values(emp.monthStatuses || {}).filter((s) => s === 'manager_reviewed').length}/{qMonths.length} months reviewed
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Detail view (workbench for one employee) ─────────────────────────────────
function WorkbenchDetail({ employeeId, fy, quarter }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approval, setApproval] = useState(null);
  const [formData, setFormData] = useState({});
  const [overrides, setOverrides] = useState({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const qMonths = QUARTER_MONTHS[quarter] || [];

  useEffect(() => { initialise(); }, [employeeId, fy, quarter]);

  const initialise = async () => {
    setLoading(true);
    setError(null);
    try {
      // Create/refresh draft approval
      const initRes = await initQuarterlyApprovalApi(employeeId, fy, quarter);
      const approvalId = initRes.data.data?.id;
      const fullRes = await getQuarterlyApprovalApi(approvalId);
      const a = fullRes.data.data;
      setApproval(a);
      // Pre-fill formData from auto-calculated values
      const fd = {};
      for (const item of a.items || []) {
        fd[item.id] = {
          finalStatus: item.finalStatus || (item.isAutoCalculated ? 'Meets' : ''),
          quarterlyAchievedWeightage: item.quarterlyAchievedWeightage ?? (item.isAutoCalculated ? item.quarterlyWeightage : ''),
          finalComment: item.finalComment || '',
        };
      }
      setFormData(fd);
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Failed to load approval data.');
    } finally {
      setLoading(false);
    }
  };

  const setField = (itemId, field, value) => {
    setFormData((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
    if (field === 'finalStatus' || field === 'quarterlyAchievedWeightage') {
      const item = approval?.items?.find((i) => i.id === itemId);
      if (item?.isAutoCalculated) {
        setOverrides((prev) => ({ ...prev, [itemId]: true }));
      }
    }
  };

  const projectedScore = useMemo(() => {
    if (!approval?.items) return 0;
    return approval.items.reduce((sum, item) => {
      const aw = parseFloat(formData[item.id]?.quarterlyAchievedWeightage) || 0;
      return sum + aw;
    }, 0);
  }, [formData, approval]);

  const allFilled = approval?.items?.every((item) => {
    const fd = formData[item.id];
    return fd?.finalStatus && fd?.quarterlyAchievedWeightage !== '' && fd?.quarterlyAchievedWeightage != null;
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const items = approval.items.map((item) => ({
        id: item.id,
        finalStatus: formData[item.id]?.finalStatus,
        quarterlyAchievedWeightage: parseFloat(formData[item.id]?.quarterlyAchievedWeightage) || 0,
        finalComment: formData[item.id]?.finalComment || '',
      }));
      await submitQuarterlyApprovalApi(approval.id, { items });
      setToast('Quarterly approval submitted successfully');
      setShowConfirm(false);
      setTimeout(() => navigate('/final-approver/workbench'), 1500);
    } catch (e) {
      setToast(e.response?.data?.error?.message || 'Failed to submit approval');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error) return <div className="text-center py-16 text-red-500">{error}</div>;
  if (!approval) return null;

  const isApproved = approval.status === 'approved';
  const employee = approval.employee;

  return (
    <div className="space-y-5">
      {/* Sticky-style header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/final-approver/workbench')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <HiOutlineArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {employee?.name} — {quarter} {fy}
          </h1>
          <p className="text-sm text-gray-500">
            {qMonths.map(monthName).join(' / ')} · {employee?.department?.name}
          </p>
        </div>
        {isApproved && (
          <span className="ml-auto px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold flex items-center gap-1">
            <HiOutlineCheckCircle className="h-4 w-4" /> Approved
          </span>
        )}
      </div>

      {/* Workflow stepper */}
      <div className="card py-4">
        <WorkflowStepper status={isApproved ? 'final_approved' : 'manager_reviewed'} />
      </div>

      {/* Monthly context (collapsible per month) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {qMonths.map((m) => {
          const monthAssignment = approval.monthlyAssignments?.[m];
          return (
            <div key={m} className="card bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-gray-700 text-sm">{monthName(m)} — {MONTHS.find((x) => x.value === m)?.label}</span>
                {monthAssignment?.status && <StatusBadge status={monthAssignment.status} />}
              </div>
              <div className="text-xs text-gray-400">
                {monthAssignment?.items?.length || 0} KPI items
              </div>
            </div>
          );
        })}
      </div>

      {/* Main approval table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <th className="text-left px-4 py-3 min-w-[200px]">KPI Item</th>
                {qMonths.map((m) => <th key={m} className="text-center px-3 py-3 min-w-[80px]">{monthName(m)}</th>)}
                <th className="text-center px-2 py-3 min-w-[60px]">Σ Sum</th>
                <th className="text-center px-2 py-3 min-w-[110px]">Auto?</th>
                <th className="text-center px-3 py-3 min-w-[140px]">Final Status</th>
                <th className="text-center px-3 py-3 min-w-[100px]">Achieved %</th>
                <th className="text-left px-3 py-3 min-w-[160px]">Comment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(approval.items || []).map((item) => {
                const fd = formData[item.id] || {};
                const isAuto = item.isAutoCalculated;
                const isOverridden = overrides[item.id];
                const rowClass = isAuto ? 'row-auto-calc' : 'row-manual-calc';
                const maxAw = parseFloat(item.quarterlyWeightage) || 100;
                const awOver = parseFloat(fd.quarterlyAchievedWeightage) > maxAw;

                return (
                  <tr key={item.id} className={rowClass}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 text-sm">{item.kpiTitle}</div>
                      <div className="text-xs text-gray-400 mt-0.5">M: {item.monthlyWeightage}% / Q: {item.quarterlyWeightage}%</div>
                    </td>
                    {[1, 2, 3].map((n) => {
                      const status = item[`month${n}_managerStatus`];
                      const numeric = item[`month${n}_numeric`];
                      return (
                        <td key={n} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {status ? <StatusBadge status={`submission_${status?.toLowerCase()}`} /> : <span className="text-gray-300 text-xs">—</span>}
                            <NumericChip value={numeric} size="xs" />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 text-center">
                      <NumericChip value={item.quarterlyNumericSum} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <AutoCalcBadge isAutoCalculated={isAuto} isOverridden={isOverridden} size="xs" />
                    </td>
                    <td className="px-3 py-3">
                      {isApproved ? (
                        <span className="text-sm text-gray-700">{item.finalStatus || '—'}</span>
                      ) : (
                        <StatusSelector
                          value={fd.finalStatus || ''}
                          onChange={(v) => setField(item.id, 'finalStatus', v)}
                          size="sm"
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {isApproved ? (
                        <span className="text-sm font-semibold text-gray-700">{item.quarterlyAchievedWeightage ?? '—'}%</span>
                      ) : (
                        <div className="relative">
                          <input
                            type="number" min="0" max={maxAw} step="0.5"
                            value={fd.quarterlyAchievedWeightage}
                            onChange={(e) => setField(item.id, 'quarterlyAchievedWeightage', e.target.value)}
                            className={`w-20 text-center border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 ${
                              awOver ? 'border-red-400 ring-red-300' : 'border-gray-300 focus:ring-cyan-400'
                            }`}
                            placeholder="0"
                          />
                          <span className="text-xs text-gray-400 ml-1">/ {maxAw}%</span>
                          {awOver && <p className="text-xs text-red-500 mt-0.5">Max {maxAw}%</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {isApproved ? (
                        <span className="text-xs text-gray-500">{item.finalComment || '—'}</span>
                      ) : (
                        <input
                          type="text"
                          value={fd.finalComment || ''}
                          onChange={(e) => setField(item.id, 'finalComment', e.target.value)}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
                          placeholder="Optional comment"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky footer score summary */}
      {!isApproved && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 shadow-lg rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-xs text-gray-500">Projected Quarterly Score</div>
                <div className="text-2xl font-bold text-cyan-700">{projectedScore.toFixed(1)}<span className="text-base text-gray-400"> / 100</span></div>
              </div>
              <div className="text-xs text-gray-400">
                <div>{approval.items?.filter((i) => i.isAutoCalculated).length} auto-calculated</div>
                <div>{approval.items?.filter((i) => !i.isAutoCalculated).length} manual</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={initialise} className="btn-secondary text-sm flex items-center gap-1">
                <HiOutlineSave className="h-4 w-4" /> Reload
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={!allFilled || submitting}
                className={`btn-success text-sm flex items-center gap-1 ${!allFilled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <HiOutlineCheckCircle className="h-4 w-4" /> Submit Approval →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        title={`Submit Quarterly Approval — ${employee?.name} · ${quarter} ${fy}`}
        message={
          <div className="space-y-2 text-sm">
            <p><strong>Quarterly Score: {projectedScore.toFixed(1)} / 100</strong></p>
            {approval.items?.map((item) => (
              <div key={item.id} className="flex justify-between text-xs text-gray-600">
                <span>{item.kpiTitle}</span>
                <span>{formData[item.id]?.finalStatus} · {formData[item.id]?.quarterlyAchievedWeightage}% credit</span>
              </div>
            ))}
            <p className="text-gray-500 pt-2">This will move all {qMonths.length} monthly assignments to Final Approved status.</p>
          </div>
        }
        confirmLabel="Submit Approval →"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
        loading={submitting}
      />

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg bg-emerald-600 text-white text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Main component — list or detail based on URL params ───────────────────────
export default function FinalApprovalWorkbench() {
  const { employeeId, fy, quarter } = useParams();

  if (employeeId && fy && quarter) {
    return <WorkbenchDetail employeeId={employeeId} fy={fy} quarter={quarter} />;
  }
  return <WorkbenchList />;
}
