import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { getTeamOverviewApi, managerReviewApi, reopenAssignmentApi, cloneKpisApi, bulkCloneKpisApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import TableSkeleton from '../../components/common/TableSkeleton';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';
import { getMonthName } from '../../utils/formatters';
import { MONTHS, QUARTER_MAP, KPI_STATUS, FINANCIAL_YEARS, getVisibleMonthOptions, getVisibleQuarters } from '../../utils/constants';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlinePencilAlt,
  HiOutlineDuplicate,
  HiOutlineSearch,
  HiOutlineX,
} from 'react-icons/hi';

/**
 * Helper: determine the current financial year and month
 */
function getCurrentFYAndMonth() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const financialYear = `${fyStart}-${String(fyStart + 1).slice(2)}`;
  return { financialYear, month };
}

export default function TeamKpiReviewTable() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';

  // Default to current month
  const defaults = useMemo(() => getCurrentFYAndMonth(), []);
  const visibleMonthOptions = useMemo(() => getVisibleMonthOptions(), []);
  const { visibleMonths, currentFY } = useMemo(() => getVisibleQuarters(), []);

  const [filters, setFilters] = useState({
    financialYear: defaults.financialYear,
    month: String(defaults.month),
  });
  const [teamData, setTeamData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [managerInputs, setManagerInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [reopenModal, setReopenModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewConfirm, setReviewConfirm] = useState(null); // { assignmentId, items, employeeName }

  // Clone modal state
  const [cloneModal, setCloneModal] = useState(null); // { sourceAssignmentId, sourceName, sourceMonth }
  const [cloneTarget, setCloneTarget] = useState({ mode: 'single', targetEmployee: '', targetMonth: '', targetFinancialYear: '' });
  const [cloneLoading, setCloneLoading] = useState(false);

  const selectedMonth = Number(filters.month);
  const selectedMonthName = getMonthName(selectedMonth);
  const selectedQuarter = QUARTER_MAP[selectedMonth] || '';

  const loadData = () => {
    if (!filters.financialYear || !filters.month) return;
    setLoading(true);
    getTeamOverviewApi(filters)
      .then((res) => {
        setTeamData(res.data.data || []);
        const inputs = {};
        (res.data.data || []).forEach((entry) => {
          (entry.items || []).forEach((item) => {
            inputs[item._id] = {
              managerValue: item.managerValue ?? '',
              managerScore: item.managerScore ?? '',
              managerComment: item.managerComment ?? '',
            };
          });
        });
        setManagerInputs(inputs);
      })
      .catch(() => toast.error('Failed to load team data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [filters.financialYear, filters.month]);

  const handleInputChange = (itemId, field, value) => {
    setManagerInputs((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleSubmitReview = async (assignmentId, items) => {
    const payload = items.map((item) => ({
      id: item._id,
      managerValue: Number(managerInputs[item._id]?.managerValue),
      managerScore: Number(managerInputs[item._id]?.managerScore),
      managerComment: managerInputs[item._id]?.managerComment || '',
    }));

    if (payload.some((i) => isNaN(i.managerValue) || isNaN(i.managerScore))) {
      toast.error('Please fill all manager values and scores (0-100)');
      return;
    }
    if (payload.some((i) => i.managerScore < 0 || i.managerScore > 100)) {
      toast.error('Scores must be between 0 and 100');
      return;
    }

    setSubmitting((prev) => ({ ...prev, [assignmentId]: true }));
    try {
      await managerReviewApi(assignmentId, { items: payload });
      toast.success('Manager review submitted');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting((prev) => ({ ...prev, [assignmentId]: false }));
    }
  };

  const handleReopen = async (assignmentId, targetStatus) => {
    try {
      await reopenAssignmentApi(assignmentId, targetStatus);
      toast.success('Assessment reopened successfully');
      setReopenModal(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Reopen failed');
    }
  };

  // ── Clone handlers ──
  const openCloneModal = (entry) => {
    setCloneModal({
      sourceAssignmentId: entry.assignment._id,
      sourceName: entry.employee.name,
      sourceMonth: getMonthName(Number(filters.month)),
    });
    setCloneTarget({
      mode: 'single',
      targetEmployee: '',
      targetMonth: filters.month,
      targetFinancialYear: filters.financialYear,
    });
  };

  const handleClone = async () => {
    if (!cloneModal) return;
    setCloneLoading(true);
    try {
      if (cloneTarget.mode === 'single') {
        if (!cloneTarget.targetEmployee) {
          toast.error('Select a target employee');
          setCloneLoading(false);
          return;
        }
        await cloneKpisApi({
          sourceAssignmentId: cloneModal.sourceAssignmentId,
          targetEmployeeId: cloneTarget.targetEmployee,
          targetMonth: Number(cloneTarget.targetMonth),
          targetFinancialYear: cloneTarget.targetFinancialYear,
        });
        toast.success('KPIs cloned successfully');
      } else {
        // Bulk clone to all team members without KPIs for that month
        const employeesWithoutKpis = teamData
          .filter((e) => !e.assignment && e.employee.kpiReviewApplicable !== false)
          .map((e) => e.employee._id);
        if (employeesWithoutKpis.length === 0) {
          toast.error('All team members already have KPIs for this month');
          setCloneLoading(false);
          return;
        }
        const result = await bulkCloneKpisApi({
          sourceAssignmentId: cloneModal.sourceAssignmentId,
          targetEmployeeIds: employeesWithoutKpis,
          targetMonth: Number(cloneTarget.targetMonth),
          targetFinancialYear: cloneTarget.targetFinancialYear,
        });
        const data = result.data.data;
        toast.success(`Cloned to ${data.success.length} employees. ${data.failed.length} failed.`);
      }
      setCloneModal(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Clone failed');
    } finally {
      setCloneLoading(false);
    }
  };

  // Stats
  const totalMembers = teamData.length;
  const withKpis = teamData.filter((e) => e.assignment).length;
  const withoutKpis = totalMembers - withKpis;
  const pendingReview = teamData.filter(
    (e) => e.assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED
  ).length;

  // Employees with assignments (for clone source selection in bulk mode)
  const employeesWithKpis = teamData.filter((e) => e.assignment);

  // Search/filter
  const filteredTeamData = useMemo(() => {
    if (!searchQuery.trim()) return teamData;
    const q = searchQuery.toLowerCase().trim();
    return teamData.filter((entry) => {
      const name = entry.employee.name?.toLowerCase() || '';
      const code = entry.employee.employeeCode?.toLowerCase() || '';
      return name.includes(q) || code.includes(q);
    });
  }, [teamData, searchQuery]);
  const isFiltered = searchQuery.trim().length > 0;

  return (
    <div>
      <PageHeader
        title="Team KPI Review"
        subtitle="Review and manage your team's monthly KPI assessments"
      />

      {/* ── Month Banner ── */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg px-5 py-3 mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary-800">
            {selectedMonthName} {filters.financialYear}
            <span className="ml-2 text-sm font-normal text-primary-600">({selectedQuarter})</span>
          </h2>
          <p className="text-sm text-primary-600">
            {totalMembers} team member{totalMembers !== 1 ? 's' : ''} &bull;{' '}
            {withKpis} with KPIs &bull;{' '}
            <span className={withoutKpis > 0 ? 'text-amber-600 font-medium' : ''}>
              {withoutKpis} without KPIs
            </span>
            {pendingReview > 0 && (
              <span className="ml-2 text-purple-600 font-medium">
                &bull; {pendingReview} pending your review
              </span>
            )}
          </p>
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or code..."
              className="input-field pl-8 pr-8 w-52 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>
          {isFiltered && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {filteredTeamData.length} of {teamData.length} shown
            </span>
          )}
          <select
            value={filters.financialYear}
            onChange={(e) => setFilters({ ...filters, financialYear: e.target.value })}
            className="input-field w-36 text-sm"
          >
            {FINANCIAL_YEARS.map((fy) => (
              <option key={fy} value={fy}>FY {fy}</option>
            ))}
          </select>
          <select
            value={filters.month}
            onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            className="input-field w-40 text-sm"
          >
            {visibleMonthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            onClick={loadData}
            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
            title="Refresh"
          >
            <HiOutlineRefresh className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && <TableSkeleton rows={5} columns={7} />}

      {/* ── Empty state ── */}
      {!loading && teamData.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">No team members found</p>
          <p className="text-gray-400 text-sm mt-1">
            Your team members will appear here once assigned to you in the system.
          </p>
        </div>
      )}

      {/* ── Team Member Cards ── */}
      {!loading &&
        filteredTeamData.map((entry) => {
          const { employee, assignment, items } = entry;
          const empId = employee._id;
          const isKpiApplicable = employee.kpiReviewApplicable !== false;
          const hasKpis = assignment !== null;
          const isExpanded = expandedEmployee === empId;
          const canReview = assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED;
          const isReviewed = ['manager_reviewed', 'final_reviewed', 'locked'].includes(
            assignment?.status
          );
          const canReopen =
            isAdmin &&
            assignment &&
            ['locked', 'final_reviewed', 'manager_reviewed'].includes(assignment.status);

          return (
            <div key={empId} className={`card mb-3 ${!isKpiApplicable ? 'opacity-60' : ''}`}>
              {/* ── Employee Header Row ── */}
              <div
                className={`flex items-center justify-between py-1 ${isKpiApplicable && hasKpis ? 'cursor-pointer' : ''}`}
                onClick={() => isKpiApplicable && hasKpis && setExpandedEmployee(isExpanded ? null : empId)}
              >
                <div className="flex items-center gap-4">
                  <span className="text-gray-400">
                    {hasKpis ? (
                      isExpanded ? (
                        <HiOutlineChevronDown className="w-5 h-5" />
                      ) : (
                        <HiOutlineChevronRight className="w-5 h-5" />
                      )
                    ) : (
                      <span className="w-5 h-5 inline-block" />
                    )}
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{employee.name}</h3>
                    <p className="text-sm text-gray-500">
                      {employee.employeeCode} &bull; {employee.designation}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {!isKpiApplicable ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-sm font-medium border border-gray-200">
                      Not Applicable
                    </span>
                  ) : hasKpis ? (
                    <>
                      <StatusBadge status={assignment.status} />
                      <span className="text-sm text-gray-500">
                        {items.length} KPIs &bull; Weightage: {assignment.totalWeightage}%
                      </span>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200">
                      No KPIs Defined
                    </span>
                  )}

                  {/* Quick actions — hidden for non-applicable employees */}
                  {isKpiApplicable && !hasKpis && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/manager/assign-kpis?employee=${empId}&month=${filters.month}&fy=${filters.financialYear}`);
                      }}
                      className="inline-flex items-center gap-1 btn-primary text-sm py-1.5 px-3"
                    >
                      <HiOutlinePlus className="w-4 h-4" />
                      Add KPIs
                    </button>
                  )}

                  {/* Clone button — only for assignments with KPI items */}
                  {isKpiApplicable && hasKpis && items.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openCloneModal(entry);
                      }}
                      className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded"
                      title="Clone these KPIs to another employee or month"
                    >
                      <HiOutlineDuplicate className="w-4 h-4" />
                      Clone
                    </button>
                  )}

                  {isKpiApplicable && canReview && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                      <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                      Needs Your Review
                    </span>
                  )}

                  {isKpiApplicable && canReopen && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReopenModal({ assignmentId: assignment._id, employeeName: employee.name });
                      }}
                      className="inline-flex items-center gap-1 text-sm text-amber-600 hover:text-amber-800 hover:bg-amber-50 px-2 py-1 rounded"
                      title="Reopen this assessment"
                    >
                      <HiOutlineRefresh className="w-4 h-4" />
                      Reopen
                    </button>
                  )}
                </div>
              </div>

              {/* ── Expanded KPI Table ── */}
              {isExpanded && hasKpis && (
                <div className="mt-4">
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 w-48">
                            KPI Title
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600 w-20">
                            Target
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-gray-600 w-20">
                            Weight
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 w-28">
                            Employee Value
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-blue-700 bg-blue-50 w-48">
                            Employee Comment
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 w-28">
                            Manager Value
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 w-24">
                            Manager Score
                          </th>
                          <th className="px-3 py-2 text-center font-semibold text-purple-700 bg-purple-50 w-48">
                            Manager Comment
                          </th>
                          {isReviewed && (
                            <>
                              <th className="px-3 py-2 text-center font-semibold text-emerald-700 bg-emerald-50 w-28">
                                Final Value
                              </th>
                              <th className="px-3 py-2 text-center font-semibold text-emerald-700 bg-emerald-50 w-24">
                                Final Score
                              </th>
                            </>
                          )}
                          <th className="px-3 py-2 text-center font-semibold text-green-700 bg-green-50 w-24">
                            Avg Result
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((item) => (
                          <tr key={item._id} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.title}</div>
                              <div className="text-xs text-gray-400">
                                {item.category} &bull; {item.unit}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">{item.targetValue}</td>
                            <td className="px-3 py-2 text-center">{item.weightage}%</td>

                            <td className="px-3 py-2 text-center bg-blue-50/30 font-medium">
                              {item.employeeValue ?? <span className="text-gray-300">&mdash;</span>}
                            </td>
                            <td className="px-3 py-2 bg-blue-50/30 text-xs text-gray-600">
                              {item.employeeComment || '—'}
                            </td>

                            <td className="px-3 py-2 bg-purple-50/30">
                              {canReview ? (
                                <input
                                  type="number"
                                  value={managerInputs[item._id]?.managerValue ?? ''}
                                  onChange={(e) =>
                                    handleInputChange(item._id, 'managerValue', e.target.value)
                                  }
                                  className="input-field text-center text-sm py-1"
                                  placeholder="Value"
                                />
                              ) : (
                                <span className="font-medium">
                                  {item.managerValue ?? '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 bg-purple-50/30">
                              {canReview ? (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={managerInputs[item._id]?.managerScore ?? ''}
                                  onChange={(e) =>
                                    handleInputChange(item._id, 'managerScore', e.target.value)
                                  }
                                  className="input-field text-center text-sm py-1"
                                  placeholder="0-100"
                                />
                              ) : (
                                <span className="font-medium">
                                  {item.managerScore ?? '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 bg-purple-50/30">
                              {canReview ? (
                                <input
                                  type="text"
                                  value={managerInputs[item._id]?.managerComment ?? ''}
                                  onChange={(e) =>
                                    handleInputChange(item._id, 'managerComment', e.target.value)
                                  }
                                  className="input-field text-sm py-1"
                                  placeholder="Comment"
                                />
                              ) : (
                                <span className="text-xs text-gray-600">
                                  {item.managerComment || '—'}
                                </span>
                              )}
                            </td>

                            {isReviewed && (
                              <>
                                <td className="px-3 py-2 text-center bg-emerald-50/30 font-medium">
                                  {item.finalValue ?? '—'}
                                </td>
                                <td className="px-3 py-2 text-center bg-emerald-50/30 font-medium">
                                  {item.finalScore ?? '—'}
                                </td>
                              </>
                            )}

                            <td className="px-3 py-2 text-center bg-green-50/30">
                              <span className="font-bold text-green-700">
                                {item.calculatedResult != null
                                  ? item.calculatedResult.toFixed(1)
                                  : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {canReview && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => setReviewConfirm({ assignmentId: assignment._id, items, employeeName: employee.name })}
                        disabled={submitting[assignment._id]}
                        className="btn-primary"
                      >
                        {submitting[assignment._id] ? 'Submitting...' : 'Submit Manager Review'}
                      </button>
                    </div>
                  )}

                  {assignment.monthlyWeightedScore != null && (
                    <div className="mt-3 text-right">
                      <span className="text-sm text-gray-500">Monthly Weighted Score: </span>
                      <span className="text-lg font-bold text-primary-700">
                        {assignment.monthlyWeightedScore.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      {/* ── Reopen Modal ── */}
      {reopenModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Reopen Assessment</h3>
            <p className="text-sm text-gray-600 mb-4">
              Reopen <strong>{reopenModal.employeeName}</strong>'s KPI assessment.
              Select the stage to revert to:
            </p>
            <div className="space-y-2">
              {[
                { status: 'assigned', label: 'Assigned', desc: 'Clears all submissions — employee must re-submit' },
                { status: 'employee_submitted', label: 'Employee Submitted', desc: 'Keeps employee values, clears manager & final reviews' },
                { status: 'manager_reviewed', label: 'Manager Reviewed', desc: 'Keeps employee & manager values, clears final review' },
                { status: 'final_reviewed', label: 'Final Reviewed', desc: 'Unlocks only — all data preserved' },
              ].map((opt) => (
                <button
                  key={opt.status}
                  onClick={() => handleReopen(reopenModal.assignmentId, opt.status)}
                  className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{opt.label}</div>
                  <div className="text-xs text-gray-500">{opt.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setReopenModal(null)}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clone KPI Modal ── */}
      {cloneModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Clone KPIs</h3>
            <p className="text-sm text-gray-600 mb-4">
              Clone KPI structure from <strong>{cloneModal.sourceName}</strong> ({cloneModal.sourceMonth})
            </p>

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setCloneTarget({ ...cloneTarget, mode: 'single' })}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  cloneTarget.mode === 'single'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Single Employee
              </button>
              <button
                onClick={() => setCloneTarget({ ...cloneTarget, mode: 'bulk' })}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  cloneTarget.mode === 'bulk'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                All Without KPIs ({withoutKpis})
              </button>
            </div>

            {cloneTarget.mode === 'single' && (
              <div className="mb-4">
                <label className="label-text">Target Employee</label>
                <select
                  value={cloneTarget.targetEmployee}
                  onChange={(e) => setCloneTarget({ ...cloneTarget, targetEmployee: e.target.value })}
                  className="input-field"
                >
                  <option value="">Select employee</option>
                  {teamData.map((e) => (
                    <option key={e.employee._id} value={e.employee._id}>
                      {e.employee.name} ({e.employee.employeeCode})
                      {e.assignment ? ` — ${e.assignment.status}` : ' — No KPIs'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {cloneTarget.mode === 'bulk' && (
              <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
                Will clone to <strong>{withoutKpis}</strong> team member{withoutKpis !== 1 ? 's' : ''} who
                don't have KPIs for the target month.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label-text">Target FY</label>
                <select
                  value={cloneTarget.targetFinancialYear}
                  onChange={(e) => setCloneTarget({ ...cloneTarget, targetFinancialYear: e.target.value })}
                  className="input-field"
                >
                  {FINANCIAL_YEARS.map((fy) => (
                    <option key={fy} value={fy}>FY {fy}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-text">Target Month</label>
                <select
                  value={cloneTarget.targetMonth}
                  onChange={(e) => setCloneTarget({ ...cloneTarget, targetMonth: e.target.value })}
                  className="input-field"
                >
                  {visibleMonthOptions.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setCloneModal(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleClone}
                disabled={cloneLoading}
                className="btn-primary inline-flex items-center gap-2"
              >
                <HiOutlineDuplicate className="w-4 h-4" />
                {cloneLoading ? 'Cloning...' : 'Clone KPIs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Manager Review Confirmation ── */}
      <ConfirmDialog
        open={!!reviewConfirm}
        title="Submit Manager Review"
        message={reviewConfirm ? `Are you sure you want to submit your review for ${reviewConfirm.employeeName}? This cannot be undone.` : ''}
        confirmText="Submit Review"
        onConfirm={() => {
          if (reviewConfirm) {
            handleSubmitReview(reviewConfirm.assignmentId, reviewConfirm.items);
          }
          setReviewConfirm(null);
        }}
        onCancel={() => setReviewConfirm(null)}
      />
    </div>
  );
}
