import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { getTeamOverviewApi, managerReviewApi, reviewCommitmentApi } from '../../api/kpiAssignments.api';
import { getDepartmentsApi } from '../../api/departments.api';
import { getUsersApi } from '../../api/users.api';
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
  QUARTER_MAP, KPI_STATUS, FINANCIAL_YEARS, ROLE_OPTIONS,
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
  HiOutlineCheck,
  // HiOutlineX,
} from 'react-icons/hi';

function getCurrentFYAndMonth() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return { financialYear: `${fyStart}-${String(fyStart + 1).slice(2)}`, month };
}

const ADMIN_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => !['admin', 'hr_admin', 'final_approver'].includes(r.value));

export default function TeamKpiReviewTable() {
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const isAdmin = user?.role === 'admin';

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
  // commitDecisions[assignmentId][itemId] = { approval: 'approved'|'rejected'|'', comment: '' }
  const [commitDecisions, setCommitDecisions] = useState({});

  // Admin-only: department / role / employee selectors
  const [departments, setDepartments] = useState([]);
  const [adminDept, setAdminDept] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [adminEmployee, setAdminEmployee] = useState('');
  const [adminEmployees, setAdminEmployees] = useState([]);

  const selectedMonth = Number(filters.month);
  const selectedMonthName = getMonthName(selectedMonth);
  const selectedQuarter = QUARTER_MAP[selectedMonth] || '';

  // Load departments for admin selector
  useEffect(() => {
    if (!isAdmin) return;
    getDepartmentsApi().then((r) => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  // Load employees when admin dept/role filter changes
  useEffect(() => {
    if (!isAdmin) return;
    setAdminEmployee('');
    if (!adminDept && !adminRole) { setAdminEmployees([]); return; }
    const params = { isActive: 'true', limit: 200 };
    if (adminDept) params.department = adminDept;
    if (adminRole) params.role = adminRole;
    getUsersApi(params).then((r) => setAdminEmployees(r.data.data || [])).catch(() => setAdminEmployees([]));
  }, [adminDept, adminRole]);

  const loadData = () => {
    if (!filters.financialYear || !filters.month) return;
    if (isAdmin && !adminEmployee) {
      setTeamData([]);
      return;
    }
    setLoading(true);
    const params = { ...filters };
    if (isAdmin && adminEmployee) params.employeeId = adminEmployee;
    getTeamOverviewApi(params)
      .then((res) => {
        setTeamData(res.data.data || []);
        const inputs = {};
        const commitInit = {};
        (res.data.data || []).forEach((entry) => {
          if (entry.assignment) {
            commitInit[entry.assignment._id] = {};
          }
          (entry.items || []).forEach((item) => {
            inputs[item._id] = {
              managerStatus: item.managerStatus ?? '',
              managerComment: item.managerComment ?? '',
            };
            if (entry.assignment) {
              commitInit[entry.assignment._id][item._id] = {
                approval: item.managerCommitmentApproval || '',
                comment: item.managerCommitmentComment || '',
              };
            }
          });
        });
        setManagerInputs(inputs);
        setCommitDecisions(commitInit);
      })
      .catch(() => toast.error('Failed to load team data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [filters.financialYear, filters.month, adminEmployee]);

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
      await managerReviewApi(assignmentId, payload);
      toast.success('Manager review submitted');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting((prev) => ({ ...prev, [assignmentId]: false }));
    }
  };

  const setCommitDecision = (assignmentId, itemId, field, value) => {
    setCommitDecisions((prev) => ({
      ...prev,
      [assignmentId]: {
        ...prev[assignmentId],
        [itemId]: { ...prev[assignmentId]?.[itemId], [field]: value },
      },
    }));
  };

  const handleSubmitCommitmentReview = async (assignmentId, items) => {
    const decisions = commitDecisions[assignmentId] || {};
    const allDecided = items.every((item) => {
      const d = decisions[item._id];
      return d?.approval === 'approved' || d?.approval === 'rejected';
    });
    if (!allDecided) {
      toast.error('Please approve or reject each KPI item first');
      return;
    }
    const payload = items.map((item) => ({
      id: item._id,
      approval: decisions[item._id]?.approval,
      comment: decisions[item._id]?.comment || '',
    }));
    setSubmitting((prev) => ({ ...prev, [assignmentId]: true }));
    try {
      await reviewCommitmentApi(assignmentId, payload);
      const hasRejections = payload.some((p) => p.approval === 'rejected');
      toast.success(hasRejections
        ? 'Review submitted — rejected items sent back to employee'
        : 'All KPIs approved — employee can submit self-assessment'
      );
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
  const pendingCommitmentApproval = teamData.filter(
    (e) => e.assignment?.status === KPI_STATUS.COMMITMENT_SUBMITTED
  ).length;
  const pendingReview = teamData.filter(
    (e) => e.assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED
  ).length;

  const filteredTeamData = useMemo(() => {
    if (isAdmin || !searchQuery.trim()) return teamData;
    const q = searchQuery.toLowerCase().trim();
    return teamData.filter((entry) => {
      const name = entry.employee.name?.toLowerCase() || '';
      const code = entry.employee.employeeCode?.toLowerCase() || '';
      return name.includes(q) || code.includes(q);
    });
  }, [teamData, searchQuery, isAdmin]);

  return (
    <div>
      <PageHeader
        title="Team KPI Review"
        subtitle="Review your team's monthly KPI assessments"
      />

      {/* Admin employee selector row */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-lg px-5 py-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">View Employee KPIs:</span>
          <select
            value={adminDept}
            onChange={(e) => setAdminDept(e.target.value)}
            className="input-field w-44 text-sm"
          >
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select
            value={adminRole}
            onChange={(e) => setAdminRole(e.target.value)}
            className="input-field w-40 text-sm"
          >
            <option value="">All Roles</option>
            {ADMIN_ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            value={adminEmployee}
            onChange={(e) => setAdminEmployee(e.target.value)}
            className="input-field w-56 text-sm"
            disabled={adminEmployees.length === 0}
          >
            <option value="">{adminEmployees.length === 0 ? 'Select dept or role first…' : 'Select employee…'}</option>
            {adminEmployees.map((e) => (
              <option key={e._id} value={e._id}>{e.name} ({e.employeeCode})</option>
            ))}
          </select>
        </div>
      )}

      {/* Month Banner */}
      <div className="bg-primary-50 border border-primary-200 rounded-lg px-5 py-3 mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-800">
            {selectedMonthName} {filters.financialYear}
            <span className="ml-2 text-sm font-normal text-primary-600">({selectedQuarter})</span>
          </h2>
          <p className="text-sm text-primary-600">
            {isAdmin && adminEmployee
              ? `Viewing: ${adminEmployees.find((e) => e._id === adminEmployee)?.name || 'Selected Employee'}`
              : `${totalMembers} team member${totalMembers !== 1 ? 's' : ''} • ${withKpis} with KPIs`
            }
            {!isAdmin && pendingCommitment > 0 && (
              <span className="ml-2 text-sky-600 font-medium">&bull; {pendingCommitment} awaiting commitment</span>
            )}
            {!isAdmin && pendingCommitmentApproval > 0 && (
              <span className="ml-2 text-teal-600 font-medium">&bull; {pendingCommitmentApproval} commitment{pendingCommitmentApproval !== 1 ? 's' : ''} to approve</span>
            )}
            {!isAdmin && pendingReview > 0 && (
              <span className="ml-2 text-purple-600 font-medium">&bull; {pendingReview} pending your review</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isAdmin && (
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
          )}
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

      {!loading && isAdmin && !adminEmployee && (
        <div className="card text-center py-16">
          <p className="text-gray-400 text-base">Select a department, role, and employee above to view KPIs</p>
        </div>
      )}

      {!loading && (!isAdmin || adminEmployee) && teamData.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-gray-400 text-lg">No KPI data found for the selected period</p>
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
        const awaitingCommitmentApproval = assignment?.status === KPI_STATUS.COMMITMENT_SUBMITTED;
        const commitmentApproved = assignment?.status === KPI_STATUS.COMMITMENT_APPROVED;

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
                {isKpiApplicable && awaitingCommitmentApproval && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                    <HiOutlinePencilAlt className="w-3.5 h-3.5" />
                    Needs Commitment Approval
                  </span>
                )}
                {isKpiApplicable && commitmentApproved && (
                  <span className="px-2 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                    Commitment Approved — Awaiting Achievement
                  </span>
                )}
              </div>
            </div>

            {/* Expanded KPI items */}
            {isExpanded && hasKpis && (
              <div className="mt-4 space-y-3 border-t pt-4">

                {/* Commitment review banner */}
                {awaitingCommitmentApproval && (
                  <div className="rounded-lg bg-teal-50 border border-teal-200 px-4 py-3">
                    <p className="text-sm font-semibold text-teal-800">Review Employee Commitment</p>
                    <p className="text-xs text-teal-600 mt-0.5">
                      {employee.name} has submitted their commitment plan for {getMonthName(selectedMonth)} {filters.financialYear}.
                      Review each item below and approve or reject the entire commitment.
                    </p>
                  </div>
                )}

                {items.map((item) => {
                  const id = item._id;
                  const inp = managerInputs[id] || {};
                  const cd = commitDecisions[assignment._id]?.[id] || {};
                  const isApproved = cd.approval === 'approved';
                  const isRejected = cd.approval === 'rejected';
                  const hasDeviation = item.employeeCommitmentStatus && item.employeeStatus
                    && item.employeeCommitmentStatus !== item.employeeStatus;

                  return (
                    <div key={id} className={`rounded-xl border p-4 space-y-3 ${
                      awaitingCommitmentApproval
                        ? isApproved ? 'border-green-300 bg-green-50/30'
                          : isRejected ? 'border-red-300 bg-red-50/30'
                          : 'border-gray-200 bg-gray-50'
                        : hasDeviation ? 'border-amber-300 bg-amber-50/30'
                        : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                          {awaitingCommitmentApproval && isApproved && (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                              <HiOutlineCheck className="w-3 h-3" /> Approved
                            </span>
                          )}
                          {awaitingCommitmentApproval && isRejected && (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                              <HiOutlineX className="w-3 h-3" /> Rejected
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0">Target: <b>{item.targetValue ?? '—'}</b></span>
                      </div>
                      <p className="text-xs text-gray-500 -mt-2">{item.category} · {item.unit} · Weightage: {item.weightage}%</p>

                      {/* Commitment plan + per-item approve/reject */}
                      {awaitingCommitmentApproval && (
                        <>
                          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                            <p className="text-xs font-semibold text-sky-700 mb-1">Commitment Plan</p>
                            {item.employeeCommitmentComment ? (
                              <p className="text-sm text-gray-700 italic">"{item.employeeCommitmentComment}"</p>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No notes provided.</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setCommitDecision(assignment._id, id, 'approval', isApproved ? '' : 'approved')}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all duration-150 ${
                                  isApproved
                                    ? 'bg-green-600 border-green-600 text-white'
                                    : 'bg-green-50 border-green-400 text-green-700 hover:bg-green-100'
                                }`}
                              >
                                <HiOutlineCheck className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button
                                onClick={() => setCommitDecision(assignment._id, id, 'approval', isRejected ? '' : 'rejected')}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-all duration-150 ${
                                  isRejected
                                    ? 'bg-red-600 border-red-600 text-white'
                                    : 'bg-red-50 border-red-400 text-red-700 hover:bg-red-100'
                                }`}
                              >
                                <HiOutlineX className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                            <input
                              type="text"
                              value={cd.comment || ''}
                              onChange={(e) => setCommitDecision(assignment._id, id, 'comment', e.target.value)}
                              className="input-field text-sm"
                              placeholder={isRejected ? 'Rejection reason (recommended)' : 'Comment (optional)'}
                            />
                          </div>
                        </>
                      )}

                      {/* Commitment vs Achievement (non-commitment phases) */}
                      {!awaitingCommitmentApproval && (item.employeeStatus || item.employeeCommitmentComment) && (
                        <CommitVsAchieveRow
                          commitmentComment={item.employeeCommitmentComment}
                          achievementStatus={item.employeeStatus}
                          achievementComment={item.employeeComment}
                        />
                      )}

                      {/* Legacy employee value */}
                      {item.employeeValue != null && !item.employeeStatus && (
                        <div className="flex items-center gap-2 text-xs bg-gray-100 rounded px-3 py-1.5">
                          <span className="bg-gray-200 text-gray-500 px-2 py-0.5 rounded">Legacy</span>
                          <span>Employee Value: {item.employeeValue}</span>
                        </div>
                      )}

                      {/* Manager assessment (non-commitment phases) */}
                      {!awaitingCommitmentApproval && (
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
                      )}
                    </div>
                  );
                })}

                {/* Submit commitment review */}
                {awaitingCommitmentApproval && (() => {
                  const decisions = commitDecisions[assignment._id] || {};
                  const decidedCount = items.filter((item) => {
                    const d = decisions[item._id];
                    return d?.approval === 'approved' || d?.approval === 'rejected';
                  }).length;
                  const allDecided = decidedCount === items.length;
                  const rejectedCount = items.filter((item) => decisions[item._id]?.approval === 'rejected').length;
                  return (
                    <div className="flex items-center gap-3 pt-2 border-t flex-wrap">
                      <button
                        onClick={() => handleSubmitCommitmentReview(assignment._id, items)}
                        disabled={submitting[assignment._id] || !allDecided}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                      >
                        <HiOutlineCheck className="w-4 h-4" />
                        {submitting[assignment._id] ? 'Submitting...' : `Submit Review (${decidedCount}/${items.length})`}
                      </button>
                      {!allDecided && (
                        <span className="text-xs text-amber-600">{items.length - decidedCount} item{items.length - decidedCount !== 1 ? 's' : ''} undecided</span>
                      )}
                      {allDecided && rejectedCount > 0 && (
                        <span className="text-xs text-red-600">{rejectedCount} rejected — employee will resubmit</span>
                      )}
                      {allDecided && rejectedCount === 0 && (
                        <span className="text-xs text-green-600">All approved — employee can proceed</span>
                      )}
                    </div>
                  );
                })()}

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
                    onClick={() => navigate(`/manager/review/${assignment._id}`)}
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
