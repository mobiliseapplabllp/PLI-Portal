import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  HiOutlineExclamation,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlineChartBar,
  HiOutlineRefresh,
} from 'react-icons/hi';
import { getDeptQuarterlyStatusApi } from '../../api/finalApprover.api';
import { getCurrentFinancialYear, QUARTER_MONTHS, MONTHS } from '../../utils/constants';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function FinalApproverDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const [fy, setFy] = useState(getCurrentFinancialYear());
  const [quarter, setQuarter] = useState('Q1');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchData(); }, [fy, quarter]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDeptQuarterlyStatusApi({ financialYear: fy, quarter });
      setData(res.data.data);
    } catch {
      setError('Failed to load quarterly status.');
    } finally {
      setLoading(false);
    }
  };

  const employees = data?.employees || [];
  const qMonths = QUARTER_MONTHS[quarter] || [];
  const monthName = (m) => MONTHS.find((x) => x.value === m)?.label?.slice(0, 3) || m;

  // Support both old (flat) and new (nested) employee shape
  const getEmpId = (e) => e.employee?.id || e.id;
  const getEmpName = (e) => e.employee?.name || e.name;
  const getEmpCode = (e) => e.employee?.employeeCode || e.employeeCode;
  const getMonthStatus = (e, m) => {
    if (e.months) return e.months.find((mx) => mx.month === m)?.status;
    return e.monthStatuses?.[m];
  };
  const isApproved = (e) => e.quarterlyApproval?.status === 'approved' || e.quarterlyApprovalExists;
  const isReady = (e) => e.allMonthsReviewed && !isApproved(e);

  const totalEmployees = data?.totalEmployees ?? employees.length;
  const approvedCount = data?.approvedCount ?? employees.filter(isApproved).length;
  const pendingCount = data?.pendingCount ?? (totalEmployees - approvedCount);
  const isQuarterComplete = data?.isQuarterComplete ?? (totalEmployees > 0 && approvedCount === totalEmployees);
  const pct = totalEmployees > 0 ? Math.round((approvedCount / totalEmployees) * 100) : 0;
  const readyCount = employees.filter(isReady).length;
  const avgScore = data?.deptAvgScore != null ? data.deptAvgScore.toFixed(1) : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-700 to-cyan-800 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Final Approval</h1>
            <p className="text-cyan-200 mt-1">Department: {data?.departmentName || user?.department?.name || '—'}</p>
          </div>
          <div className="flex items-center gap-3">
            <select value={fy} onChange={(e) => setFy(e.target.value)} className="bg-white/20 text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm">
              {['2024-25', '2025-26', '2026-27'].map((y) => <option key={y} className="text-gray-800">{y}</option>)}
            </select>
            <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="bg-white/20 text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm">
              {QUARTERS.map((q) => <option key={q} className="text-gray-800">{q}</option>)}
            </select>
            <button onClick={fetchData} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              <HiOutlineRefresh className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Quarter Completion Progress */}
      {!loading && totalEmployees > 0 && (
        <div className={`card border-2 ${isQuarterComplete ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-900">
                Quarter Completion — {quarter} {fy}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {approvedCount} of {totalEmployees} employees approved
                {pendingCount > 0 && ` · ${pendingCount} pending`}
              </p>
            </div>
            {isQuarterComplete ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-sm">
                <HiOutlineCheckCircle className="w-4 h-4" /> Quarter Complete ✓
              </span>
            ) : (
              <span className="text-sm text-gray-500">{pct}% complete</span>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isQuarterComplete ? 'bg-emerald-500' : pct >= 50 ? 'bg-cyan-500' : 'bg-amber-400'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {isQuarterComplete && (
            <p className="text-xs text-emerald-600 mt-2">
              All employee quarterly approvals are complete. HR team can now proceed with PLI payout calculation for {quarter} {fy}.
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Awaiting Approval"
          value={readyCount}
          icon={HiOutlineExclamation}
          color="red"
          subtitle="All 3 months reviewed"
          onClick={() => navigate('/final-approver/workbench')}
          clickable
        />
        <StatCard
          title="Approved This Quarter"
          value={approvedCount}
          icon={HiOutlineCheckCircle}
          color="green"
          subtitle={`${quarter} ${fy}`}
        />
        <StatCard
          title="Total Employees"
          value={totalEmployees}
          icon={HiOutlineLockClosed}
          color="gray"
          subtitle="In your department"
        />
        <StatCard
          title="Avg Quarterly Score"
          value={avgScore}
          icon={HiOutlineChartBar}
          color="blue"
          subtitle="Department average"
        />
      </div>

      {/* Employee Progress Grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Department Progress — {quarter} {fy}
          </h2>
          <button onClick={() => navigate('/final-approver/workbench')} className="btn-primary text-xs">
            Open Workbench
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : error ? (
          <div className="text-red-500 text-center py-6">{error}</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No employees in your department with KPI assignments for this quarter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                  {qMonths.map((m) => (
                    <th key={m} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">
                      {monthName(m)}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => {
                  const empId = getEmpId(emp);
                  const empApproved = isApproved(emp);
                  const empReady = isReady(emp);
                  return (
                    <tr key={empId} className={`${empReady ? 'bg-emerald-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{getEmpName(emp)}</div>
                        <div className="text-xs text-gray-400">{getEmpCode(emp)}</div>
                      </td>
                      {qMonths.map((m) => {
                        const status = getMonthStatus(emp, m);
                        return (
                          <td key={m} className="px-3 py-3 text-center">
                            {status ? <StatusBadge status={status} /> : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-3 text-center">
                        {empApproved ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ Approved</span>
                        ) : empReady ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 font-medium ring-1 ring-emerald-200 animate-pulse">Ready</span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {qMonths.filter((m) => ['manager_reviewed', 'final_approved'].includes(getMonthStatus(emp, m))).length}/{qMonths.length} reviewed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {(empReady || empApproved) && (
                          <button
                            onClick={() => navigate(`/final-approver/workbench/${empId}/${fy}/${quarter}`)}
                            className="text-xs text-cyan-700 hover:text-cyan-800 font-medium"
                          >
                            {empApproved ? 'View' : 'Review →'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
