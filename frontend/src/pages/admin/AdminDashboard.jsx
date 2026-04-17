import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminDashboardApi } from '../../api/dashboard.api';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getCurrentFinancialYear, MONTHS, QUARTER_MAP, KPI_STATUS_LABELS } from '../../utils/constants';
import { formatScore } from '../../utils/formatters';
import {
  HiOutlineUserGroup,
  HiOutlineShieldCheck,
  HiOutlineChartBar,
  HiOutlineLockClosed,
  HiOutlineExclamation,
  HiOutlineArrowRight,
} from 'react-icons/hi';

const STATUS_BAR_COLORS = {
  draft: 'bg-gray-400',
  assigned: 'bg-blue-500',
  commitment_submitted: 'bg-sky-400',
  employee_submitted: 'bg-yellow-500',
  manager_reviewed: 'bg-purple-500',
  final_approved: 'bg-emerald-500',
  final_reviewed: 'bg-emerald-400',  // legacy — same visual band
  locked: 'bg-red-500',
};

const STATUS_DOT_COLORS = {
  draft: 'bg-gray-400',
  assigned: 'bg-blue-500',
  commitment_submitted: 'bg-sky-400',
  employee_submitted: 'bg-yellow-500',
  manager_reviewed: 'bg-purple-500',
  final_approved: 'bg-emerald-500',
  final_reviewed: 'bg-emerald-400',
  locked: 'bg-red-500',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminDashboardApi()
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const currentFY = getCurrentFinancialYear(now);
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthName = MONTHS.find((m) => m.value === currentMonthNum)?.label || '';
  const currentQuarter = QUARTER_MAP[currentMonthNum] || '';

  // Build status map — merge final_reviewed into final_approved for display
  const statusMap = {};
  let totalAssignments = 0;
  data?.statusCounts?.forEach((s) => {
    const key = s._id === 'final_reviewed' ? 'final_approved' : s._id;
    statusMap[key] = (statusMap[key] || 0) + s.count;
    totalAssignments += s.count;
  });

  const lockedCount = statusMap.locked || 0;
  const pendingFinalApproval = (statusMap.manager_reviewed || 0);

  // Ordered statuses for the distribution bar
  const statusOrder = [
    'draft', 'assigned', 'commitment_submitted',
    'employee_submitted', 'manager_reviewed', 'final_approved', 'locked',
  ];

  // Final Approver Activity — pending by dept
  const pendingByDept = data?.pendingQuarterlyByDept || [];

  return (
    <div>
      <PageHeader title="Admin Dashboard" />

      {/* FY / Month banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-5 mb-6 text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary-100">Financial Year</p>
          <p className="text-2xl font-bold">{currentFY}</p>
        </div>
        <div className="h-10 w-px bg-primary-400 hidden md:block" />
        <div>
          <p className="text-sm font-medium text-primary-100">Current Month</p>
          <p className="text-2xl font-bold">{currentMonthName}</p>
        </div>
        <div className="h-10 w-px bg-primary-400 hidden md:block" />
        <div>
          <p className="text-sm font-medium text-primary-100">Quarter</p>
          <p className="text-2xl font-bold">{currentQuarter}</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Employees"
          value={data?.totalEmployees}
          icon={HiOutlineUserGroup}
          color="primary"
        />
        <StatCard
          title="Total Assignments"
          value={totalAssignments}
          subtitle="This month"
          icon={HiOutlineChartBar}
          color="green"
        />
        <StatCard
          title="Pending Final Approval"
          value={pendingFinalApproval}
          subtitle="Manager reviewed — awaiting final approver"
          icon={HiOutlineShieldCheck}
          color="yellow"
        />
        <StatCard
          title="Locked This Month"
          value={lockedCount}
          icon={HiOutlineLockClosed}
          color="red"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Status distribution */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Status Distribution</h3>
          {totalAssignments > 0 ? (
            <>
              <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                {statusOrder.map((status) => {
                  const count = statusMap[status] || 0;
                  if (count === 0) return null;
                  const pct = (count / totalAssignments) * 100;
                  return (
                    <div
                      key={status}
                      className={`${STATUS_BAR_COLORS[status]} relative group transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${KPI_STATUS_LABELS[status] || status}: ${count} (${pct.toFixed(0)}%)`}
                    >
                      {pct >= 10 && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {statusOrder.map((status) => {
                  const count = statusMap[status] || 0;
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[status]}`} />
                      <span className="text-xs text-gray-600">{KPI_STATUS_LABELS[status] || status}</span>
                      <span className="text-xs font-bold text-gray-800 ml-auto">{count}</span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No assignments this month</p>
          )}
        </div>

        {/* Department-wise completion */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Department Completion</h3>
          {data?.departmentSummary?.length > 0 ? (
            <div className="space-y-4">
              {data.departmentSummary.map((dept) => {
                const completionPct = dept.total > 0 ? Math.round((dept.locked / dept.total) * 100) : 0;
                return (
                  <div key={dept._id || 'unassigned'}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">{dept._id || 'Unassigned'}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{dept.locked}/{dept.total} locked</span>
                        <span className="text-sm font-bold text-gray-800 w-10 text-right">{completionPct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500 flex items-center justify-end pr-1"
                        style={{ width: `${Math.max(completionPct, 2)}%` }}
                      >
                        {completionPct >= 15 && (
                          <span className="text-[10px] font-bold text-white">{completionPct}%</span>
                        )}
                      </div>
                    </div>
                    {dept.avgScore != null && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Avg Score: {formatScore(dept.avgScore)}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No department data</p>
          )}
        </div>
      </div>

      {/* Final Approver Activity card */}
      {pendingByDept.length > 0 && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Final Approver Activity</h3>
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-medium">
              {pendingByDept.reduce((s, d) => s + (d.count || 0), 0)} awaiting quarterly approval
            </span>
          </div>
          <div className="space-y-2">
            {pendingByDept.map((dept) => (
              <div
                key={dept.departmentId || dept.departmentName}
                className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors cursor-pointer"
                onClick={() => navigate(`/admin/review?dept=${dept.departmentId}&status=manager_reviewed`)}
              >
                <div className="flex items-center gap-3">
                  <HiOutlineExclamation className="w-5 h-5 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{dept.departmentName || dept.departmentId}</p>
                    <p className="text-xs text-amber-600">
                      {dept.count} employee{dept.count !== 1 ? 's' : ''} awaiting quarterly approval
                    </p>
                  </div>
                </div>
                <HiOutlineArrowRight className="w-4 h-4 text-amber-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Department summary table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Department Summary</h3>
        {data?.departmentSummary?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Locked</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Completion</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Avg Score</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.departmentSummary.map((d) => {
                  const pct = d.total > 0 ? Math.round((d.locked / d.total) * 100) : 0;
                  return (
                    <tr key={d._id || 'unassigned'} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{d._id || 'Unassigned'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{d.total}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{d.locked}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-[100px]">
                            <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-gray-600 w-8">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{formatScore(d.avgScore)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-6">No data</p>
        )}
      </div>
    </div>
  );
}
