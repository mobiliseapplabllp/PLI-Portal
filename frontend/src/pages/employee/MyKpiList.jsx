import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignments } from '../../store/kpiSlice';
import { getAssignmentByIdApi, employeeSubmitApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import StatusBadge from '../../components/common/StatusBadge';
import FilterBar from '../../components/common/FilterBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { getMonthName, formatScore, formatDate } from '../../utils/formatters';
import { getCurrentFinancialYear, KPI_STATUS } from '../../utils/constants';
import toast from 'react-hot-toast';
import { HiChevronRight, HiChevronDown, HiOutlineExclamation } from 'react-icons/hi';

export default function MyKpiList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const { assignments, pagination, loading } = useSelector((state) => state.kpi);

  const [filters, setFilters] = useState(() => {
    const now = new Date();
    return {
      financialYear: getCurrentFinancialYear(now),
      month: String(now.getMonth() + 1),
      page: 1,
    };
  });

  // Track which row is expanded
  const [expandedId, setExpandedId] = useState(null);
  // Store fetched items per assignment id
  const [expandedData, setExpandedData] = useState({});
  // Loading state for expanded row
  const [expandLoading, setExpandLoading] = useState(null);
  // Inline form data keyed by assignment id -> item id -> { employeeValue, employeeComment }
  const [inlineForm, setInlineForm] = useState({});
  // Submitting state
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Always pass employee=self so managers see their OWN KPIs, not their team's
    dispatch(fetchAssignments({ ...filters, employee: user._id }));
  }, [dispatch, filters, user._id]);

  // Collapse expanded row when filters change
  useEffect(() => {
    setExpandedId(null);
    setExpandedData({});
    setInlineForm({});
  }, [filters]);

  const toggleExpand = useCallback(
    async (assignmentId) => {
      if (expandedId === assignmentId) {
        setExpandedId(null);
        return;
      }

      setExpandedId(assignmentId);

      // Already fetched
      if (expandedData[assignmentId]) {
        return;
      }

      setExpandLoading(assignmentId);
      try {
        const res = await getAssignmentByIdApi(assignmentId);
        const { assignment, items } = res.data.data;

        setExpandedData((prev) => ({
          ...prev,
          [assignmentId]: { assignment, items },
        }));

        // Initialize form data for this assignment's items
        const initial = {};
        items.forEach((item) => {
          initial[item._id] = {
            employeeValue: item.employeeValue ?? '',
            employeeComment: item.employeeComment ?? '',
          };
        });
        setInlineForm((prev) => ({ ...prev, [assignmentId]: initial }));
      } catch (err) {
        toast.error('Failed to load KPI details');
        setExpandedId(null);
      } finally {
        setExpandLoading(null);
      }
    },
    [expandedId, expandedData]
  );

  const handleInlineChange = (assignmentId, itemId, field, value) => {
    setInlineForm((prev) => ({
      ...prev,
      [assignmentId]: {
        ...prev[assignmentId],
        [itemId]: {
          ...prev[assignmentId]?.[itemId],
          [field]: value,
        },
      },
    }));
  };

  const handleInlineSubmit = async (assignmentId) => {
    const data = expandedData[assignmentId];
    if (!data) return;

    const items = data.items.map((item) => ({
      id: item._id,
      employeeValue: Number(inlineForm[assignmentId]?.[item._id]?.employeeValue),
      employeeComment: inlineForm[assignmentId]?.[item._id]?.employeeComment || '',
    }));

    if (items.some((i) => isNaN(i.employeeValue))) {
      toast.error('Please fill all actual values');
      return;
    }

    setSubmitting(true);
    try {
      await employeeSubmitApi(assignmentId, { items });
      toast.success('Self-assessment submitted successfully');
      // Refresh the list
      dispatch(fetchAssignments({ ...filters, employee: user._id }));
      // Clear expanded state for this assignment so it re-fetches with new status
      setExpandedId(null);
      setExpandedData((prev) => {
        const next = { ...prev };
        delete next[assignmentId];
        return next;
      });
      setInlineForm((prev) => {
        const next = { ...prev };
        delete next[assignmentId];
        return next;
      });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getWeightageColor = (totalWeightage) => {
    if (totalWeightage === 100) return 'text-green-600';
    if (totalWeightage < 100) return 'text-yellow-600';
    return 'text-red-600';
  };

  const columns = [
    { key: 'expand', label: '', width: '40px' },
    { key: 'period', label: 'Period' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'manager', label: 'Manager' },
    { key: 'assignedOn', label: 'Assigned On' },
    { key: 'totalWeightage', label: 'Weightage' },
    { key: 'status', label: 'Status' },
    { key: 'score', label: 'Score' },
  ];

  if (user?.kpiReviewApplicable === false) {
    return (
      <div>
        <PageHeader title="My KPIs" subtitle="View and submit your monthly KPI assessments" />
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 text-center">
          <HiOutlineExclamation className="w-8 h-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm text-amber-700 font-medium">KPI Review is not applicable for your role.</p>
          <p className="text-xs text-amber-600 mt-1">No KPI assessments are required. Contact your manager for details.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="My KPIs" subtitle="View and submit your monthly KPI assessments" />
      <FilterBar filters={filters} onChange={setFilters} showQuarter={false} />

      {loading ? (
        <LoadingSpinner />
      ) : !assignments || assignments.length === 0 ? (
        <EmptyState message="No KPI assignments found" />
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    style={col.width ? { width: col.width } : {}}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {assignments.map((row) => {
                const isExpanded = expandedId === row._id;
                const detail = expandedData[row._id];
                const isLoadingDetail = expandLoading === row._id;
                const canSubmit = row.status === KPI_STATUS.ASSIGNED;

                return (
                  <InlineExpandableRow
                    key={row._id}
                    row={row}
                    isExpanded={isExpanded}
                    isLoadingDetail={isLoadingDetail}
                    detail={detail}
                    canSubmit={canSubmit}
                    submitting={submitting}
                    inlineForm={inlineForm[row._id] || {}}
                    columns={columns}
                    getWeightageColor={getWeightageColor}
                    onToggleExpand={() => toggleExpand(row._id)}
                    onNavigate={() => navigate(`/employee/kpis/${row._id}`)}
                    onInlineChange={(itemId, field, value) =>
                      handleInlineChange(row._id, itemId, field, value)
                    }
                    onInlineSubmit={() => handleInlineSubmit(row._id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination pagination={pagination} onPageChange={(p) => setFilters({ ...filters, page: p })} />
    </div>
  );
}

/**
 * A single row + its expandable detail section
 */
function InlineExpandableRow({
  row,
  isExpanded,
  isLoadingDetail,
  detail,
  canSubmit,
  submitting,
  inlineForm,
  columns,
  getWeightageColor,
  onToggleExpand,
  onNavigate,
  onInlineChange,
  onInlineSubmit,
}) {
  return (
    <>
      {/* Main row */}
      <tr className="hover:bg-gray-50">
        {/* Expand chevron */}
        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand to see KPI items'}
          >
            {isExpanded ? (
              <HiChevronDown className="w-5 h-5 text-gray-500" />
            ) : (
              <HiChevronRight className="w-5 h-5 text-gray-500" />
            )}
          </button>
        </td>
        {/* Period - clickable to navigate */}
        <td
          className="px-4 py-3 text-sm text-primary-600 font-medium whitespace-nowrap cursor-pointer hover:underline"
          onClick={onNavigate}
        >
          {getMonthName(row.month)} {row.financialYear}
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.quarter}</td>
        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.manager?.name}</td>
        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
          {formatDate(row.createdAt)}
        </td>
        <td className="px-4 py-3 text-sm whitespace-nowrap">
          <span className={`font-semibold ${getWeightageColor(row.totalWeightage)}`}>
            {row.totalWeightage}%
          </span>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
          <StatusBadge status={row.status} />
        </td>
        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
          {formatScore(row.monthlyWeightedScore)}
        </td>
      </tr>

      {/* Expanded detail section */}
      {isExpanded && (
        <tr>
          <td colSpan={columns.length} className="px-0 py-0">
            <div className="bg-gray-50 border-t border-b border-gray-200 px-6 py-4">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                  <span className="ml-3 text-sm text-gray-500">Loading KPI items...</span>
                </div>
              ) : detail ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                            KPI Title
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                            Target
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                            Weight
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                            {canSubmit ? 'Your Value' : 'Employee Value'}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                            {canSubmit ? 'Your Comment' : 'Employee Comment'}
                          </th>
                          {/* Show review columns if reviewed */}
                          {detail.assignment.status !== KPI_STATUS.ASSIGNED && (
                            <>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Mgr Score
                              </th>
                              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                                Final Score
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {detail.items.map((item) => (
                          <tr key={item._id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">
                              <div className="font-medium">{item.title}</div>
                              {item.description && (
                                <div className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">
                                  {item.description}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
                              {item.targetValue} {item.unit}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
                              {item.weightage}%
                            </td>
                            <td className="px-3 py-2 text-sm whitespace-nowrap">
                              {canSubmit ? (
                                <input
                                  type="number"
                                  value={inlineForm[item._id]?.employeeValue ?? ''}
                                  onChange={(e) =>
                                    onInlineChange(item._id, 'employeeValue', e.target.value)
                                  }
                                  className="input-field w-28"
                                  placeholder="Value"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span className="text-gray-700">
                                  {item.employeeValue ?? '—'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm">
                              {canSubmit ? (
                                <input
                                  type="text"
                                  value={inlineForm[item._id]?.employeeComment ?? ''}
                                  onChange={(e) =>
                                    onInlineChange(item._id, 'employeeComment', e.target.value)
                                  }
                                  className="input-field w-44"
                                  placeholder="Comment"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <span className="text-gray-700">
                                  {item.employeeComment || '—'}
                                </span>
                              )}
                            </td>
                            {detail.assignment.status !== KPI_STATUS.ASSIGNED && (
                              <>
                                <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
                                  {formatScore(item.managerScore)}
                                </td>
                                <td className="px-3 py-2 text-sm text-green-600 font-medium whitespace-nowrap">
                                  {formatScore(item.finalScore)}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Submit button for assigned status */}
                  {canSubmit && (
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onInlineSubmit();
                        }}
                        disabled={submitting}
                        className="btn-primary text-sm"
                      >
                        {submitting ? 'Submitting...' : 'Submit Self-Assessment'}
                      </button>
                      <span className="text-xs text-gray-400">
                        Fill all values and click submit
                      </span>
                    </div>
                  )}

                  {/* Link to full detail page */}
                  <div className="mt-3 text-right">
                    <button
                      onClick={onNavigate}
                      className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
                    >
                      Open full detail view &rarr;
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 py-4 text-center">
                  Failed to load details. Click expand again to retry.
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
