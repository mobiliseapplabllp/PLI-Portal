/**
 * FinalReviewWorkbench — Admin's read-only oversight page.
 * Final Approver handles the actual approval via /final-approver/workbench.
 * Admin's role here is to lock/unlock after final_approved.
 */
import { useEffect, useState, useMemo } from 'react';
import { getAssignmentsApi, getAssignmentByIdApi, lockAssignmentApi, unlockAssignmentApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import FilterBar from '../../components/common/FilterBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';
import { getCurrentFinancialYear, KPI_STATUS } from '../../utils/constants';
import {
  HiOutlineLockClosed,
  HiOutlineLockOpen,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineCheckCircle,
  HiOutlineRefresh,
} from 'react-icons/hi';

export default function FinalReviewWorkbench() {
  const [filters, setFilters] = useState(() => ({
    financialYear: getCurrentFinancialYear(),
    month: String(new Date().getMonth() + 1),
  }));
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [expandLoading, setExpandLoading] = useState(null);
  const [confirmLock, setConfirmLock] = useState(null);   // assignmentId
  const [confirmUnlock, setConfirmUnlock] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLocking, setBulkLocking] = useState(false);

  const loadData = () => {
    if (!filters.financialYear || !filters.month) return;
    setLoading(true);
    getAssignmentsApi({
      ...filters,
      status: 'final_approved,locked,final_reviewed',
      limit: 200,
    })
      .then((res) => {
        const rows = res.data.data || res.data.data?.assignments || [];
        setAssignments(Array.isArray(rows) ? rows : []);
        setSelectedIds(new Set());
      })
      .catch(() => toast.error('Failed to load assignments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filters.financialYear, filters.month]);

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (expandedData[id]) return;
    setExpandLoading(id);
    try {
      const res = await getAssignmentByIdApi(id);
      setExpandedData((prev) => ({ ...prev, [id]: res.data.data }));
    } catch {
      toast.error('Failed to load details');
    } finally {
      setExpandLoading(null);
    }
  };

  const handleLock = async (id) => {
    try {
      await lockAssignmentApi(id);
      toast.success('Assignment locked');
      setConfirmLock(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Lock failed');
    }
  };

  const handleUnlock = async (id) => {
    try {
      await unlockAssignmentApi(id);
      toast.success('Assignment unlocked');
      setConfirmUnlock(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Unlock failed');
    }
  };

  const handleBulkLock = async () => {
    setBulkLocking(true);
    const ids = [...selectedIds];
    let success = 0;
    for (const id of ids) {
      try {
        await lockAssignmentApi(id);
        success++;
      } catch {
        // continue
      }
    }
    toast.success(`Locked ${success} of ${ids.length} assignments`);
    setBulkLocking(false);
    setSelectedIds(new Set());
    loadData();
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const lockableIds = assignments
    .filter((a) => [KPI_STATUS.FINAL_APPROVED, 'final_reviewed'].includes(a.status))
    .map((a) => a._id || a.id);

  const toggleSelectAll = () => {
    if (selectedIds.size === lockableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(lockableIds));
    }
  };

  // Stats
  const approvedCount = assignments.filter((a) => [KPI_STATUS.FINAL_APPROVED, 'final_reviewed'].includes(a.status)).length;
  const lockedCount = assignments.filter((a) => a.status === KPI_STATUS.LOCKED).length;

  return (
    <div>
      <PageHeader
        title="Final Approval Overview"
        subtitle="Lock approved assignments and view quarterly approval details"
      />

      <FilterBar filters={filters} onChange={setFilters} showQuarter={false} />

      {/* Summary */}
      {!loading && assignments.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-3 text-sm">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">
              Final Approved: {approvedCount}
            </span>
            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full font-medium">
              Locked: {lockedCount}
            </span>
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkLock}
              disabled={bulkLocking}
              className="btn-primary inline-flex items-center gap-2"
            >
              <HiOutlineLockClosed className="w-4 h-4" />
              {bulkLocking ? 'Locking...' : `Lock Selected (${selectedIds.size})`}
            </button>
          )}
        </div>
      )}

      {loading && <LoadingSpinner />}

      {!loading && assignments.length === 0 && (
        <div className="card text-center py-10 text-gray-400">
          No final-approved or locked assignments for this period.
        </div>
      )}

      {!loading && assignments.length > 0 && (
        <div className="overflow-hidden border border-gray-200 rounded-xl">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedIds.size === lockableIds.length && lockableIds.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-8" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {assignments.map((row) => {
                const id = row._id || row.id;
                const isLocked = row.status === KPI_STATUS.LOCKED;
                const canLock = [KPI_STATUS.FINAL_APPROVED, 'final_reviewed'].includes(row.status);
                const isExpanded = expandedId === id;
                const detail = expandedData[id];

                return (
                  <>
                    <tr key={id} className={`${isLocked ? 'bg-gray-50/60' : ''} hover:bg-gray-50`}>
                      <td className="px-4 py-3">
                        {canLock && (
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedIds.has(id)}
                            onChange={() => toggleSelect(id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => toggleExpand(id)} className="p-1 rounded hover:bg-gray-200">
                          {isExpanded
                            ? <HiOutlineChevronDown className="w-4 h-4 text-gray-500" />
                            : <HiOutlineChevronRight className="w-4 h-4 text-gray-500" />}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{row.employee?.name}</p>
                        <p className="text-xs text-gray-400">{row.employee?.employeeCode} · {row.employee?.department?.name || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {getMonthName(row.month)} {row.financialYear}
                        <span className="ml-1 text-xs text-gray-400">({row.quarter})</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                        {row.monthlyWeightedScore != null ? formatScore(row.monthlyWeightedScore) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canLock && (
                            <button
                              onClick={() => setConfirmLock(id)}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 font-medium"
                            >
                              <HiOutlineLockClosed className="w-3.5 h-3.5" />
                              Lock
                            </button>
                          )}
                          {isLocked && (
                            <button
                              onClick={() => setConfirmUnlock(id)}
                              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200 font-medium"
                            >
                              <HiOutlineLockOpen className="w-3.5 h-3.5" />
                              Unlock
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${id}-detail`}>
                        <td colSpan={7} className="px-0 py-0">
                          <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
                            {expandLoading === id ? (
                              <div className="flex justify-center py-4">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600" />
                              </div>
                            ) : detail ? (
                              <ExpandedDetail detail={detail} />
                            ) : (
                              <p className="text-sm text-gray-400 text-center py-3">Failed to load details.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmLock}
        title="Lock Assignment"
        message="Once locked, this record becomes read-only and cannot be edited by employees, managers, or final approvers. Continue?"
        confirmText="Lock"
        danger
        onConfirm={() => handleLock(confirmLock)}
        onCancel={() => setConfirmLock(null)}
      />

      <ConfirmDialog
        open={!!confirmUnlock}
        title="Unlock Assignment"
        message="This will revert the record to Final Approved status and allow edits. Continue?"
        confirmText="Unlock"
        onConfirm={() => handleUnlock(confirmUnlock)}
        onCancel={() => setConfirmUnlock(null)}
      />
    </div>
  );
}

function ExpandedDetail({ detail }) {
  const { assignment, items } = detail;

  return (
    <div className="space-y-3">
      <WorkflowStepper status={assignment.status} />

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-xs text-gray-500 uppercase">
              <th className="text-left px-3 py-2">KPI Title</th>
              <th className="text-left px-2 py-2">Category</th>
              <th className="text-center px-2 py-2">Weightage</th>
              <th className="text-center px-2 py-2 bg-blue-50 text-blue-700">Emp Commitment</th>
              <th className="text-center px-2 py-2 bg-amber-50 text-amber-700">Emp Achievement</th>
              <th className="text-center px-2 py-2 bg-indigo-50 text-indigo-700">Manager Status</th>
              <th className="text-center px-2 py-2 bg-cyan-50 text-cyan-700">Final Status</th>
              <th className="text-center px-2 py-2 bg-cyan-50 text-cyan-700">Achieved %</th>
              <th className="text-left px-2 py-2 bg-cyan-50 text-cyan-700">Final Comment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => (
              <tr key={item._id} className="hover:bg-white">
                <td className="px-3 py-2 font-medium">{item.title}</td>
                <td className="px-2 py-2 text-gray-500">{item.category}</td>
                <td className="px-2 py-2 text-center">{item.weightage}%</td>
                <td className="px-2 py-2 text-center bg-blue-50/30">
                  {item.employeeCommitmentStatus ? (
                    <span className="text-xs font-medium text-blue-700">{item.employeeCommitmentStatus}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2 text-center bg-amber-50/30">
                  {item.employeeStatus ? (
                    <span className="text-xs font-medium text-amber-700">{item.employeeStatus}</span>
                  ) : item.employeeValue != null ? (
                    <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Legacy: {item.employeeValue}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2 text-center bg-indigo-50/30">
                  {item.managerStatus ? (
                    <span className="text-xs font-medium text-indigo-700">{item.managerStatus}</span>
                  ) : item.managerScore != null ? (
                    <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Legacy: {formatScore(item.managerScore)}</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2 text-center bg-cyan-50/30">
                  {item.finalApproverStatus ? (
                    <span className="text-xs font-semibold text-cyan-700">{item.finalApproverStatus}</span>
                  ) : item.finalScore != null ? (
                    <span className="text-xs bg-gray-200 text-gray-500 px-1 rounded">Legacy</span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2 text-center bg-cyan-50/30">
                  {item.finalApproverAchievedWeightage != null
                    ? <span className="text-xs font-semibold text-cyan-700">{item.finalApproverAchievedWeightage}%</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-2 py-2 text-xs text-gray-500 bg-cyan-50/30">
                  {item.finalApproverComment || item.finalComment || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {assignment.monthlyWeightedScore != null && (
        <div className="flex justify-end">
          <span className="text-sm text-gray-500">Monthly Score: </span>
          <span className="text-sm font-bold text-primary-700 ml-1">{formatScore(assignment.monthlyWeightedScore)}</span>
        </div>
      )}
    </div>
  );
}
