import { useEffect, useState } from 'react';
import { getAdminDashboardApi } from '../../api/dashboard.api';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getCurrentFinancialYear, MONTHS, QUARTER_MAP, KPI_STATUS_LABELS } from '../../utils/constants';
import { formatScore } from '../../utils/formatters';
import { HiOutlineUserGroup, HiOutlineShieldCheck, HiOutlineChartBar, HiOutlineLockClosed } from 'react-icons/hi';

const STATUS_BAR_COLORS = {
  draft: 'bg-gray-400',
  assigned: 'bg-blue-500',
  employee_submitted: 'bg-yellow-500',
  manager_reviewed: 'bg-purple-500',
  final_reviewed: 'bg-green-500',
  locked: 'bg-red-500',
};

const STATUS_DOT_COLORS = {
  draft: 'bg-gray-400',
  assigned: 'bg-blue-500',
  employee_submitted: 'bg-yellow-500',
  manager_reviewed: 'bg-purple-500',
  final_reviewed: 'bg-green-500',
  locked: 'bg-red-500',
};

export default function AdminDashboard() {
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

  // Build status map
  const statusMap = {};
  let totalAssignments = 0;
  data?.statusCounts?.forEach((s) => {
    statusMap[s._id] = s.count;
    totalAssignments += s.count;
  });

  const lockedCount = statusMap.locked || 0;

  // Ordered statuses for the distribution bar
  const statusOrder = ['draft', 'assigned', 'employee_submitted', 'manager_reviewed', 'final_reviewed', 'locked'];

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
          title="Pending Final Reviews"
          value={data?.pendingFinalReviews}
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
              {/* Stacked bar */}
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
              {/* Legend */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {statusOrder.map((status) => {
                  const count = statusMap[status] || 0;
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[status]}`} />
                      <span className="text-xs text-gray-600">
                        {KPI_STATUS_LABELS[status] || status}
                      </span>
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
                        <span className="text-xs text-gray-500">
                          {dept.locked}/{dept.total} locked
                        </span>
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

      {/* Department summary table */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Department Summary</h3>
        {data?.departmentSummary?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Department</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Locked</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Completion</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Score</th>
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
                            <div
                              className="h-full rounded-full bg-primary-500"
                              style={{ width: `${pct}%` }}
                            />
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
