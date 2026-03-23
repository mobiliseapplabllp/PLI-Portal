import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { getEmployeeDashboardApi } from '../../api/dashboard.api';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getMonthName, formatScore } from '../../utils/formatters';
import { HiOutlineClipboardList, HiOutlineExclamation, HiOutlineChartBar } from 'react-icons/hi';

export default function EmployeeDashboard() {
  const { user } = useSelector((state) => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getEmployeeDashboardApi()
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name}`}
        subtitle={data?.managerName ? `Reporting to: ${data.managerName}` : 'Employee Dashboard'}
      />

      {data?.kpiReviewApplicable === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3 mb-6 flex items-center gap-3">
          <HiOutlineExclamation className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            KPI Review is not applicable for your role. No KPI assessments are required. Contact your manager for details.
          </p>
        </div>
      )}

      {data?.kpiReviewApplicable !== false ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            title="Current Month"
            value={data?.currentMonth?.assignment ? getMonthName(data.currentMonth.month) : 'No Assignment'}
            subtitle={data?.currentMonth?.financialYear}
            icon={HiOutlineClipboardList}
            color="primary"
          />
          <StatCard
            title="Pending Actions"
            value={data?.pendingActions || 0}
            subtitle="KPI submissions pending"
            icon={HiOutlineExclamation}
            color={data?.pendingActions > 0 ? 'yellow' : 'green'}
          />
          <StatCard
            title="Current Quarter"
            value={data?.currentMonth?.quarter}
            subtitle={`${data?.quarterSnapshot?.filter((q) => q.status === 'locked').length || 0}/3 months locked`}
            icon={HiOutlineChartBar}
            color="purple"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard title="Current Month" value="N/A" subtitle="KPI Review not applicable" icon={HiOutlineClipboardList} color="gray" />
          <StatCard title="Pending Actions" value="N/A" subtitle="KPI Review not applicable" icon={HiOutlineExclamation} color="gray" />
          <StatCard title="Current Quarter" value="N/A" subtitle="KPI Review not applicable" icon={HiOutlineChartBar} color="gray" />
        </div>
      )}

      {/* Recent History */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Recent KPI History</h3>
        {data?.history?.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Period</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Quarter</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.history.map((h) => (
                <tr key={`${h.financialYear}-${h.month}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{getMonthName(h.month)} {h.financialYear}</td>
                  <td className="px-4 py-2 text-sm">{h.quarter}</td>
                  <td className="px-4 py-2"><StatusBadge status={h.status} /></td>
                  <td className="px-4 py-2 text-sm font-medium">{formatScore(h.monthlyWeightedScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">No history available</p>
        )}
      </div>
    </div>
  );
}
