import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { getTeamOverviewApi, managerReviewApi } from '../../api/kpiAssignments.api';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import TableSkeleton from '../../components/common/TableSkeleton';
import StatusSelector from '../../components/common/StatusSelector';
import CommitVsAchieveRow from '../../components/common/CommitVsAchieveRow';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';
import { getMonthName } from '../../utils/formatters';
import {
  QUARTER_MAP, KPI_STATUS, FINANCIAL_YEARS,
  getVisibleMonthOptions,
} from '../../utils/constants';
import {
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlinePencilAlt,
  HiOutlineSearch,
  HiOutlineX,
  HiOutlineExclamation,
} from 'react-icons/hi';

function getCurrentFYAndMonth() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return { financialYear: `${fyStart}-${String(fyStart + 1).slice(2)}`, month };
}

export default function TeamKpiReviewTable() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const defaults = useMemo(() => getCurrentFYAndMonth(), []);
  const visibleMonthOptions = useMemo(() => getVisibleMonthOptions(), []);

  const [filters, setFilters] = useState({
    financialYear: defaults.financialYear,
    month: String(defaults.month),
  });
  const [teamData, setTeamData] = useState([]);
  const [loading, setLoading] = useState(false);
  // managerInputs[itemId] = { managerStatus, managerComment }
  const [managerInputs, setManagerInputs] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewConfirm, setReviewConfirm] = useState(null); // { assignmentId, items, employeeName }

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
              managerStatus: item.managerStatus ?? '',
              managerComment: item.managerComment ?? '',
            };
          });
        });
        setManagerInputs(inputs);
      })
      .catch(() => toast.error('Failed to load team data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filters.financialYear, filters.month]);

  const handleInputChange = (itemId, field, value) => {
    setManagerInputs((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  };

  const handleSubmitReview = async (assignmentId, items) => {
    const payload = items.map((item) => ({
      id: item._id,
      managerStatus: managerInputs[item._id]?.managerStatus,
      managerComment: managerInputs[item._id]?.managerComment || '',
    }));

    if (payload.some((i) => !i.managerStatus)) {
      toast.error('Please select a status for all KPI items');
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

  // Stats
  const totalMembers = teamData.length;
  const withKpis = teamData.filter((e) => e.assignment).length;
  const withoutKpis = totalMembers - withKpis;
  const pendingCommitment = teamData.filter(
    (e) => e.assignment?.status === KPI_STATUS.ASSIGNED
  ).length;
  const pendingReview = teamData.filter(
    (e) => e.assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED
  ).length;

  const filteredTeamData = useMemo(() => {
    if (!searchQuery.trim()) return teamData;
    const q = searchQuery.toLowerCase().trim();
    return teamData.filter((entry) => {
      const name = entry.employee.name?.toLowerCase() || '';
      const code = entry.employee.employeeCode?.toLowerCase() || '';
      return name.includes(q) || code.includes(q);
    });
  }, [teamData, searchQuery]);

  return (
    <div>
      <PageHeader
        title="Team KPI Review"
        subtitle="Review your team's monthly KPI assessments"
      />

      {/* Month Banner */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg px-5 py-3 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-800">
            {selectedMonthName} {filters.financialYear}
            <span className="ml-2 text-sm font-normal text-primary-600">({selectedQuarter})</span>
          </h2>
          <p className="text-sm text-primary-600">
            {totalMembers} team member{totalMembers !== 1 ? 's' : ''} &bull; {withKpis} with KPIs
            {pendingCommitment > 0 && (
              <span className="ml-2 text-sky-600 font-medium">&bull; {pendingCommitment} awaiting commitment</span>
            )}
            {pendingReview > 0 && (
              <span className="ml-2 text-purple-600 font-medium">&bull; {pendingReview} pending your review</span>
            )}
          </p>
        </div>

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
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>
          <select
            value={filters.financialYear}
            onChange={(e) => setFilters({ ...filters, financialYear: e.target.value })}
            className="input-field w-36 text-sm"
          >
            {FINANCIAL_YEARS.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
          </select>
          <select
            value={filters.month}
            onChange={(e) => setFilters({ ...filters, month: e.target.value })}
            className="input-field w-40 text-sm"
          >
            {visibleMonthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button onClick={loadData} className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg" title="Refresh">
            <HiOutlineRefresh className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading && <TableSkeleton rows={5} columns={5} />}

      {!loading && teamData.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">No team members found</p>
        </div>
      )}

      {!loading && filteredTeamData.map((entry) => {
        const { employee, assignment, items } = entry;
        const empId = employee._id;
        const isKpiApplicable = employee.kpiReviewApplicable !== false;
        const hasKpis = assignment !== null;
        const isExpanded = expandedEmployee === empId;
        const canReview = assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED;
        const isReviewed = [KPI_STATUS.MANAGER_REVIEWED, KPI_STATUS.FINAL_APPROVED, 'final_reviewed', KPI_STATUS.LOCKED].includes(assignment?.status);
        const awaitingCommitment = assignment?.status === KPI_STATUS.ASSIGNED;
        const committedNotSubmitted = assignment?.status === KPI_STATUS.COMMITMENT_SUBMITTED;

        // Deviation count (commitment vs achievement)
        const deviationCount = (items || []).filter(
          (item) => item.employeeCommitmentStatus && item.employeeStatus
            && item.employeeCommitmentStatus !== item.employeeStatus
        ).length;

        return (
          <div key={empId} className={`card mb-3 ${!isKpiApplicable ? 'opacity-60' : ''}`}>
            {/* Employee Header */}
            <div
              className={`flex items-center justify-between py-1 ${isKpiApplicable && hasKpis ? 'cursor-pointer' : ''}`}
              onClick={() => isKpiApplicable && hasKpis && setExpandedEmployee(isExpanded ? null : empId)}
            >
              <div className="flex items-center gap-4">
                <span className="text-gray-400">
                  {hasKpis
                    ? isExpanded ? <HiOutlineChevronDown className="w-5 h-5" /> : <HiOutlineChevronRight className="w-5 h-5" />
                    : <span className="w-5 h-5 inline-block" />}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{employee.name}</h3>
                  <p className="text-sm text-gray-500">{employee.employeeCode} &bull; {employee.designation}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {!isKpiApplicable ? (
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-sm font-medium">Not Applicable</span>
                ) : hasKpis ? (
                  <>
                    <StatusBadge status={assignment.status} />
                    <span className="text-sm text-gray-500">{items.length} KPIs &bull; {assignment.totalWeightage}%</span>
                    {deviationCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                        <HiOutlineExclamation className="w-3 h-3" />
                        {deviationCount} deviation{deviationCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200">
                    No KPIs Defined
                  </span>
                )}

                {isKpiApplicable && !hasKpis && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/manager/assign-kpis?employee=${empId}&month=${filters.month}&fy=${filters.financialYear}`);
                    }}
                    className="inline-flex items-center gap-1 btn-primary text-sm py-1.5 px-3"
                  >
                    <HiOutlinePlus className="w-4 h-4" />
                    Assign KPIs
                  </button>
                )}

                {isKpiApplicable && canReview && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-medium">
                    <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                    Needs Your Review
                  </span>
                )}

                {isKpiApplicable && awaitingCommitment && (
                  <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-700 text-xs font-medium">
                    Awaiting Commitment
                  </span>
                )}
                {isKpiApplicable && committedNotSubmitted && (
                  <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium">
                    Committed — Awaiting Achievement
                  </span>
                )}
              </div>
            </div>

            {/* Expanded KPI items */}
            {isExpanded && hasKpis && (
              <div className="mt-4 space-y-3">
                {items.map((item) => {
                  const id = item._id;
                  const inp = managerInputs[id] || {};
                  const hasDeviation = item.employeeCommitmentStatus && item.employeeStatus
                    && item.employeeCommitmentStatus !== item.employeeStatus;

                  return (
                    <div key={id} className={`rounded-xl border p-4 space-y-3 ${hasDeviation ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                          <p className="text-xs text-gray-500">{item.category} · {item.unit} · Weightage: {item.weightage}%</p>
                        </div>
                        <span className="text-xs text-gray-500">Target: <b>{item.targetValue ?? '—'}</b></span>
                      </div>

                      {/* Commitment vs Achievement */}
                      <CommitVsAchieveRow
                        commitmentStatus={item.employeeCommitmentStatus}
                        commitmentComment={item.employeeCommitmentComment}
                        achievementStatus={item.employeeStatus}
                        achievementComment={item.employeeComment}
                      />

                      {/* Legacy employee value */}
                      {item.employeeValue != null && !item.employeeStatus && (
                        <div className="flex items-center gap-2 text-xs bg-gray-100 rounded px-3 py-1.5">
                          <span className="bg-gray-200 text-gray-500 px-2 py-0.5 rounded">Legacy</span>
                          <span>Employee Value: {item.employeeValue}</span>
                        </div>
                      )}

                      {/* Manager assessment */}
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-2">
                        <p className="text-xs font-semibold text-indigo-700 uppercase">Your Assessment</p>
                        {canReview ? (
                          <>
                            <StatusSelector
                              value={inp.managerStatus || ''}
                              onChange={(v) => handleInputChange(id, 'managerStatus', v)}
                              size="sm"
                            />
                            <input
                              type="text"
                              value={inp.managerComment || ''}
                              onChange={(e) => handleInputChange(id, 'managerComment', e.target.value)}
                              className="input-field text-sm"
                              placeholder="Optional comment"
                            />
                          </>
                        ) : isReviewed ? (
                          <div className="flex items-center gap-2">
                            {item.managerStatus && (
                              <span className="text-sm font-semibold text-indigo-700">{item.managerStatus}</span>
                            )}
                            {item.managerComment && (
                              <span className="text-xs text-gray-500 italic">"{item.managerComment}"</span>
                            )}
                            {item.managerScore != null && !item.managerStatus && (
                              <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded">
                                Legacy score: {item.managerScore}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-indigo-400">Assessment available once employee submits achievement.</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {canReview && (
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => setReviewConfirm({ assignmentId: assignment._id, items, employeeName: employee.name })}
                      disabled={submitting[assignment._id]}
                      className="btn-primary"
                    >
                      {submitting[assignment._id] ? 'Submitting...' : 'Submit Manager Review'}
                    </button>
                  </div>
                )}

                <div className="text-right">
                  <button
                    onClick={() => navigate(`/manager/team-review/${assignment._id}`)}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Open full review page →
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={!!reviewConfirm}
        title="Submit Manager Review"
        message={reviewConfirm ? `Submit your review for ${reviewConfirm.employeeName}? This cannot be undone.` : ''}
        confirmText="Submit Review"
        onConfirm={() => {
          if (reviewConfirm) handleSubmitReview(reviewConfirm.assignmentId, reviewConfirm.items);
          setReviewConfirm(null);
        }}
        onCancel={() => setReviewConfirm(null)}
      />
    </div>
  );
}
