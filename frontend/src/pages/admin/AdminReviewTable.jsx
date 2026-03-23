import { useEffect, useState } from 'react';
import { getAdminOverviewApi, finalReviewApi, lockAssignmentApi, unlockAssignmentApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import FilterBar from '../../components/common/FilterBar';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { getMonthName } from '../../utils/formatters';
import { getCurrentFinancialYear } from '../../utils/constants';

export default function AdminReviewTable() {
  const [filters, setFilters] = useState(() => ({ financialYear: getCurrentFinancialYear(), month: String(new Date().getMonth() + 1) }));
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adminInputs, setAdminInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [confirmLock, setConfirmLock] = useState(null);

  const loadData = () => {
    if (!filters.financialYear || !filters.month) return;
    setLoading(true);
    getAdminOverviewApi(filters)
      .then((res) => {
        setAllData(res.data.data || []);
        const inputs = {};
        (res.data.data || []).forEach((entry) => {
          entry.items.forEach((item) => {
            inputs[item._id] = {
              finalValue: item.finalValue ?? '',
              finalScore: item.finalScore ?? '',
              finalComment: item.finalComment ?? '',
            };
          });
        });
        setAdminInputs(inputs);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filters.financialYear, filters.month]);

  const handleInputChange = (itemId, field, value) => {
    setAdminInputs((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleFinalReview = async (assignmentId, items) => {
    const payload = items.map((item) => ({
      id: item._id,
      finalValue: Number(adminInputs[item._id]?.finalValue),
      finalScore: Number(adminInputs[item._id]?.finalScore),
      finalComment: adminInputs[item._id]?.finalComment || '',
    }));

    if (payload.some((i) => isNaN(i.finalValue) || isNaN(i.finalScore))) {
      toast.error('Please fill all admin values and scores');
      return;
    }
    if (payload.some((i) => i.finalScore < 0 || i.finalScore > 100)) {
      toast.error('Scores must be between 0 and 100');
      return;
    }

    setSubmitting((prev) => ({ ...prev, [assignmentId]: true }));
    try {
      await finalReviewApi(assignmentId, { items: payload });
      toast.success('Final review submitted');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting((prev) => ({ ...prev, [assignmentId]: false }));
    }
  };

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

  // Compute live average when admin types
  const getLiveAverage = (item) => {
    const values = [];
    if (item.employeeValue != null) values.push(Number(item.employeeValue));
    if (item.managerValue != null) values.push(Number(item.managerValue));
    const adminVal = adminInputs[item._id]?.finalValue;
    if (adminVal !== '' && adminVal != null && !isNaN(Number(adminVal))) values.push(Number(adminVal));
    if (values.length === 0) return null;
    return (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  };

  return (
    <div>
      <PageHeader title="Admin Review Table" subtitle="View all submissions and provide final assessment" />

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
        <div className="mb-4 flex gap-3 text-sm">
          <span className="px-3 py-1 bg-gray-100 rounded-full">Total: {allData.length}</span>
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full">
            Pending Review: {allData.filter((d) => d.assignment.status === 'manager_reviewed').length}
          </span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
            Reviewed: {allData.filter((d) => d.assignment.status === 'final_reviewed').length}
          </span>
          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full">
            Locked: {allData.filter((d) => d.assignment.status === 'locked').length}
          </span>
        </div>
      )}

      {!loading && allData.map((entry) => {
        const { assignment, items, overallAverageScore } = entry;
        const isExpanded = expandedEmployee === assignment._id;
        const canFinalReview = assignment.status === 'manager_reviewed';
        const canLock = assignment.status === 'final_reviewed';
        const canUnlock = assignment.status === 'locked';
        const isLocked = assignment.status === 'locked';

        return (
          <div key={assignment._id} className={`card mb-4 ${isLocked ? 'border-red-200 bg-red-50/20' : ''}`}>
            {/* Employee Header Row */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedEmployee(isExpanded ? null : assignment._id)}
            >
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{assignment.employee?.name}</h3>
                  <p className="text-sm text-gray-500">
                    {assignment.employee?.employeeCode} | {assignment.employee?.designation}
                    {assignment.manager && <span> | Manager: {assignment.manager.name}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={assignment.status} />
                {overallAverageScore != null && (
                  <span className="text-sm font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                    Avg: {overallAverageScore}
                  </span>
                )}
                {assignment.monthlyWeightedScore != null && (
                  <span className="text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                    Final: {assignment.monthlyWeightedScore}
                  </span>
                )}
                <div className="flex gap-1">
                  {canLock && (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmLock(assignment._id); }} className="btn-danger text-xs px-2 py-1">Lock</button>
                  )}
                  {canUnlock && (
                    <button onClick={(e) => { e.stopPropagation(); handleUnlock(assignment._id); }} className="btn-secondary text-xs px-2 py-1">Unlock</button>
                  )}
                </div>
                <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded KPI Table - All 3 columns + average */}
            {isExpanded && (
              <div className="mt-4">
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-44">KPI Title</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 w-16">Target</th>
                        <th className="px-3 py-2 text-center font-semibold text-gray-600 w-16">Weight</th>

                        {/* Column 1: Employee */}
                        <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 w-24">Emp Value</th>
                        <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 w-40">Emp Comment</th>

                        {/* Column 2: Manager */}
                        <th className="px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 w-24">Mgr Value</th>
                        <th className="px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 w-20">Mgr Score</th>
                        <th className="px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 w-40">Mgr Comment</th>

                        {/* Column 3: Admin */}
                        <th className="px-3 py-2 text-center font-semibold text-orange-700 bg-orange-50 w-24">Admin Value</th>
                        <th className="px-3 py-2 text-center font-semibold text-orange-700 bg-orange-50 w-20">Admin Score</th>
                        <th className="px-3 py-2 text-center font-semibold text-orange-700 bg-orange-50 w-40">Admin Comment</th>

                        {/* Column 4: Average */}
                        <th className="px-3 py-2 text-center font-semibold text-green-700 bg-green-100 w-24">Avg Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {items.map((item) => (
                        <tr key={item._id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium">{item.title}</div>
                            <div className="text-xs text-gray-400">{item.category} | {item.unit}</div>
                          </td>
                          <td className="px-3 py-2 text-center">{item.targetValue}</td>
                          <td className="px-3 py-2 text-center">{item.weightage}%</td>

                          {/* Employee (read-only) */}
                          <td className="px-3 py-2 text-center bg-blue-50/30 font-medium">
                            {item.employeeValue ?? '—'}
                          </td>
                          <td className="px-3 py-2 bg-blue-50/30 text-xs">{item.employeeComment || '—'}</td>

                          {/* Manager (read-only) */}
                          <td className="px-3 py-2 text-center bg-purple-50/30 font-medium">
                            {item.managerValue ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-center bg-purple-50/30">
                            {item.managerScore ?? '—'}
                          </td>
                          <td className="px-3 py-2 bg-purple-50/30 text-xs">{item.managerComment || '—'}</td>

                          {/* Admin (editable if canFinalReview) */}
                          <td className="px-3 py-2 bg-orange-50/30">
                            {canFinalReview ? (
                              <input
                                type="number"
                                value={adminInputs[item._id]?.finalValue ?? ''}
                                onChange={(e) => handleInputChange(item._id, 'finalValue', e.target.value)}
                                className="input-field text-center text-sm py-1"
                                placeholder="Value"
                              />
                            ) : (
                              <span className="font-medium">{item.finalValue ?? '—'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 bg-orange-50/30">
                            {canFinalReview ? (
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={adminInputs[item._id]?.finalScore ?? ''}
                                onChange={(e) => handleInputChange(item._id, 'finalScore', e.target.value)}
                                className="input-field text-center text-sm py-1"
                                placeholder="0-100"
                              />
                            ) : (
                              <span className="font-medium">{item.finalScore ?? '—'}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 bg-orange-50/30">
                            {canFinalReview ? (
                              <input
                                type="text"
                                value={adminInputs[item._id]?.finalComment ?? ''}
                                onChange={(e) => handleInputChange(item._id, 'finalComment', e.target.value)}
                                className="input-field text-sm py-1"
                                placeholder="Comment"
                              />
                            ) : (
                              <span className="text-xs">{item.finalComment || '—'}</span>
                            )}
                          </td>

                          {/* Average (auto-calculated) */}
                          <td className="px-3 py-2 text-center bg-green-100/40">
                            <span className="font-bold text-green-700 text-base">
                              {getLiveAverage(item) ?? '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action buttons */}
                <div className="mt-3 flex justify-end gap-2">
                  {canFinalReview && (
                    <button
                      onClick={() => handleFinalReview(assignment._id, items)}
                      disabled={submitting[assignment._id]}
                      className="btn-primary"
                    >
                      {submitting[assignment._id] ? 'Submitting...' : 'Submit Final Review'}
                    </button>
                  )}
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
