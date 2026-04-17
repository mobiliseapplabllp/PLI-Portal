import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { getEmployeeDashboardApi } from '../../api/dashboard.api';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import DeadlineCountdown from '../../components/common/DeadlineCountdown';
import { getMonthName, formatScore } from '../../utils/formatters';
import {
  HiOutlineClipboardList,
  HiOutlineExclamation,
  HiOutlineChartBar,
  HiOutlineLightningBolt,
} from 'react-icons/hi';
import { KPI_STATUS } from '../../utils/constants';

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

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;

  const currentAssignment = data?.currentMonth?.assignment;
  const previousAssignment = data?.previousMonth?.assignment;
  const pendingCommitment = data?.pendingActions?.commitment > 0;
  const pendingAchievement = data?.pendingActions?.achievement > 0;
  const hasPendingActions = pendingCommitment || pendingAchievement;

  const quarterlyScore = data?.quarterlyApproval?.quarterlyScore;
  const quarterlySource = data?.quarterlyApproval ? 'Final Approved' : 'Pending';

  return (
    <div className="space-y-6">
      {/* Gradient header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Performance Dashboard</h1>
            <p className="text-primary-200 mt-1">
              {data?.managerName ? `Reporting to: ${data.managerName}` : 'Employee Portal'}
            </p>
          </div>
          {data?.currentMonth?.quarter && (
            <div className="text-right">
              <div className="text-xs text-primary-200">{data.currentMonth.financialYear}</div>
              <div className="text-lg font-bold">{data.currentMonth.quarter}</div>
            </div>
          )}
        </div>
      </div>

      {/* KPI Not Applicable banner */}
      {data?.kpiReviewApplicable === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-3 flex items-center gap-3">
          <HiOutlineExclamation className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            KPI Review is not applicable for your role. Contact your manager for details.
          </p>
        </div>
      )}

      {data?.kpiReviewApplicable !== false && (
        <>
          {/* Dual-action zone */}
          {hasPendingActions ? (
            <div className="border border-amber-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-amber-50 px-4 py-2 flex items-center gap-2">
                <HiOutlineLightningBolt className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700">You have pending actions this month</span>
              </div>
              <div className={`grid ${pendingCommitment && pendingAchievement ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {/* Current month — commitment */}
                {pendingCommitment && currentAssignment && (
                  <div className="p-5 bg-primary-50 border-r border-amber-100">
                    <div className="text-xs font-semibold text-primary-600 uppercase mb-2">
                      {getMonthName(data.currentMonth.month)} {data.currentMonth.financialYear}
                    </div>
                    <h3 className="text-base font-bold text-gray-800 mb-1">Submit your commitment</h3>
                    <p className="text-sm text-gray-500 mb-3">Commit to your targets for this month's KPIs</p>
                    {currentAssignment.appraisalCycle?.commitmentDeadline && (
                      <DeadlineCountdown
                        deadline={currentAssignment.appraisalCycle.commitmentDeadline}
                        label="Commit by"
                        className="mb-3"
                      />
                    )}
                    <button
                      onClick={() => navigate(`/employee/kpis/${currentAssignment.id}`)}
                      className="btn-primary text-sm w-full"
                    >
                      Submit Commitment →
                    </button>
                  </div>
                )}

                {/* Previous month — achievement */}
                {pendingAchievement && previousAssignment && (
                  <div className="p-5 bg-amber-50">
                    <div className="text-xs font-semibold text-amber-600 uppercase mb-2">
                      {getMonthName(data.previousMonth.month)} {data.previousMonth.financialYear}
                    </div>
                    <h3 className="text-base font-bold text-gray-800 mb-1">Submit your achievement</h3>
                    <p className="text-sm text-gray-500 mb-3">Report your actual performance for last month</p>
                    {previousAssignment.appraisalCycle?.employeeSubmissionDeadline && (
                      <DeadlineCountdown
                        deadline={previousAssignment.appraisalCycle.employeeSubmissionDeadline}
                        label="Submit by"
                        className="mb-3"
                      />
                    )}
                    <button
                      onClick={() => navigate(`/employee/kpis/${previousAssignment.id}`)}
                      className="btn-primary text-sm w-full bg-amber-500 hover:bg-amber-600"
                    >
                      Submit Achievement →
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* No pending actions — show current assignment workflow */
            currentAssignment && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">Current Month Status</h3>
                  <StatusBadge status={currentAssignment.status} />
                </div>
                <WorkflowStepper status={currentAssignment.status} />
              </div>
            )
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active KPIs"
              value={currentAssignment?.totalWeightage ? `${currentAssignment.totalWeightage}%` : '—'}
              subtitle="Total weightage this month"
              icon={HiOutlineClipboardList}
              color="primary"
            />
            <StatCard
              title="Pending Actions"
              value={data?.pendingActions?.total || 0}
              subtitle={data?.pendingActions?.total > 0 ? 'Action required' : 'All up to date'}
              icon={HiOutlineExclamation}
              color={data?.pendingActions?.total > 0 ? 'yellow' : 'green'}
            />
            <StatCard
              title="Current Quarter"
              value={data?.currentMonth?.quarter || '—'}
              subtitle={`${data?.quarterSnapshot?.filter((q) => q.status === 'locked').length || 0}/3 months locked`}
              icon={HiOutlineChartBar}
              color="purple"
            />
            <StatCard
              title="Quarterly Score"
              value={quarterlyScore != null ? `${quarterlyScore.toFixed(1)}` : '—'}
              subtitle={quarterlySource}
              icon={HiOutlineChartBar}
              color={quarterlyScore != null ? 'green' : 'gray'}
            />
          </div>
        </>
      )}

      {/* KPI History */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">KPI History</h3>
        {data?.history?.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Quarter</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Score</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.history.map((h) => (
                <tr key={`${h.financialYear}-${h.month}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm">{getMonthName(h.month)} {h.financialYear}</td>
                  <td className="px-4 py-2 text-sm">{h.quarter}</td>
                  <td className="px-4 py-2"><StatusBadge status={h.status} /></td>
                  <td className="px-4 py-2 text-sm font-medium">{formatScore(h.monthlyWeightedScore)}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate(`/employee/kpis`)}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View
                    </button>
                  </td>
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
