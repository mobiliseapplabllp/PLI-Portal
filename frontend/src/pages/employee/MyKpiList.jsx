import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  getAssignmentsApi,
  getAssignmentByIdApi,
  commitKpiApi,
  saveDraftApi,
  employeeSubmitApi,
} from '../../api/kpiAssignments.api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import {
  getCurrentFinancialYear,
  KPI_STATUS,
  KPI_STATUS_LABELS,
  KPI_STATUS_COLORS,
  FINANCIAL_YEARS,
  KPI_HEADS,
  KPI_HEAD_LABELS,
  KPI_SUBMISSION_VALUES,
} from '../../utils/constants';
import { getMonthName } from '../../utils/formatters';
import WorkflowGuide from '../../components/common/WorkflowGuide';
import toast from 'react-hot-toast';
import {
  HiOutlineExclamation,
  HiOutlineClipboardCheck,
  HiOutlineClipboardList,
  HiOutlineClock,
  HiOutlineRefresh,
  HiOutlineCheckCircle,
  HiOutlineSave,
  HiOutlineX,
} from 'react-icons/hi';

// Indian FY months in order: Apr → Mar
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

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

// Match admin HEAD_STYLES exactly
const HEAD_STYLES = {
  Performance:     { active: 'border-violet-500 text-violet-700 bg-violet-50',   inactive: 'text-gray-500 hover:text-violet-600 hover:border-violet-300',   badge: 'bg-violet-100 text-violet-700',   banner: 'from-violet-600 to-violet-700' },
  CustomerCentric: { active: 'border-blue-500 text-blue-700 bg-blue-50',          inactive: 'text-gray-500 hover:text-blue-600 hover:border-blue-300',        badge: 'bg-blue-100 text-blue-700',       banner: 'from-blue-600 to-blue-700'    },
  CoreValues:      { active: 'border-emerald-500 text-emerald-700 bg-emerald-50', inactive: 'text-gray-500 hover:text-emerald-600 hover:border-emerald-300',  badge: 'bg-emerald-100 text-emerald-700', banner: 'from-emerald-600 to-emerald-700' },
  Trainings:       { active: 'border-amber-500 text-amber-700 bg-amber-50',       inactive: 'text-gray-500 hover:text-amber-600 hover:border-amber-300',      badge: 'bg-amber-100 text-amber-700',     banner: 'from-amber-500 to-amber-600'  },
};

const SUBMIT_COLORS = {
  Meets:   'bg-blue-100 text-blue-700',
  Exceeds: 'bg-emerald-100 text-emerald-700',
  Below:   'bg-red-100 text-red-700',
};

export default function MyKpiList() {
  const { user } = useSelector((s) => s.auth);
  const now = new Date();

  const [fy, setFy] = useState(getCurrentFinancialYear(now));
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [assignments, setAssignments] = useState([]);
  const [items, setItems] = useState([]);
  const [editMap, setEditMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeHead, setActiveHead] = useState(KPI_HEADS[0]);

  const loadAssignments = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    try {
      const res = await getAssignmentsApi({ financialYear: fy, employee: user._id, limit: 12 });
      const raw = res.data.data;
      setAssignments(Array.isArray(raw) ? raw : (raw?.assignments || []));
    } catch {
      toast.error('Failed to load KPI assignments');
    } finally {
      setLoading(false);
    }
  }, [fy, user?._id]);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  const currentAssignment = assignments.find((a) => a.month === selectedMonth) || null;

  const fetchItems = useCallback(async (assignmentId) => {
    if (!assignmentId) { setItems([]); setEditMap({}); return; }
    setItemsLoading(true);
    try {
      const res = await getAssignmentByIdApi(assignmentId);
      const d = res.data.data || res.data;
      const fetched = d.items || [];
      setItems(fetched);
      const map = {};
      fetched.forEach((item) => {
        const id = item._id || item.id;
        map[id] = {
          commitValue: item.commitValue || '',
          employeeCommitmentComment: item.employeeCommitmentComment || '',
          employeeStatus: item.employeeStatus || '',
          employeeComment: item.employeeComment || '',
        };
      });
      setEditMap(map);
      const firstHead = KPI_HEADS.find((h) => fetched.some((i) => (i.kpiHead || 'Performance') === h));
      if (firstHead) setActiveHead(firstHead);
    } catch {
      toast.error('Failed to load KPI items');
      setItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(currentAssignment?._id);
  }, [currentAssignment?._id, fetchItems]);

  const status = currentAssignment?.status;
  const rank = statusRank(status);
  const canCommit = status === KPI_STATUS.ASSIGNED;
  const canSelfReview = status === KPI_STATUS.COMMITMENT_APPROVED;
  const showCommitCol = rank >= statusRank(KPI_STATUS.ASSIGNED);
  const showSelfReviewCol = rank >= statusRank(KPI_STATUS.COMMITMENT_APPROVED);
  const showManagerCol = rank >= statusRank(KPI_STATUS.EMPLOYEE_SUBMITTED);
  const showFinalCol = rank >= statusRank(KPI_STATUS.MANAGER_REVIEWED);

  const headItems = items.filter((i) => (i.kpiHead || 'Performance') === activeHead);

  // Weightage per head (matching admin's headWt display)
  const headWt = (head) =>
    Math.round(items.filter((i) => (i.kpiHead || 'Performance') === head).reduce((s, i) => s + Number(i.weightage || 0), 0) * 100) / 100;
  const headCount = (head) => items.filter((i) => (i.kpiHead || 'Performance') === head).length;
  const headItemsWeightTotal = Math.round(headItems.reduce((s, i) => s + Number(i.weightage || 0), 0) * 100) / 100;

  const pendingItems = assignments.filter((a) => a.status === KPI_STATUS.COMMITMENT_SUBMITTED);

  const updateEdit = (itemId, field, value) =>
    setEditMap((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [field]: value } }));

  const handleSubmitCommitment = async () => {
    const assignmentId = currentAssignment?._id;
    if (!assignmentId) return;

    const payload = items.map((item) => {
      const id = item._id || item.id;
      const e = editMap[id] || {};
      return {
        id,
        title: item.title,
        kpiHead: item.kpiHead || 'Performance',
        commitValue: e.commitValue || '',
        employeeCommitmentComment: e.employeeCommitmentComment || '',
      };
    });

    const blankItems = payload.filter((i) => !i.commitValue?.trim());
    if (blankItems.length > 0) {
      const byHead = {};
      blankItems.forEach((i) => {
        const head = i.kpiHead || 'Performance';
        if (!byHead[head]) byHead[head] = [];
        byHead[head].push(i.title);
      });
      toast(
        (t) => (
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-red-800 mb-1">
                Commitment Definition missing for {blankItems.length} KPI{blankItems.length > 1 ? 's' : ''}:
              </p>
              {Object.entries(byHead).map(([head, titles]) => (
                <div key={head} className="mt-0.5">
                  <span className="font-medium text-xs underline text-red-700">{KPI_HEAD_LABELS[head] || head}</span>
                  {titles.map((title) => <div key={title} className="ml-2 text-xs text-red-600">• {title}</div>)}
                </div>
              ))}
            </div>
            <button onClick={() => toast.dismiss(t.id)} className="flex-shrink-0 text-red-400 hover:text-red-600 mt-0.5">
              <HiOutlineX className="w-4 h-4" />
            </button>
          </div>
        ),
        { duration: Infinity, style: { background: '#fef2f2', border: '1px solid #fecaca' } }
      );
      return;
    }

    const cleanPayload = payload.map(({ id, commitValue, employeeCommitmentComment }) => ({ id, commitValue, employeeCommitmentComment }));
    setSubmitting(true);
    try {
      await commitKpiApi(assignmentId, cleanPayload);
      toast.success('Commitment submitted successfully!');
      await loadAssignments();
      await fetchItems(assignmentId);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit commitment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    const assignmentId = currentAssignment?._id;
    if (!assignmentId) return;
    const payload = items.map((item) => {
      const id = item._id || item.id;
      const e = editMap[id] || {};
      return canCommit
        ? { id, commitValue: e.commitValue || '', employeeCommitmentComment: e.employeeCommitmentComment || '' }
        : { id, employeeStatus: e.employeeStatus || '', employeeComment: e.employeeComment || '' };
    });
    setSubmitting(true);
    try {
      await saveDraftApi(assignmentId, payload);
      toast.success('Draft saved successfully!');
      await fetchItems(assignmentId);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save draft');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSelfReview = async () => {
    const assignmentId = currentAssignment?._id;
    if (!assignmentId) return;
    const missing = items.find((item) => !editMap[item._id || item.id]?.employeeStatus);
    if (missing) { toast.error('Please select self-review status for all KPI items'); return; }
    const payload = items.map((item) => {
      const id = item._id || item.id;
      const e = editMap[id] || {};
      return { id, employeeStatus: e.employeeStatus, employeeComment: e.employeeComment || '' };
    });
    setSubmitting(true);
    try {
      await employeeSubmitApi(assignmentId, payload);
      toast.success('Self-review submitted successfully!');
      await loadAssignments();
      await fetchItems(assignmentId);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to submit self-review');
    } finally {
      setSubmitting(false);
    }
  };

  if (user?.kpiReviewApplicable === false) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-6 py-8 text-center">
          <HiOutlineExclamation className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <p className="text-base font-semibold text-amber-800">KPI Review not applicable</p>
          <p className="text-sm text-amber-600 mt-1">No KPI assessments are required for your role. Contact your manager for details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Workflow guide ───────────────────────────────────────────────────── */}
      <WorkflowGuide status={status} />

      {/* ── Pending approval notice ──────────────────────────────────────────── */}
      {!loading && pendingItems.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-3 flex items-start gap-3">
          <HiOutlineClock className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-sky-800">
              {pendingItems.length === 1
                ? `${getMonthName(pendingItems[0].month)} commitment is awaiting manager approval`
                : `${pendingItems.length} commitments are awaiting manager approval`}
            </p>
            <p className="text-xs text-sky-600 mt-0.5">You will be notified once your manager approves or rejects.</p>
          </div>
        </div>
      )}

      {/* ── KPI Detail Panel (matches admin Edit KPI layout) ────────────────── */}
      <div className="flex flex-col bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">

        {/* Toolbar — FY, Month selectors + status badge + submit buttons */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap min-w-0">
          {/* Left: selectors */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Financial Year</label>
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
            <button
              onClick={loadAssignments}
              disabled={loading}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 disabled:opacity-40"
            >
              <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Right: status badge only */}
          {currentAssignment && (
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <span className="w-px h-6 bg-gray-200 hidden sm:block" />
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${KPI_STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
                {KPI_STATUS_LABELS[status] || status}
              </span>
              {currentAssignment.totalWeightage != null && (
                <span className="text-xs text-gray-500 whitespace-nowrap">
                  Monthly: <strong className="text-violet-600">{(Number(currentAssignment.totalWeightage) / 12).toFixed(2)}%</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Rejection banner */}
        {currentAssignment?.commitmentRejectionComment && (
          <div className="px-6 py-1.5 text-xs font-semibold flex items-center gap-2 bg-red-50 text-red-600 border-b border-red-100">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400" />
            Commitment rejected — {currentAssignment.commitmentRejectionComment}. Please revise and resubmit.
          </div>
        )}

        {/* Info banner based on status */}
        {currentAssignment && !currentAssignment.commitmentRejectionComment && (() => {
          if (status === KPI_STATUS.COMMITMENT_SUBMITTED) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-sky-50 text-sky-700 border-b border-sky-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-sky-400" />
              Commitment submitted — awaiting manager approval. You will be notified when reviewed.
            </div>
          );
          if (status === KPI_STATUS.COMMITMENT_APPROVED) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-amber-50 text-amber-700 border-b border-amber-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-400" />
              Commitment approved — for each KPI below, select <strong>Exceeds</strong>, <strong>Meets</strong>, or <strong>Below</strong>, then submit your self-review.
            </div>
          );
          if (status === KPI_STATUS.EMPLOYEE_SUBMITTED) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-purple-50 text-purple-700 border-b border-purple-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400" />
              Self-review submitted — awaiting manager review.
            </div>
          );
          if (status === KPI_STATUS.MANAGER_REVIEWED) return (
            <div className="px-6 py-1.5 text-xs font-medium flex items-center gap-2 bg-indigo-50 text-indigo-700 border-b border-indigo-100">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-indigo-400" />
              Manager review complete — pending final approver sign-off.
            </div>
          );
          return null;
        })()}

        {loading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : !currentAssignment ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
            <HiOutlineClipboardList className="h-14 w-14 text-gray-300" />
            <p className="text-base font-medium text-gray-500">No KPI assignment for {getMonthName(selectedMonth)} {fy}</p>
            <p className="text-sm text-gray-400">KPIs will appear here once your HR Admin publishes a plan for your department.</p>
          </div>
        ) : (
          <div>
            {/* ── KPI Head Cards (matches admin grid) ─────────────────────── */}
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
                      <div className={`text-2xl font-bold ${isActive ? '' : 'text-gray-700'}`}>
                        {wt}%
                      </div>
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

            {/* ── KPI Table ────────────────────────────────────────────────── */}
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
                      <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[220px]">KPI</th>
                      <th className="px-3 py-2.5 text-left border border-gray-200 min-w-[180px]">Target Definition</th>
                      <th className="px-3 py-2.5 text-center border border-gray-200 w-20">Wt%</th>
                      <th className="px-3 py-2.5 text-center border border-gray-200 w-24 text-violet-600">Monthly Wt%</th>
                      {showCommitCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[150px] text-blue-600">Commitment Definition</th>
                      )}
                      {showSelfReviewCol && canSelfReview && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[220px] text-amber-600" colSpan={2}>
                          Self-Review &amp; Note
                        </th>
                      )}
                      {showSelfReviewCol && !canSelfReview && (
                        <>
                          <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[110px] text-amber-600">Self-Review</th>
                          <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[110px] text-amber-500">Review Note</th>
                        </>
                      )}
                      {showManagerCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[100px] text-purple-600">Mgr Review</th>
                      )}
                      {showFinalCol && (
                        <th className="px-3 py-2.5 text-center border border-gray-200 min-w-[110px] text-emerald-600">Final Approval</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {headItems.map((item, idx) => {
                      const itemId = item._id || item.id;
                      const edit = editMap[itemId] || {};
                      return (
                        <tr key={itemId} className="border-b border-gray-200 bg-white hover:bg-gray-50 transition-colors align-top">
                          <td className="px-3 py-3 text-center text-gray-400 text-xs border border-gray-200">{idx + 1}</td>

                          {/* KPI column */}
                          <td className="px-3 py-3 border border-gray-200">
                            <span className="font-medium text-gray-800 block">{item.title}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{item.category}</span>
                              <span className="text-[10px] text-gray-400">{item.unit}</span>
                            </div>
                          </td>

                          {/* Target Definition column */}
                          <td className="px-3 py-3 border border-gray-200">
                            {item.description && (
                              <span className="text-sm text-gray-600 block mb-1">{item.description}</span>
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

                          {/* Wt% column */}
                          <td className="px-3 py-3 text-center border border-gray-200">
                            <span className="font-semibold text-gray-700">{item.weightage}%</span>
                          </td>

                          {/* Monthly Wt% column */}
                          <td className="px-3 py-3 text-center border border-gray-200">
                            <span className="font-bold text-violet-600">
                              {(Number(item.weightage || 0) / 12).toFixed(2)}%
                            </span>
                          </td>

                          {/* Commitment Value */}
                          {showCommitCol && (
                            <td className="px-2 py-2 text-center border border-gray-200">
                              {canCommit ? (
                                <input
                                  type="text"
                                  value={edit.commitValue || ''}
                                  onChange={(e) => updateEdit(itemId, 'commitValue', e.target.value)}
                                  placeholder="Commitment Definition"
                                  className="input-field text-xs py-1.5 px-2 w-full text-center"
                                />
                              ) : (
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block ${
                                  item.commitValue ? 'bg-blue-50 text-blue-700' : 'text-gray-400'
                                }`}>
                                  {item.commitValue || '—'}
                                </span>
                              )}
                            </td>
                          )}


                          {/* Self-Review Status + Note (combined cell when editable) */}
                          {showSelfReviewCol && (
                            <td className="px-2 py-2 text-center border border-gray-200" colSpan={canSelfReview ? 2 : 1}>
                              {canSelfReview ? (
                                <div className="flex flex-col gap-1.5 items-center">
                                  {/* Status dropdown */}
                                  <select
                                    value={edit.employeeStatus || ''}
                                    onChange={(e) => updateEdit(itemId, 'employeeStatus', e.target.value)}
                                    className="input-field text-xs py-1 px-2 w-full"
                                  >
                                    <option value="">-- Select Status --</option>
                                    <option value="Exceeds">Exceeds</option>
                                    <option value="Meets">Meets</option>
                                    <option value="Below">Below</option>
                                  </select>
                                  {/* Comment input */}
                                  <input
                                    type="text"
                                    value={edit.employeeComment || ''}
                                    onChange={(e) => updateEdit(itemId, 'employeeComment', e.target.value)}
                                    placeholder="Add a note (optional)"
                                    className="input-field text-xs py-1 px-2 w-full"
                                  />
                                </div>
                              ) : (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${
                                  item.employeeStatus
                                    ? (SUBMIT_COLORS[item.employeeStatus] || 'bg-gray-100 text-gray-600')
                                    : 'text-gray-400'
                                }`}>
                                  {item.employeeStatus || '—'}
                                </span>
                              )}
                            </td>
                          )}

                          {/* Self-Review Note — separate column only when read-only */}
                          {showSelfReviewCol && !canSelfReview && (
                            <td className="px-2 py-2 text-center border border-gray-200">
                              <span className="text-xs text-gray-500 block text-left">
                                {item.employeeComment || '—'}
                              </span>
                            </td>
                          )}

                          {/* Manager Review */}
                          {showManagerCol && (
                            <td className="px-3 py-3 text-center border border-gray-200">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${
                                item.managerStatus
                                  ? (SUBMIT_COLORS[item.managerStatus] || 'bg-gray-100 text-gray-600')
                                  : 'text-gray-400'
                              }`}>
                                {item.managerStatus || '—'}
                              </span>
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

                    {/* Head totals row — matches admin style */}
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
                      {showSelfReviewCol && <td colSpan={2} className="border border-gray-200" />}
                      {showManagerCol && <td className="border border-gray-200" />}
                      {showFinalCol && <td className="border border-gray-200" />}
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Bottom submit bar */}
              {(canCommit || canSelfReview) && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 flex-wrap gap-3">
                  <p className="text-xs text-gray-400">
                    {canCommit
                      ? 'Fill in your commitment definition. Save Draft to preserve progress, or Submit Commitment to send for manager approval.'
                      : 'Select status for all KPI items. Save Draft to preserve progress, or Submit Self-Review to finalise (cannot be changed after submission).'}
                  </p>
                  <div className="flex items-center gap-2">
                    {(canCommit || canSelfReview) && (
                      <button
                        onClick={handleSaveDraft}
                        disabled={submitting}
                        className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting
                          ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                          : <HiOutlineSave className="w-4 h-4" />}
                        Save Draft
                      </button>
                    )}
                    {canCommit && (
                      <button
                        onClick={handleSubmitCommitment}
                        disabled={submitting}
                        className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting
                          ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                          : <HiOutlineClipboardCheck className="w-4 h-4" />}
                        Submit Commitment
                      </button>
                    )}
                    {canSelfReview && (
                      <button
                        onClick={handleSubmitSelfReview}
                        disabled={submitting}
                        className="btn-success text-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting
                          ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                          : <HiOutlineCheckCircle className="w-4 h-4" />}
                        Submit Self-Review
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

