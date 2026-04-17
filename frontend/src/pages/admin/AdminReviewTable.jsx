import { useEffect, useState } from 'react';
import { getAdminOverviewApi, lockAssignmentApi, unlockAssignmentApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';
import { getCurrentFinancialYear, KPI_STATUS } from '../../utils/constants';

export default function AdminReviewTable() {
  const [filters, setFilters] = useState(() => ({
    financialYear: getCurrentFinancialYear(),
    month: String(new Date().getMonth() + 1),
  }));
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [confirmLock, setConfirmLock] = useState(null);

  const loadData = () => {
    if (!filters.financialYear || !filters.month) return;
    setLoading(true);
    getAdminOverviewApi(filters)
      .then((res) => setAllData(res.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filters.financialYear, filters.month]);

  const handleLock = async (assignmentId) => {
    try {
      await lockAssignmentApi(assignmentId);
      toast.success('Assignment locked');
      setConfirmLock(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Lock failed');
    }
  };

  const handleUnlock = async (assignmentId) => {
    try {
      await unlockAssignmentApi(assignmentId);
      toast.success('Assignment unlocked');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Unlock failed');
    }
  };

  return (
    <div>
      <PageHeader title="Admin Review Table" subtitle="View all KPI submissions and final approver decisions" />

      <FilterBar filters={filters} onChange={setFilters} showQuarter={false} />

      {!filters.month && (
        <div className="card text-center py-8 text-gray-400">Select a month to view all KPI assignments</div>
      )}

      {loading && <LoadingSpinner />}

      {!loading && filters.month && allData.length === 0 && (
        <div className="card text-center py-8 text-gray-400">No KPI assignments found for this period</div>
      )}

      {/* Summary row */}
      {!loading && allData.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <span className="px-3 py-1 bg-gray-100 rounded-full">Total: {allData.length}</span>
          <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full">
            Pending Final Approval: {allData.filter((d) => d.assignment.status === KPI_STATUS.MANAGER_REVIEWED).length}
          </span>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full">
            Final Approved: {allData.filter((d) => [KPI_STATUS.FINAL_APPROVED, 'final_reviewed'].includes(d.assignment.status)).length}
          </span>
          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full">
            Locked: {allData.filter((d) => d.assignment.status === KPI_STATUS.LOCKED).length}
          </span>
        </div>
      )}

      {!loading && allData.map((entry) => {
        const { assignment, items, overallAverageScore } = entry;
        const displayManager = assignment.currentManager || assignment.manager;
        const isExpanded = expandedEmployee === assignment._id;
        const canLock = [KPI_STATUS.FINAL_APPROVED, 'final_reviewed'].includes(assignment.status);
        const canUnlock = assignment.status === KPI_STATUS.LOCKED;
        const isLocked = assignment.status === KPI_STATUS.LOCKED;

        return (
          <div key={assignment._id} className={`card mb-4 ${isLocked ? 'border-gray-300 bg-gray-50/30' : ''}`}>
            {/* Header row */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedEmployee(isExpanded ? null : assignment._id)}
            >
              <div>
                <h3 className="font-semibold text-gray-900">{assignment.employee?.name}</h3>
                <p className="text-sm text-gray-500">
                  {assignment.employee?.employeeCode}
                  {assignment.employee?.designation ? ` · ${assignment.employee.designation}` : ''}
                  {displayManager ? ` · Mgr: ${displayManager.name}` : ''}
                  {' · '}{getMonthName(assignment.month)} {assignment.financialYear}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={assignment.status} />
                {assignment.monthlyWeightedScore != null && (
                  <span className="text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                    Score: {formatScore(assignment.monthlyWeightedScore)}
                  </span>
                )}
                {canLock && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmLock(assignment._id); }}
                    className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-medium"
                  >
                    Lock
                  </button>
                )}
                {canUnlock && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUnlock(assignment._id); }}
                    className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 font-medium"
                  >
                    Unlock
                  </button>
                )}
                <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded KPI table */}
            {isExpanded && (
              <div className="mt-4">
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-44">KPI Title</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 w-16">Target</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 w-16">Weight</th>
                        {/* Employee */}
                        <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 w-28">Emp Commitment</th>
                        <th className="px-3 py-2 text-center font-semibold text-amber-700 bg-amber-50 w-28">Emp Achievement</th>
                        <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 w-36">Emp Comment</th>
                        {/* Manager */}
                        <th className="px-3 py-2 text-center font-semibold text-indigo-700 bg-indigo-50 w-28">Mgr Status</th>
                        <th className="px-3 py-2 text-center font-semibold text-indigo-700 bg-indigo-50 w-36">Mgr Comment</th>
                        {/* Final Approver */}
                        <th className="px-3 py-2 text-center font-semibold text-cyan-700 bg-cyan-50 w-28">Final Decision</th>
                        <th className="px-3 py-2 text-center font-semibold text-cyan-700 bg-cyan-50 w-24">Achieved %</th>
                        <th className="px-3 py-2 text-left font-semibold text-cyan-700 bg-cyan-50 w-36">Final Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <tr key={item._id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-gray-400">{item.category} · {item.unit}</div>
                          </td>
                          <td className="px-3 py-2 text-center">{item.targetValue}</td>
                          <td className="px-3 py-2 text-center">{item.weightage}%</td>

                          {/* Employee commitment */}
                          <td className="px-3 py-2 text-center bg-blue-50/20">
                            {item.employeeCommitmentStatus
                              ? <span className="text-xs font-medium text-blue-700">{item.employeeCommitmentStatus}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          {/* Employee achievement */}
                          <td className="px-3 py-2 text-center bg-amber-50/20">
                            {item.employeeStatus
                              ? <span className="text-xs font-medium text-amber-700">{item.employeeStatus}</span>
                              : item.employeeValue != null
                              ? <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Legacy: {item.employeeValue}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 bg-blue-50/10">
                            {item.employeeComment || '—'}
                          </td>

                          {/* Manager */}
                          <td className="px-3 py-2 text-center bg-indigo-50/20">
                            {item.managerStatus
                              ? <span className="text-xs font-semibold text-indigo-700">{item.managerStatus}</span>
                              : item.managerScore != null
                              ? <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Legacy: {formatScore(item.managerScore)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 bg-indigo-50/10">
                            {item.managerComment || '—'}
                          </td>

                          {/* Final Approver Decision (read-only) */}
                          <td className="px-3 py-2 text-center bg-cyan-50/20">
                            {item.finalApproverStatus
                              ? <span className="text-xs font-semibold text-cyan-700">{item.finalApproverStatus}</span>
                              : item.finalScore != null
                              ? <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Legacy: {formatScore(item.finalScore)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center bg-cyan-50/20">
                            {item.finalApproverAchievedWeightage != null
                              ? <span className="text-xs font-semibold text-cyan-700">{item.finalApproverAchievedWeightage}%</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 bg-cyan-50/10">
                            {item.finalApproverComment || item.finalComment || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={!!confirmLock}
        title="Lock Assignment"
        message="Once locked, this record becomes read-only. Are you sure?"
        confirmText="Lock"
        danger
        onConfirm={() => handleLock(confirmLock)}
        onCancel={() => setConfirmLock(null)}
      />
    </div>
  );
}
