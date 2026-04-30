import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  getTeamOverviewApi,
  getAssignmentByIdApi,
  reviewCommitmentApi,
  managerReviewApi,
  saveDraftApi,
} from '../../api/kpiAssignments.api';
import { getDepartmentsApi } from '../../api/departments.api';
import { getUsersApi } from '../../api/users.api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import WorkflowGuide from '../../components/common/WorkflowGuide';
import {
  getCurrentFinancialYear,
  KPI_STATUS,
  KPI_STATUS_LABELS,
  KPI_STATUS_COLORS,
  FINANCIAL_YEARS,
  KPI_HEADS,
  KPI_HEAD_LABELS,
  KPI_SUBMISSION_VALUES,
  ROLE_OPTIONS,
} from '../../utils/constants';
import { getMonthName } from '../../utils/formatters';
import toast from 'react-hot-toast';
import {
  HiOutlineClipboardList,
  HiOutlineRefresh,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineUserGroup,
  HiOutlineClipboardCheck,
  HiOutlineSave,
} from 'react-icons/hi';

const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const ADMIN_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => !['admin', 'hr_admin', 'final_approver'].includes(r.value));

const STATUS_ORDER = [
  KPI_STATUS.DRAFT,
  KPI_STATUS.ASSIGNED,
  KPI_STATUS.COMMITMENT_SUBMITTED,
  KPI_STATUS.COMMITMENT_APPROVED,
  KPI_STATUS.EMPLOYEE_SUBMITTED,
  KPI_STATUS.MANAGER_REVIEWED,
  KPI_STATUS.FINAL_APPROVED,
  KPI_STATUS.FINAL_REVIEWED,
  KPI_STATUS.LOCKED,
];
const statusRank = (s) => { const i = STATUS_ORDER.indexOf(s); return i === -1 ? 99 : i; };

const HEAD_STYLES = {
  Performance:     { active: 'border-violet-500 text-violet-700 bg-violet-50',   inactive: 'text-gray-500 hover:text-violet-600 hover:border-violet-300' },
  CustomerCentric: { active: 'border-blue-500 text-blue-700 bg-blue-50',          inactive: 'text-gray-500 hover:text-blue-600 hover:border-blue-300'   },
  CoreValues:      { active: 'border-emerald-500 text-emerald-700 bg-emerald-50', inactive: 'text-gray-500 hover:text-emerald-600 hover:border-emerald-300' },
  Trainings:       { active: 'border-amber-500 text-amber-700 bg-amber-50',       inactive: 'text-gray-500 hover:text-amber-600 hover:border-amber-300'  },
};

const SUBMIT_COLORS = {
  Meets:   'bg-blue-100 text-blue-700',
  Exceeds: 'bg-emerald-100 text-emerald-700',
  Below:   'bg-red-100 text-red-700',
};

export default function ManagerTeamKpi() {
  const { user } = useSelector((s) => s.auth);
  const now = new Date();
  const isAdmin = user?.role === 'admin';

  const [fy, setFy] = useState(getCurrentFinancialYear(now));
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const [teamData, setTeamData] = useState([]);
  const [items, setItems] = useState([]);
  // commitDecisions: { [itemId]: { approval: 'approved'|'rejected'|'', comment: '' } }
  const [commitDecisions, setCommitDecisions] = useState({});
  // mgrReviewMap: { [itemId]: { managerStatus: '', managerComment: '' } }
  const [mgrReviewMap, setMgrReviewMap] = useState({});

  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeHead, setActiveHead] = useState(KPI_HEADS[0]);

  // Admin-only: department / role / employee selectors
  const [adminDept, setAdminDept] = useState('');
  const [adminRole, setAdminRole] = useState('');
  const [departments, setDepartments] = useState([]);
  const [adminEmployees, setAdminEmployees] = useState([]);

  // Load departments for admin selector
  useEffect(() => {
    if (!isAdmin) return;
    getDepartmentsApi().then((r) => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  // Load employees when admin dept/role filter changes
  useEffect(() => {
    if (!isAdmin) return;
    setSelectedEmployeeId('');
    setTeamData([]);
    setItems([]);
    if (!adminDept && !adminRole) { setAdminEmployees([]); return; }
    const params = { isActive: 'true', limit: 200 };
    if (adminDept) params.department = adminDept;
    if (adminRole) params.role = adminRole;
    getUsersApi(params).then((r) => setAdminEmployees(r.data.data || [])).catch(() => setAdminEmployees([]));
  }, [adminDept, adminRole]);

  // Non-admin: load whole team when FY/month changes
  const loadTeamData = useCallback(async () => {
    setLoading(true);
    setItems([]);
    setCommitDecisions({});
    setMgrReviewMap({});
    try {
      const res = await getTeamOverviewApi({ financialYear: fy, month: selectedMonth });
      const raw = res.data.data || res.data;
      setTeamData(Array.isArray(raw) ? raw : []);
    } catch {
      toast.error('Failed to load team data');
      setTeamData([]);
    } finally {
      setLoading(false);
    }
  }, [fy, selectedMonth]);

  // Admin: load a specific employee's assignment when selection changes
  const loadAdminData = useCallback(async (empId) => {
    if (!empId) {
      setTeamData([]);
      setItems([]);
      setCommitDecisions({});
      setMgrReviewMap({});
      return;
    }
    setLoading(true);
    setItems([]);
    setCommitDecisions({});
    setMgrReviewMap({});
    try {
      const res = await getTeamOverviewApi({ financialYear: fy, month: selectedMonth, employeeId: empId });
      const raw = res.data.data || res.data;
      setTeamData(Array.isArray(raw) ? raw : []);
    } catch {
      toast.error('Failed to load employee data');
      setTeamData([]);
    } finally {
      setLoading(false);
    }
  }, [fy, selectedMonth]);

  useEffect(() => {
    if (!isAdmin) loadTeamData();
  }, [loadTeamData]);

  useEffect(() => {
    if (isAdmin) loadAdminData(selectedEmployeeId);
  }, [selectedEmployeeId, loadAdminData]);

  // Reset employee selection when FY/month changes
  useEffect(() => {
    setSelectedEmployeeId('');
    setItems([]);
  }, [fy, selectedMonth]);

  const selectedMember = teamData.find(
    (m) => String(m.employee?.id || m.employee?._id) === String(selectedEmployeeId)
  ) || null;
  const currentAssignment = selectedMember?.assignment || null;

  const fetchItems = useCallback(async (assignmentId, fallbackItems) => {
    if (!assignmentId) {
      setItems([]);
      setCommitDecisions({});
      setMgrReviewMap({});
      return;
    }
    setItemsLoading(true);
    try {
      const res = await getAssignmentByIdApi(assignmentId);
      const d = res.data.data || res.data;
      const fetched = d.items || [];
      initItemState(fetched);
    } catch {
      // Fallback: use items from team overview (lack kpiHead but still show commitment data)
      if (fallbackItems && fallbackItems.length > 0) {
        const mapped = fallbackItems.map((i) => ({ ...i, kpiHead: i.kpiHead || 'Performance' }));
        initItemState(mapped);
      } else {
        toast.error('Failed to load KPI items');
        setItems([]);
      }
    } finally {
      setItemsLoading(false);
    }
  }, []);  // eslint-disable-line

  function initItemState(fetched) {
    setItems(fetched);
    const cd = {};
    const mr = {};
    fetched.forEach((item) => {
      const id = item.id || item._id;
      // Commitment review: use managerCommitmentApproval / managerCommitmentComment
      cd[id] = {
        approval: item.managerCommitmentApproval || '',
        comment: item.managerCommitmentComment || '',
      };
      // Manager achievement review: use managerStatus / managerComment
      mr[id] = {
        managerStatus: item.managerStatus || '',
        managerComment: item.managerComment || '',
      };
    });
    setCommitDecisions(cd);
    setMgrReviewMap(mr);
    const firstHead = KPI_HEADS.find((h) => fetched.some((i) => (i.kpiHead || 'Performance') === h));
    if (firstHead) setActiveHead(firstHead);
  }

  useEffect(() => {
    const id = currentAssignment?.id || currentAssignment?._id;
    const fallback = selectedMember?.items || [];
    fetchItems(id || null, fallback);
  }, [currentAssignment, selectedMember, fetchItems]);

  const status = currentAssignment?.status;
  const rank = statusRank(status);

  // Action states — only these drive editability, not column visibility
  const isCommitReview = status === KPI_STATUS.COMMITMENT_SUBMITTED;
  const isMgrReview = status === KPI_STATUS.EMPLOYEE_SUBMITTED;

  // All columns always visible in manager view — data shows "—" when not yet filled
  const showCommitCol = true;
  const showCommitReviewCol = true;
  const showSelfReviewCol = true;
  const showMgrReviewCol = true;
  const showFinalCol = true;

  const headItems = items.filter((i) => (i.kpiHead || 'Performance') === activeHead);
  const headWt = (head) =>
    Math.round(items.filter((i) => (i.kpiHead || 'Performance') === head)
      .reduce((s, i) => s + Number(i.weightage || 0), 0) * 100) / 100;
  const headCount = (head) => items.filter((i) => (i.kpiHead || 'Performance') === head).length;
  const headItemsWeightTotal = Math.round(headItems.reduce((s, i) => s + Number(i.weightage || 0), 0) * 100) / 100;

  const updateCommitDecision = (itemId, field, value) =>
    setCommitDecisions((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [field]: value } }));

  const updateMgrReview = (itemId, field, value) =>
    setMgrReviewMap((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [field]: value } }));

  const handleSubmitCommitmentReview = async () => {
    const assignmentId = currentAssignment?.id || currentAssignment?._id;
    if (!assignmentId) return;

    const unapproved = items.find((item) => {
      const id = item.id || item._id;
      return !commitDecisions[id]?.approval;
    });
    if (unapproved) {
      toast.error('Please approve or reject every KPI item before submitting.');
      return;
    }

    const payload = items.map((item) => {
      const id = item.id || item._id;
      const d = commitDecisions[id] || {};
      return { id, approval: d.approval, comment: d.comment || '' };
    });

    setSubmitting(true);
    try {
      await reviewCommitmentApi(assignmentId, payload);
      toast.success('Commitment review submitted!');
      if (isAdmin) await loadAdminData(selectedEmployeeId); else await loadTeamData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit commitment review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitManagerReview = async () => {
    const assignmentId = currentAssignment?.id || currentAssignment?._id;
    if (!assignmentId) return;

    const missing = items.find((item) => {
      const id = item.id || item._id;
      return !mgrReviewMap[id]?.managerStatus;
    });
    if (missing) {
      toast.error('Please select a review status for every KPI item before submitting.');
      return;
    }

    const payload = items.map((item) => {
      const id = item.id || item._id;
      const m = mgrReviewMap[id] || {};
      return { id, managerStatus: m.managerStatus, managerComment: m.managerComment || '' };
    });

    setSubmitting(true);
    try {
      await managerReviewApi(assignmentId, payload);
      toast.success('Manager review submitted!');
      if (isAdmin) await loadAdminData(selectedEmployeeId); else await loadTeamData();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit manager review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveManagerDraft = async () => {
    const assignmentId = currentAssignment?.id || currentAssignment?._id;
    if (!assignmentId) return;
    const payload = items.map((item) => {
      const id = item.id || item._id;
      const m = mgrReviewMap[id] || {};
      return { id, managerStatus: m.managerStatus || '', managerComment: m.managerComment || '' };
    });
    setSubmitting(true);
    try {
      await saveDraftApi(assignmentId, payload);
      toast.success('Draft saved!');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save draft');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── Workflow guide ───────────────────────────────────────────────────── */}
      <WorkflowGuide status={currentAssignment?.status} />

      <div className="flex flex-col bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">

        {/* ── Toolbar ───────────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap min-w-0">
          <div className="flex items-center gap-3 flex-wrap">

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">FY Year</label>
              <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-field text-sm py-1.5 w-28">
                {FINANCIAL_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <span className="text-gray-300 text-lg hidden sm:block">›</span>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Month</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="input-field text-sm py-1.5 w-36"
              >
                {FY_MONTHS.map((m) => (
                  <option key={m} value={m}>{getMonthName(m)}</option>
                ))}
              </select>
            </div>

            <span className="text-gray-300 text-lg hidden sm:block">›</span>

            {/* Admin: department + role selectors */}
            {isAdmin && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Department</label>
                  <select value={adminDept} onChange={(e) => setAdminDept(e.target.value)} className="input-field text-sm py-1.5 w-36">
                    <option value="">All Depts</option>
                    {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <span className="text-gray-300 text-lg hidden sm:block">›</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Role</label>
                  <select value={adminRole} onChange={(e) => setAdminRole(e.target.value)} className="input-field text-sm py-1.5 w-32">
                    <option value="">All Roles</option>
                    {ADMIN_ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <span className="text-gray-300 text-lg hidden sm:block">›</span>
              </>
            )}

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Employee</label>
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="input-field text-sm py-1.5 w-52"
                disabled={loading || (isAdmin ? adminEmployees.length === 0 : teamData.length === 0)}
              >
                <option value="">
                  {isAdmin && adminEmployees.length === 0 ? '— Select dept / role first —' : '— Select Employee —'}
                </option>
                {isAdmin
                  ? adminEmployees.map((e) => (
                      <option key={e._id} value={e._id}>{e.name} ({e.employeeCode})</option>
                    ))
                  : teamData.map((m) => {
                      const emp = m.employee;
                      const empId = emp?.id || emp?._id;
                      const hasPending = m.assignment?.status === KPI_STATUS.COMMITMENT_SUBMITTED ||
                                         m.assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED;
                      return (
                        <option key={empId} value={empId}>
                          {emp?.name || 'Unknown'}{hasPending ? ' ●' : ''}
                        </option>
                      );
                    })
                }
              </select>
            </div>

            <button
              onClick={() => isAdmin ? loadAdminData(selectedEmployeeId) : loadTeamData()}
              disabled={loading}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 disabled:opacity-40"
              title="Refresh"
            >
              <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Status badge only */}
          {currentAssignment && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="w-px h-6 bg-gray-200 hidden sm:block" />
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${KPI_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                {KPI_STATUS_LABELS[status] || status}
              </span>
            </div>
          )}
        </div>

        {/* ── Status info banner ─────────────────────────────────────────────── */}
        {currentAssignment && (() => {
          if (isCommitReview) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-sky-50 text-sky-700 border-b border-sky-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-sky-400" />
              Employee has submitted commitment. Review each KPI item — approve or reject with a comment if needed.
            </div>
          );
          if (status === KPI_STATUS.COMMITMENT_APPROVED) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-amber-50 text-amber-700 border-b border-amber-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
              Commitment approved — awaiting employee self-review submission.
            </div>
          );
          if (isMgrReview) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-purple-50 text-purple-700 border-b border-purple-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400" />
              Employee has submitted self-review. Rate each KPI and submit your manager review.
            </div>
          );
          if (status === KPI_STATUS.MANAGER_REVIEWED) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-indigo-50 text-indigo-700 border-b border-indigo-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-400" />
              Manager review submitted — pending final approver sign-off.
            </div>
          );
          return null;
        })()}

        {/* ── Main content ──────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : !selectedEmployeeId ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <HiOutlineUserGroup className="h-14 w-14 text-gray-300" />
            <p className="text-base font-medium text-gray-500">
              {isAdmin ? 'Select a department, role and employee to view KPIs' : 'Select an employee to view their KPIs'}
            </p>
            <p className="text-sm text-gray-400">
              {isAdmin
                ? 'Use the Department and Role filters above to find an employee.'
                : 'Choose a financial year, month, and employee from the toolbar above.'}
            </p>
            {!isAdmin && teamData.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {teamData.filter((m) => m.assignment?.status === KPI_STATUS.COMMITMENT_SUBMITTED).length} pending commitment review
                {teamData.filter((m) => m.assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED).length > 0
                  ? `, ${teamData.filter((m) => m.assignment?.status === KPI_STATUS.EMPLOYEE_SUBMITTED).length} pending manager review`
                  : ''}
              </p>
            )}
          </div>
        ) : !currentAssignment ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <HiOutlineClipboardList className="h-14 w-14 text-gray-300" />
            <p className="text-base font-medium text-gray-500">
              No KPI assignment for {selectedMember?.employee?.name} in {getMonthName(selectedMonth)} {fy}
            </p>
            <p className="text-sm text-gray-400">An assignment will appear once HR Admin publishes a plan for this employee.</p>
          </div>
        ) : (
          <div>
            {/* Employee info strip */}
            <div className="bg-white border-b border-gray-100 px-6 py-2.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                {(selectedMember?.employee?.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-800">{selectedMember?.employee?.name}</span>
                {selectedMember?.employee?.designation && (
                  <span className="text-xs text-gray-400 ml-2">{selectedMember.employee.designation}</span>
                )}
                {selectedMember?.employee?.employeeCode && (
                  <span className="text-xs text-gray-400 ml-2">({selectedMember.employee.employeeCode})</span>
                )}
              </div>
            </div>

            {/* KPI Head Cards */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {KPI_HEADS.map((head) => {
                  const s = HEAD_STYLES[head];
                  const isActive = activeHead === head;
                  const wt = headWt(head);
                  const cnt = headCount(head);
                  return (
                    <button
                      key={head}
                      onClick={() => setActiveHead(head)}
                      className={`rounded-xl border-2 px-4 py-3 text-left transition-all cursor-pointer hover:shadow-md ${
                        isActive ? s.active + ' shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className={`text-xs font-semibold mb-1 ${isActive ? '' : 'text-gray-500'}`}>
                        {KPI_HEAD_LABELS[head]}
                      </div>
                      <div className={`text-2xl font-bold ${isActive ? '' : 'text-gray-700'}`}>{wt}%</div>
                      {cnt > 0 && (
                        <div className={`text-[10px] font-medium mt-0.5 ${isActive ? '' : 'text-gray-400'}`}>
                          {cnt} KPI{cnt !== 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* KPI Table */}
            <div className="p-4 overflow-x-auto">
              {itemsLoading ? (
                <div className="flex justify-center py-12"><LoadingSpinner /></div>
              ) : headItems.length === 0 ? (
                <div className="text-center py-14 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                  <HiOutlineClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p className="font-medium">No KPIs in {KPI_HEAD_LABELS[activeHead]}</p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
                      <th className="px-3 py-2.5 text-center w-10 border border-gray-200">#</th>
                      <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[200px]">KPI</th>
                      <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[160px]">Target Definition</th>
                      <th className="px-3 py-2.5 text-center border border-gray-200 w-16">Wt%</th>
                      <th className="px-3 py-2.5 text-center border border-gray-200 w-22 text-violet-600">Monthly Wt%</th>
                      {showCommitCol && (
                        <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[180px] text-blue-600">
                          Commitment Definition
                        </th>
                      )}
                      {showCommitReviewCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[170px] text-sky-600">
                          {isCommitReview ? 'Review Commitment' : 'Commit Decision'}
                        </th>
                      )}
                      {showSelfReviewCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[100px] text-amber-600">Self-Review</th>
                      )}
                      {showSelfReviewCol && (
                        <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[120px] text-amber-500">Review Note</th>
                      )}
                      {showMgrReviewCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[110px] text-purple-600">Mgr Status</th>
                      )}
                      {showMgrReviewCol && (
                        <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[140px] text-purple-500">Mgr Comment</th>
                      )}
                      {showFinalCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[110px] text-emerald-600">Final</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {headItems.map((item, idx) => {
                      const itemId = item.id || item._id;
                      const cd = commitDecisions[itemId] || {};
                      const mr = mgrReviewMap[itemId] || {};
                      return (
                        <tr key={itemId} className="border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors align-top">

                          {/* # */}
                          <td className="px-3 py-3 text-center text-gray-400 text-xs border border-gray-200">{idx + 1}</td>

                          {/* KPI */}
                          <td className="px-3 py-3 border border-gray-200">
                            <span className="font-medium text-gray-800 block">{item.title}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.category}</span>
                              <span className="text-[10px] text-gray-400">{item.unit}</span>
                            </div>
                          </td>

                          {/* Target Definition */}
                          <td className="px-3 py-3 border border-gray-200">
                            {item.description && (
                              <span className="text-xs text-gray-600 block mb-1">{item.description}</span>
                            )}
                            <div className="space-y-0.5">
                              {item.targetValue != null && (
                                <span className="text-xs text-gray-500 block">Target: <strong className="text-gray-700">{Number(item.targetValue)}</strong></span>
                              )}
                              {item.thresholdValue != null && (
                                <span className="text-xs text-gray-400 block">Min: {Number(item.thresholdValue)}</span>
                              )}
                              {item.stretchTarget != null && (
                                <span className="text-xs text-emerald-600 block">Stretch: {Number(item.stretchTarget)}</span>
                              )}
                            </div>
                          </td>

                          {/* Wt% */}
                          <td className="px-3 py-3 text-center border border-gray-200">
                            <span className="font-semibold text-gray-700">{item.weightage}%</span>
                          </td>

                          {/* Monthly Wt% */}
                          <td className="px-3 py-3 text-center border border-gray-200">
                            <span className="font-bold text-violet-600">
                              {(Number(item.weightage || 0) / 12).toFixed(2)}%
                            </span>
                          </td>

                          {/* Commitment Definition — employee's committed value + note */}
                          {showCommitCol && (
                            <td className="px-3 py-3 border border-gray-200">
                              {item.commitValue ? (
                                <span className="text-sm font-medium text-blue-700 block">{item.commitValue}</span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                              {item.employeeCommitmentComment && (
                                <span className="text-[11px] text-gray-500 block mt-0.5 italic">
                                  {item.employeeCommitmentComment}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Commit Review — Approve/Reject (editable when COMMITMENT_SUBMITTED) */}
                          {showCommitReviewCol && (
                            <td className="px-2 py-2 text-center border border-gray-200">
                              {isCommitReview ? (
                                <div className="flex flex-col gap-1.5 items-center">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => updateCommitDecision(itemId, 'approval', 'approved')}
                                      className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all ${
                                        cd.approval === 'approved'
                                          ? 'bg-emerald-500 text-white border-emerald-500'
                                          : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <HiOutlineCheckCircle className="w-3 h-3" />
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => updateCommitDecision(itemId, 'approval', 'rejected')}
                                      className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all ${
                                        cd.approval === 'rejected'
                                          ? 'bg-red-500 text-white border-red-500'
                                          : 'border-red-300 text-red-600 hover:bg-red-50'
                                      }`}
                                    >
                                      <HiOutlineXCircle className="w-3 h-3" />
                                      Reject
                                    </button>
                                  </div>
                                  {cd.approval === 'rejected' && (
                                    <input
                                      type="text"
                                      value={cd.comment || ''}
                                      onChange={(e) => updateCommitDecision(itemId, 'comment', e.target.value)}
                                      placeholder="Reason for rejection"
                                      className="input-field text-xs py-1 px-2 w-full"
                                    />
                                  )}
                                </div>
                              ) : (
                                // Read-only: show the stored managerCommitmentApproval
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${
                                  item.managerCommitmentApproval === 'approved'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : item.managerCommitmentApproval === 'rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : 'text-gray-400'
                                }`}>
                                  {item.managerCommitmentApproval
                                    ? item.managerCommitmentApproval.charAt(0).toUpperCase() + item.managerCommitmentApproval.slice(1)
                                    : '—'}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Self-Review Status (read-only) */}
                          {showSelfReviewCol && (
                            <td className="px-3 py-3 text-center border border-gray-200">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${
                                item.employeeStatus
                                  ? (SUBMIT_COLORS[item.employeeStatus] || 'bg-gray-100 text-gray-600')
                                  : 'text-gray-400'
                              }`}>
                                {item.employeeStatus || '—'}
                              </span>
                            </td>
                          )}

                          {/* Self-Review Note (read-only) */}
                          {showSelfReviewCol && (
                            <td className="px-3 py-3 border border-gray-200">
                              <span className="text-xs text-gray-500">{item.employeeComment || '—'}</span>
                            </td>
                          )}

                          {/* Manager Status — editable when EMPLOYEE_SUBMITTED */}
                          {showMgrReviewCol && (
                            <td className="px-2 py-2 text-center border border-gray-200">
                              {isMgrReview ? (
                                <select
                                  value={mr.managerStatus || ''}
                                  onChange={(e) => updateMgrReview(itemId, 'managerStatus', e.target.value)}
                                  className="input-field text-xs py-1.5 px-2 w-full"
                                >
                                  <option value="">Select…</option>
                                  {KPI_SUBMISSION_VALUES.map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${
                                  item.managerStatus
                                    ? (SUBMIT_COLORS[item.managerStatus] || 'bg-gray-100 text-gray-600')
                                    : 'text-gray-400'
                                }`}>
                                  {item.managerStatus || '—'}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Manager Comment — editable when EMPLOYEE_SUBMITTED */}
                          {showMgrReviewCol && (
                            <td className="px-2 py-2 border border-gray-200">
                              {isMgrReview ? (
                                <input
                                  type="text"
                                  value={mr.managerComment || ''}
                                  onChange={(e) => updateMgrReview(itemId, 'managerComment', e.target.value)}
                                  placeholder="Comment"
                                  className="input-field text-xs py-1.5 px-2 w-full"
                                />
                              ) : (
                                <span className="text-xs text-gray-500">{item.managerComment || '—'}</span>
                              )}
                            </td>
                          )}

                          {/* Final Approval */}
                          {showFinalCol && (
                            <td className="px-3 py-3 text-center border border-gray-200">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${
                                item.finalApproverStatus
                                  ? (SUBMIT_COLORS[item.finalApproverStatus] || 'bg-gray-100 text-gray-600')
                                  : 'text-gray-400'
                              }`}>
                                {item.finalApproverStatus || '—'}
                              </span>
                              {item.finalApproverAchievedWeightage != null && (
                                <div className="text-[10px] text-emerald-600 mt-0.5">
                                  {Number(item.finalApproverAchievedWeightage).toFixed(1)}% credited
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}

                    {/* Totals row */}
                    <tr className="bg-gray-50 font-semibold text-sm">
                      <td colSpan={3} className="px-3 py-2.5 text-right text-gray-600 border border-gray-200">
                        {KPI_HEAD_LABELS[activeHead]} Total:
                      </td>
                      <td className="px-2 py-2.5 text-center border border-gray-200">
                        <span className="font-bold text-base text-gray-800">{headItemsWeightTotal}%</span>
                      </td>
                      <td className="px-2 py-2.5 text-center border border-gray-200">
                        <span className="font-bold text-base text-violet-700">
                          {(headItemsWeightTotal / 12).toFixed(2)}%
                        </span>
                      </td>
                      {showCommitCol && <td className="border border-gray-200" />}
                      {showCommitReviewCol && <td className="border border-gray-200" />}
                      {showSelfReviewCol && <td colSpan={2} className="border border-gray-200" />}
                      {showMgrReviewCol && <td colSpan={2} className="border border-gray-200" />}
                      {showFinalCol && <td className="border border-gray-200" />}
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Bottom action bar */}
              {(isCommitReview || isMgrReview) && !itemsLoading && headItems.length > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 flex-wrap gap-3">
                  <p className="text-xs text-gray-400">
                    {isCommitReview
                      ? 'Approve or reject each commitment above — then submit your review for all items.'
                      : 'Select Meets / Exceeds / Below for each item, then submit your manager review.'}
                  </p>
                  <div className="flex items-center gap-2">
                    {isMgrReview && (
                      <button
                        onClick={handleSaveManagerDraft}
                        disabled={submitting}
                        className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting
                          ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                          : <HiOutlineSave className="w-4 h-4" />}
                        Save Draft
                      </button>
                    )}
                    {isCommitReview && (
                      <button
                        onClick={handleSubmitCommitmentReview}
                        disabled={submitting}
                        className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting
                          ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                          : <HiOutlineClipboardCheck className="w-4 h-4" />}
                        Submit Commitment Review
                      </button>
                    )}
                    {isMgrReview && (
                      <button
                        onClick={handleSubmitManagerReview}
                        disabled={submitting}
                        className="btn-success text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting
                          ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                          : <HiOutlineCheckCircle className="w-4 h-4" />}
                        Submit Manager Review
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
