import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignmentDetail } from '../../store/kpiSlice';
import {
  managerReviewApi,
  reviewCommitmentApi,
  downloadEmployeeAttachmentApi,
  downloadManagerAttachmentApi,
} from '../../api/kpiAssignments.api';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';
import { KPI_STATUS, KPI_SUBMISSION_VALUES } from '../../utils/constants';
import { HiOutlineCheck, HiOutlineX, HiOutlinePaperClip, HiOutlineDownload } from 'react-icons/hi';

// Compact three-button status picker for manager rating
function StatusPicker({ value, onChange, disabled }) {
  const opts = [
    { v: 'Exceeds', label: 'Exceeds', active: 'bg-emerald-600 text-white border-emerald-600', idle: 'bg-white text-emerald-700 border-emerald-400 hover:bg-emerald-50' },
    { v: 'Meets', label: 'Meets', active: 'bg-sky-600 text-white border-sky-600', idle: 'bg-white text-sky-700 border-sky-400 hover:bg-sky-50' },
    { v: 'Below', label: 'Below', active: 'bg-rose-600 text-white border-rose-600', idle: 'bg-white text-rose-700 border-rose-400 hover:bg-rose-50' },
  ];
  return (
    <div className="flex gap-1">
      {opts.map(({ v, label, active, idle }) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === v ? '' : v)}
          className={`px-2 py-1 rounded border text-xs font-semibold transition-all ${value === v ? active : idle} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Read-only colored pill
function StatusChip({ value }) {
  if (!value) return <span className="text-xs text-gray-400">—</span>;
  const map = {
    Exceeds: 'bg-emerald-100 text-emerald-700',
    Meets: 'bg-sky-100 text-sky-700',
    Below: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${map[value] || 'bg-gray-100 text-gray-600'}`}>
      {value}
    </span>
  );
}

export default function ReviewTeamKpi() {
  const { assignmentId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentAssignment, currentItems, loading } = useSelector((state) => state.kpi);

  const [reviewForm, setReviewForm] = useState({});
  const [commitDecisions, setCommitDecisions] = useState({});
  const [managerFile, setManagerFile] = useState(null);
  const managerFileRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchAssignmentDetail(assignmentId));
  }, [dispatch, assignmentId]);

  useEffect(() => {
    if (currentItems.length > 0) {
      const reviewInit = {};
      const commitInit = {};
      currentItems.forEach((item) => {
        const id = item._id || item.id;
        reviewInit[id] = {
          managerStatus: item.managerStatus || '',
          managerComment: item.managerComment || '',
        };
        commitInit[id] = {
          approval: item.managerCommitmentApproval || '',
          comment: item.managerCommitmentComment || '',
        };
      });
      setReviewForm(reviewInit);
      setCommitDecisions(commitInit);
    }
  }, [currentItems]);

  const setReviewField = (id, field, value) =>
    setReviewForm((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const setCommitDecision = (id, field, value) =>
    setCommitDecisions((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  const status = currentAssignment?.status;
  const isCommitmentPending = status === KPI_STATUS.COMMITMENT_SUBMITTED;
  const canReview = status === KPI_STATUS.EMPLOYEE_SUBMITTED || status === KPI_STATUS.MANAGER_REVIEWED;
  const isReadOnly = !isCommitmentPending && !canReview;

  const decidedCount = currentItems.filter((item) => {
    const id = item._id || item.id;
    const d = commitDecisions[id]?.approval;
    return d === 'approved' || d === 'rejected';
  }).length;
  const allDecided = decidedCount === currentItems.length && currentItems.length > 0;
  const rejectedCount = currentItems.filter((item) => {
    const id = item._id || item.id;
    return commitDecisions[id]?.approval === 'rejected';
  }).length;

  const unfilledReview = currentItems.filter((item) => !reviewForm[item._id || item.id]?.managerStatus).length;

  const applyToAll = (s) => {
    const updated = {};
    currentItems.forEach((item) => {
      const id = item._id || item.id;
      updated[id] = { ...reviewForm[id], managerStatus: reviewForm[id]?.managerStatus || s };
    });
    setReviewForm(updated);
  };

  const handleSubmitReview = async () => {
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return { id, managerStatus: reviewForm[id]?.managerStatus, managerComment: reviewForm[id]?.managerComment || '' };
    });
    if (items.some((i) => !i.managerStatus)) {
      toast.error('Please select a rating for all KPI items');
      return;
    }
    setSubmitting(true);
    try {
      await managerReviewApi(assignmentId, items, managerFile || null);
      toast.success('Manager review submitted');
      navigate('/manager/team-review');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCommitmentReview = async () => {
    if (!allDecided) {
      toast.error('Please approve or reject each KPI item before submitting');
      return;
    }
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return { id, approval: commitDecisions[id]?.approval, comment: commitDecisions[id]?.comment || '' };
    });
    setSubmitting(true);
    try {
      await reviewCommitmentApi(assignmentId, items);
      toast.success(
        items.some((i) => i.approval === 'rejected')
          ? 'Review submitted — rejected items sent back to employee'
          : 'All KPIs approved — employee can now submit self-assessment'
      );
      dispatch(fetchAssignmentDetail(assignmentId));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadEmployeeAttachment = async () => {
    try {
      const res = await downloadEmployeeAttachmentApi(assignmentId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentAssignment.employeeAttachmentName || 'employee-attachment';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download attachment');
    }
  };

  const handleDownloadManagerAttachment = async () => {
    try {
      const res = await downloadManagerAttachmentApi(assignmentId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentAssignment.managerAttachmentName || 'manager-attachment';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download attachment');
    }
  };

  const totalWt = currentItems.reduce((s, i) => s + (Number(i.weightage) || 0), 0);

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (!currentAssignment) return <p className="text-gray-500">Assignment not found</p>;

  return (
    <div className="space-y-5">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/manager/dashboard' },
          { label: 'Team KPI Review', to: '/manager/team-review' },
          { label: currentAssignment.employee?.name || 'Review' },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {currentAssignment.employee?.name} —{' '}
            {isCommitmentPending ? 'Commitment Review' : canReview ? 'Achievement Review' : 'KPI Detail'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {getMonthName(currentAssignment.month)} {currentAssignment.financialYear} · Weightage: {currentAssignment.totalWeightage}%
          </p>
        </div>
        <StatusBadge status={currentAssignment.status} />
      </div>

      {/* Workflow stepper */}
      <div className="card py-4">
        <WorkflowStepper status={currentAssignment.status} />
      </div>

      {/* Commitment review info banner */}
      {isCommitmentPending && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4">
          <h2 className="text-base font-bold text-teal-800">Review Commitment</h2>
          <p className="text-sm text-teal-600 mt-1">
            {currentAssignment.employee?.name} has committed to {currentItems.length} KPI{currentItems.length !== 1 ? 's' : ''} for{' '}
            {getMonthName(currentAssignment.month)} {currentAssignment.financialYear}.
            Approve or reject each item, then submit.
          </p>
          {currentAssignment.commitmentRejectionComment && (
            <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <strong>Previous rejection:</strong> {currentAssignment.commitmentRejectionComment}
            </div>
          )}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-teal-700 mb-1">
              <span>
                {decidedCount} of {currentItems.length} decided
                {rejectedCount > 0 && <span className="ml-2 text-red-600">({rejectedCount} rejected)</span>}
              </span>
              <span>{currentItems.length > 0 ? Math.round((decidedCount / currentItems.length) * 100) : 0}%</span>
            </div>
            <div className="h-2 bg-teal-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${rejectedCount > 0 ? 'bg-red-500' : 'bg-teal-600'}`}
                style={{ width: `${currentItems.length > 0 ? (decidedCount / currentItems.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick-apply toolbar for achievement review */}
      {canReview && unfilledReview > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-indigo-600 font-medium">Quick-apply to unfilled ({unfilledReview}):</span>
          {KPI_SUBMISSION_VALUES.map((s) => (
            <button key={s} onClick={() => applyToAll(s)} className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* KPI Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide border-b border-gray-200">
                <th className="px-3 py-3 text-center w-10 border-r border-gray-200">#</th>
                <th className="px-3 py-3 text-left">KPI Title</th>
                <th className="px-3 py-3 text-center w-16 border-l border-gray-200">Wt%</th>

                {/* Commitment review columns */}
                {isCommitmentPending && <>
                  <th className="px-3 py-3 text-left border-l border-gray-200 w-32">Committed Value</th>
                  <th className="px-3 py-3 text-left border-l border-gray-200">Plan Notes</th>
                  <th className="px-3 py-3 text-center border-l border-gray-200 w-36">Decision</th>
                  <th className="px-3 py-3 text-left border-l border-gray-200">Comment</th>
                </>}

                {/* Achievement review columns */}
                {canReview && <>
                  <th className="px-3 py-3 text-left border-l border-gray-200 w-28">Committed</th>
                  <th className="px-3 py-3 text-center border-l border-gray-200 w-24">Self-Review</th>
                  <th className="px-3 py-3 text-left border-l border-gray-200">Employee Notes</th>
                  <th className="px-3 py-3 text-center border-l border-gray-200 w-44">Your Rating <span className="text-red-400 normal-case">*</span></th>
                  <th className="px-3 py-3 text-left border-l border-gray-200">Your Comment</th>
                </>}

                {/* Read-only columns */}
                {isReadOnly && <>
                  <th className="px-3 py-3 text-left border-l border-gray-200 w-28">Committed</th>
                  <th className="px-3 py-3 text-center border-l border-gray-200 w-24">Self-Review</th>
                  <th className="px-3 py-3 text-center border-l border-gray-200 w-24">Your Rating</th>
                  <th className="px-3 py-3 text-left border-l border-gray-200">Your Comment</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {currentItems.map((item, idx) => {
                const id = item._id || item.id;
                const rf = reviewForm[id] || {};
                const cd = commitDecisions[id] || {};
                const isApproved = cd.approval === 'approved';
                const isRejected = cd.approval === 'rejected';

                return (
                  <tr
                    key={id}
                    className={`border-b border-gray-100 transition-colors ${
                      isCommitmentPending
                        ? isApproved ? 'bg-green-50/40 hover:bg-green-50/60'
                        : isRejected ? 'bg-red-50/40 hover:bg-red-50/60'
                        : 'hover:bg-gray-50/40'
                        : 'hover:bg-gray-50/40'
                    }`}
                  >
                    {/* # */}
                    <td className="px-3 py-3 text-center text-xs text-gray-400 border-r border-gray-100 align-top">
                      {idx + 1}
                    </td>

                    {/* KPI Title */}
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-gray-900 leading-snug">{item.title}</p>
                      {item.category && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.category}{item.unit ? ` · ${item.unit}` : ''}</p>
                      )}
                    </td>

                    {/* Wt% */}
                    <td className="px-3 py-3 text-center text-xs font-semibold text-gray-700 border-l border-gray-100 align-top">
                      {item.weightage ?? '—'}%
                    </td>

                    {/* ─── Commitment review cells ─── */}
                    {isCommitmentPending && <>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        {item.commitValue
                          ? <span className="font-semibold text-sky-700">{item.commitValue}</span>
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100 max-w-xs">
                        {item.employeeCommitmentComment
                          ? <span className="text-gray-700 text-xs italic">"{item.employeeCommitmentComment}"</span>
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        <div className="flex gap-1.5 justify-center">
                          <button
                            onClick={() => setCommitDecision(id, 'approval', isApproved ? '' : 'approved')}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-semibold transition-all ${
                              isApproved
                                ? 'bg-green-600 border-green-600 text-white'
                                : 'bg-white border-green-400 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            <HiOutlineCheck className="w-3 h-3" /> OK
                          </button>
                          <button
                            onClick={() => setCommitDecision(id, 'approval', isRejected ? '' : 'rejected')}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border text-xs font-semibold transition-all ${
                              isRejected
                                ? 'bg-red-600 border-red-600 text-white'
                                : 'bg-white border-red-400 text-red-700 hover:bg-red-50'
                            }`}
                          >
                            <HiOutlineX className="w-3 h-3" /> Rej
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        <input
                          type="text"
                          value={cd.comment || ''}
                          onChange={(e) => setCommitDecision(id, 'comment', e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 placeholder-gray-400"
                          placeholder={isRejected ? 'Reason (recommended)' : 'Optional comment'}
                        />
                      </td>
                    </>}

                    {/* ─── Achievement review cells ─── */}
                    {canReview && <>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        {item.commitValue
                          ? <span className="text-xs font-semibold text-sky-700">{item.commitValue}</span>
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100 text-center">
                        <StatusChip value={item.employeeStatus} />
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100 max-w-xs">
                        {item.employeeComment
                          ? <span className="text-xs text-gray-600 italic">"{item.employeeComment}"</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        <StatusPicker
                          value={rf.managerStatus}
                          onChange={(v) => setReviewField(id, 'managerStatus', v)}
                        />
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        <textarea
                          rows={2}
                          value={rf.managerComment || ''}
                          onChange={(e) => setReviewField(id, 'managerComment', e.target.value)}
                          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-primary-400 placeholder-gray-400 resize-none min-w-[140px]"
                          placeholder="Optional comment (private)"
                        />
                      </td>
                    </>}

                    {/* ─── Read-only cells ─── */}
                    {isReadOnly && <>
                      <td className="px-3 py-3 align-top border-l border-gray-100">
                        {item.commitValue
                          ? <span className="text-xs font-semibold text-sky-700">{item.commitValue}</span>
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100 text-center">
                        <StatusChip value={item.employeeStatus} />
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100 text-center">
                        {item.managerStatus
                          ? <StatusChip value={item.managerStatus} />
                          : item.managerScore != null
                            ? <span className="text-xs text-gray-500">{formatScore(item.managerScore)}</span>
                            : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-3 py-3 align-top border-l border-gray-100 max-w-xs">
                        {item.managerComment
                          ? <span className="text-xs text-gray-600 italic">"{item.managerComment}"</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </>}
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr className="bg-gray-50 text-xs border-t border-gray-200">
                <td className="px-3 py-2 border-r border-gray-200" />
                <td className="px-3 py-2 text-right text-gray-500 font-medium">Total</td>
                <td className={`px-3 py-2 text-center font-bold border-l border-gray-200 ${totalWt === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {totalWt}%
                </td>
                {isCommitmentPending && <td colSpan={4} className="border-l border-gray-200" />}
                {canReview && <td colSpan={5} className="border-l border-gray-200" />}
                {isReadOnly && <td colSpan={4} className="border-l border-gray-200" />}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Employee attachment (visible to manager in achievement phase) */}
      {!isCommitmentPending && currentAssignment.hasEmployeeAttachment && (
        <div className="card flex items-center gap-3">
          <HiOutlinePaperClip className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">Employee's self-review attachment</p>
          </div>
          <button onClick={handleDownloadEmployeeAttachment} className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium">
            <HiOutlineDownload className="w-4 h-4" /> Download
          </button>
        </div>
      )}

      {/* Manager's own attachment (read-only view) */}
      {isReadOnly && currentAssignment.hasManagerAttachment && (
        <div className="card flex items-center gap-3">
          <HiOutlinePaperClip className="w-5 h-5 text-indigo-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">Your review attachment</p>
            {currentAssignment.managerAttachmentName && (
              <p className="text-xs text-gray-400">{currentAssignment.managerAttachmentName}</p>
            )}
          </div>
          <button onClick={handleDownloadManagerAttachment} className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
            <HiOutlineDownload className="w-4 h-4" /> Download
          </button>
        </div>
      )}

      {/* Submit commitment review */}
      {isCommitmentPending && (
        <div className="flex items-center gap-4 pt-1 flex-wrap">
          <button
            onClick={handleSubmitCommitmentReview}
            disabled={submitting || !allDecided}
            className="btn-primary"
          >
            {submitting ? 'Submitting…' : `Submit Review (${decidedCount}/${currentItems.length} decided)`}
          </button>
          {!allDecided && (
            <span className="text-sm text-amber-600">
              {currentItems.length - decidedCount} item{currentItems.length - decidedCount !== 1 ? 's' : ''} still need a decision.
            </span>
          )}
          {allDecided && rejectedCount > 0 && (
            <span className="text-sm text-red-600">
              {rejectedCount} item{rejectedCount !== 1 ? 's' : ''} will be rejected — employee must resubmit.
            </span>
          )}
          {allDecided && rejectedCount === 0 && (
            <span className="text-sm text-green-600">All items approved — employee can proceed.</span>
          )}
        </div>
      )}

      {/* Submit achievement review */}
      {canReview && (
        <div className="space-y-4 pt-1">
          {/* Manager attachment upload */}
          <div className="card space-y-2">
            <div className="flex items-center gap-2">
              <HiOutlinePaperClip className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Your review attachment{' '}
                <span className="text-gray-400 font-normal">(optional, private — visible to Final Approver only)</span>
              </span>
            </div>
            {currentAssignment.hasManagerAttachment && !managerFile && (
              <p className="text-xs text-gray-400 italic">An attachment already exists. Submitting again will replace it.</p>
            )}
            {managerFile ? (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
                <HiOutlinePaperClip className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="text-sm text-indigo-800 truncate flex-1">{managerFile.name}</span>
                <button
                  onClick={() => { setManagerFile(null); if (managerFileRef.current) managerFileRef.current.value = ''; }}
                  className="text-red-500 hover:text-red-700"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                <HiOutlinePaperClip className="w-4 h-4" />
                Attach file
                <input
                  ref={managerFileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setManagerFile(e.target.files[0] || null)}
                />
              </label>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmitReview} disabled={submitting} className="btn-primary">
              {submitting ? 'Submitting…' : 'Submit Manager Review'}
            </button>
            <button onClick={() => navigate('/manager/team-review')} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
