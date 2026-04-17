import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignments } from '../../store/kpiSlice';
import { getAssignmentByIdApi, commitKpiApi, employeeSubmitApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import Pagination from '../../components/common/Pagination';
import StatusBadge from '../../components/common/StatusBadge';
import FilterBar from '../../components/common/FilterBar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import StatusSelector from '../../components/common/StatusSelector';
import CommitVsAchieveRow from '../../components/common/CommitVsAchieveRow';
import WorkflowStepper from '../../components/common/WorkflowStepper';
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

  const [expandedId, setExpandedId] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [expandLoading, setExpandLoading] = useState(null);
  // inlineForm[assignmentId][itemId] = { status, comment }
  const [inlineForm, setInlineForm] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchAssignments({ ...filters, employee: user._id }));
  }, [dispatch, filters, user._id]);

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

      if (expandedData[assignmentId]) return;

      setExpandLoading(assignmentId);
      try {
        const res = await getAssignmentByIdApi(assignmentId);
        const { assignment, items } = res.data.data;

        setExpandedData((prev) => ({ ...prev, [assignmentId]: { assignment, items } }));

        // Build initial form state per mode
        const isCommit = assignment.status === KPI_STATUS.ASSIGNED;
        const isAchieve = assignment.status === KPI_STATUS.COMMITMENT_SUBMITTED;

        const initial = {};
        items.forEach((item) => {
          initial[item._id] = {
            status: isCommit
              ? (item.employeeCommitmentStatus || '')
              : isAchieve
              ? (item.employeeStatus || '')
              : '',
            comment: isCommit
              ? (item.employeeCommitmentComment || '')
              : (item.employeeComment || ''),
          };
        });
        setInlineForm((prev) => ({ ...prev, [assignmentId]: initial }));
      } catch {
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
        [itemId]: { ...prev[assignmentId]?.[itemId], [field]: value },
      },
    }));
  };

  const handleInlineSubmit = async (assignmentId) => {
    const data = expandedData[assignmentId];
    if (!data) return;

    const form = inlineForm[assignmentId] || {};
    const isCommit = data.assignment.status === KPI_STATUS.ASSIGNED;
    const isAchieve = data.assignment.status === KPI_STATUS.COMMITMENT_SUBMITTED;

    if (!isCommit && !isAchieve) return;

    const items = data.items.map((item) => ({
      id: item._id,
      ...(isCommit
        ? {
            employeeCommitmentStatus: form[item._id]?.status,
            employeeCommitmentComment: form[item._id]?.comment || '',
          }
        : {
            employeeStatus: form[item._id]?.status,
            employeeComment: form[item._id]?.comment || '',
          }),
    }));

    const anyMissing = items.some((i) =>
      isCommit ? !i.employeeCommitmentStatus : !i.employeeStatus
    );
    if (anyMissing) {
      toast.error('Please select a status for all KPI items');
      return;
    }

    setSubmitting(true);
    try {
      if (isCommit) {
        await commitKpiApi(assignmentId, { items });
        toast.success('Commitment submitted');
      } else {
        await employeeSubmitApi(assignmentId, { items });
        toast.success('Achievement submitted');
      }
      dispatch(fetchAssignments({ ...filters, employee: user._id }));
      setExpandedId(null);
      setExpandedData((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
      setInlineForm((prev) => { const n = { ...prev }; delete n[assignmentId]; return n; });
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getWeightageColor = (w) => {
    if (w === 100) return 'text-green-600';
    if (w < 100) return 'text-yellow-600';
    return 'text-red-600';
  };

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
        <div className="space-y-3">
          {assignments.map((row) => {
            const isExpanded = expandedId === row._id;
            const detail = expandedData[row._id];
            const isLoadingDetail = expandLoading === row._id;

            const isCommit = row.status === KPI_STATUS.ASSIGNED;
            const isAchieve = row.status === KPI_STATUS.COMMITMENT_SUBMITTED;
            const canAct = isCommit || isAchieve;

            return (
              <div key={row._id} className="card">
                {/* Row header */}
                <div
                  className="flex items-center justify-between cursor-pointer py-1"
                  onClick={() => toggleExpand(row._id)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400">
                      {isExpanded
                        ? <HiChevronDown className="w-5 h-5" />
                        : <HiChevronRight className="w-5 h-5" />}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {getMonthName(row.month)} {row.financialYear}
                        <span className="ml-2 text-sm font-normal text-gray-500">({row.quarter})</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        Manager: {row.currentManager?.name || row.manager?.name || '—'} &bull; Assigned {formatDate(row.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {canAct && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isCommit ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isCommit ? 'Submit Commitment' : 'Submit Achievement'}
                      </span>
                    )}
                    <StatusBadge status={row.status} />
                    <span className={`text-sm font-semibold ${getWeightageColor(row.totalWeightage)}`}>
                      {row.totalWeightage}%
                    </span>
                    {row.monthlyWeightedScore != null && (
                      <span className="text-sm font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded">
                        {formatScore(row.monthlyWeightedScore)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="mt-4 border-t pt-4">
                    {isLoadingDetail ? (
                      <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
                      </div>
                    ) : detail ? (
                      <ExpandedDetail
                        assignment={detail.assignment}
                        items={detail.items}
                        form={inlineForm[row._id] || {}}
                        canAct={canAct}
                        isCommit={isCommit}
                        submitting={submitting}
                        onFormChange={(itemId, field, value) => handleInlineChange(row._id, itemId, field, value)}
                        onSubmit={() => handleInlineSubmit(row._id)}
                        onNavigate={() => navigate(`/employee/kpis/${row._id}`)}
                      />
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">Failed to load — click to retry.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <Pagination pagination={pagination} onPageChange={(p) => setFilters({ ...filters, page: p })} />
      </div>
    </div>
  );
}

function ExpandedDetail({ assignment, items, form, canAct, isCommit, submitting, onFormChange, onSubmit, onNavigate }) {
  const isReadOnly = !canAct;
  const isAchieve = !isCommit && canAct;

  // Progress bar
  const filled = items.filter((item) => form[item._id]?.status).length;
  const progressPct = items.length > 0 ? Math.round((filled / items.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Workflow stepper */}
      <WorkflowStepper status={assignment.status} />

      {/* Mode banner */}
      {canAct && (
        <div className={`rounded-lg border px-4 py-3 ${isCommit ? 'bg-primary-50 border-primary-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-sm font-medium ${isCommit ? 'text-primary-800' : 'text-amber-800'}`}>
            {isCommit
              ? `Commit to your targets for ${getMonthName(assignment.month)} ${assignment.financialYear}`
              : `Submit your actual achievement for ${getMonthName(assignment.month)} ${assignment.financialYear}`}
          </p>
          {items.length > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{filled} of {items.length} filled</span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full bg-white/70 rounded-full h-1.5 overflow-hidden border border-gray-200">
                <div
                  className={`h-full rounded-full transition-all ${isCommit ? 'bg-primary-500' : 'bg-amber-500'}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI items */}
      <div className="space-y-3">
        {items.map((item) => {
          const id = item._id;
          const fd = form[id] || {};

          return (
            <div key={id} className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              {/* Item header */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.category} · {item.unit} · Weightage: {item.weightage}%</p>
                </div>
                <span className="text-xs text-gray-500">Target: <b>{item.targetValue ?? '—'}</b></span>
              </div>

              {/* Achievement mode: show commitment context */}
              {isAchieve && (
                <CommitVsAchieveRow
                  commitmentStatus={item.employeeCommitmentStatus}
                  commitmentComment={item.employeeCommitmentComment}
                  achievementStatus={fd.status || null}
                  achievementComment={fd.comment || null}
                />
              )}

              {/* Read-only mode: 4-badge timeline */}
              {isReadOnly && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {item.employeeCommitmentStatus && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">
                      Committed: {item.employeeCommitmentStatus}
                    </span>
                  )}
                  {item.employeeStatus && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      Achieved: {item.employeeStatus}
                    </span>
                  )}
                  {item.managerStatus && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                      Manager: {item.managerStatus}
                    </span>
                  )}
                  {item.finalApproverStatus && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-medium">
                      Final: {item.finalApproverStatus}
                    </span>
                  )}
                  {/* Legacy fallback */}
                  {!item.employeeStatus && item.employeeValue != null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Legacy value: {item.employeeValue}
                    </span>
                  )}
                  {!item.managerStatus && item.managerScore != null && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Legacy mgr: {formatScore(item.managerScore)}
                    </span>
                  )}
                </div>
              )}

              {/* Editable form */}
              {canAct && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-600">
                    {isCommit ? 'I commit to achieving:' : 'I actually achieved:'}
                  </p>
                  <StatusSelector
                    value={fd.status || ''}
                    onChange={(v) => onFormChange(id, 'status', v)}
                    size="sm"
                  />
                  <input
                    type="text"
                    value={fd.comment || ''}
                    onChange={(e) => onFormChange(id, 'comment', e.target.value)}
                    className="input-field text-sm"
                    placeholder={isCommit ? 'Your plan to achieve this (optional)' : 'Notes / explanation (optional)'}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit button */}
      {canAct && (
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="btn-primary text-sm"
          >
            {submitting
              ? 'Submitting...'
              : isCommit
              ? 'Submit Commitment'
              : 'Submit Achievement'}
          </button>
          <span className="text-xs text-gray-400">
            {filled}/{items.length} items filled
          </span>
        </div>
      )}

      <div className="text-right">
        <button onClick={onNavigate} className="text-xs text-primary-600 hover:underline">
          Open full detail view →
        </button>
      </div>
    </div>
  );
}
