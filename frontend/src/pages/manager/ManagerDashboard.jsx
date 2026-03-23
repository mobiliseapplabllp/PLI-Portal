import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getManagerDashboardApi } from '../../api/dashboard.api';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getCurrentFinancialYear, MONTHS, QUARTER_MAP } from '../../utils/constants';
import { HiOutlineUserGroup, HiOutlineClipboardCheck, HiOutlineExclamation, HiOutlineEye } from 'react-icons/hi';

export default function ManagerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getManagerDashboardApi()
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const currentFY = getCurrentFinancialYear(now);
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthName = MONTHS.find((m) => m.value === currentMonthNum)?.label || '';
  const currentQuarter = QUARTER_MAP[currentMonthNum] || '';

  return (
    <div>
      <PageHeader title="Manager Dashboard" />

      {/* FY / Month / Quarter banner */}
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
          title="Team Size"
          value={data?.teamSize}
          icon={HiOutlineUserGroup}
          color="primary"
        />
        <StatCard
          title="KPIs Assigned"
          value={data?.teamMonthSummary?.length || 0}
          subtitle="This month"
          icon={HiOutlineClipboardCheck}
          color="green"
        />
        <StatCard
          title="Awaiting Submission"
          value={data?.pendingEmployeeSubmissions}
          subtitle="Employees yet to submit"
          icon={HiOutlineExclamation}
          color="yellow"
        />
        <StatCard
          title="Pending Your Review"
          value={data?.pendingReviews}
          subtitle="Ready for review"
          icon={HiOutlineEye}
          color="purple"
        />
      </div>

      {/* Team monthly assignments table */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            Team Assignments — {currentMonthName} {now.getFullYear()}
          </h3>
          <span className="text-sm text-gray-500">
            {data?.teamMonthSummary?.length || 0} assignment{data?.teamMonthSummary?.length !== 1 ? 's' : ''}
          </span>
        </div>

        {data?.teamMonthSummary?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.teamMonthSummary.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.employee?.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{item.employee?.employeeCode}</td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-sm font-medium">{item.monthlyWeightedScore != null ? Number(item.monthlyWeightedScore).toFixed(1) : '—'}</td>
                    <td className="px-4 py-3">
                      {item.status === 'employee_submitted' ? (
                        <button
                          onClick={() => navigate(`/manager/review/${item._id}`)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                        >
                          Review
                        </button>
                      ) : item.status === 'draft' ? (
                        <button
                          onClick={() => navigate(`/manager/assign/${item._id}`)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors"
                        >
                          Assign
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/manager/review/${item._id}`)}
                          className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">No assignments for {currentMonthName}</p>
          </div>
        )}
      </div>
    </div>
  );
}
