import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineXCircle,
  HiOutlineRefresh, HiOutlineClock, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlineExclamation,
} from 'react-icons/hi';
import {
  getApprovalDetailApi, approveDispatchApi, requestChangesApi, rejectDispatchApi,
} from '../../api/csat.api';
import Modal from '../../components/common/Modal';

const MODE_LABELS = { instant: 'Instant', scheduled: 'Scheduled', recurring: 'Recurring' };

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusChip({ status }) {
  const map = {
    pending: { label: 'Pending', cls: 'bg-yellow-100 text-yellow-700' },
    approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
    changes_requested: { label: 'Changes Requested', cls: 'bg-yellow-100 text-yellow-700' },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

export default function SurveyApprovalDetailPage() {
  const { approvalId } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const isAdmin = user?.role === 'admin';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recipientsOpen, setRecipientsOpen] = useState(false);

  // Action state
  const [actionModal, setActionModal] = useState(null); // 'approve' | 'changes' | 'reject'
  const [overallFeedback, setOverallFeedback] = useState('');
  const [questionFeedbacks, setQuestionFeedbacks] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getApprovalDetailApi(approvalId)
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load approval'))
      .finally(() => setLoading(false));
  }, [approvalId]);

  const approval = data?.approval;
  const dispatch = data?.dispatch;
  const survey = data?.survey;
  const questions = survey?.questions || [];
  const recipients = data?.recipients || [];
  const approvalHistory = data?.approvalHistory || [];

  const isPending = approval?.status === 'pending';
  const isOwner = approval?.requestedById === user?._id;

  // Compute hoursRemaining for deadline banner
  const hoursRemaining = approval?.approvalDeadline
    ? Math.floor((new Date(approval.approvalDeadline) - new Date()) / 3_600_000)
    : null;

  const handleAction = async () => {
    if (actionModal === 'reject' && !overallFeedback.trim()) {
      toast.error('A reason is required when rejecting');
      return;
    }
    setSubmitting(true);
    const feedbackArr = Object.entries(questionFeedbacks)
      .filter(([, fb]) => fb.trim())
      .map(([surveyQuestionId, feedback]) => ({ surveyQuestionId, feedback }));

    try {
      if (actionModal === 'approve') {
        await approveDispatchApi(approvalId, { overallFeedback: overallFeedback || undefined });
        toast.success('Dispatch approved');
      } else if (actionModal === 'changes') {
        await requestChangesApi(approvalId, { overallFeedback: overallFeedback || undefined, questionFeedbacks: feedbackArr });
        toast.success('Feedback sent to manager');
      } else if (actionModal === 'reject') {
        await rejectDispatchApi(approvalId, { overallFeedback, questionFeedbacks: feedbackArr });
        toast.success('Request rejected');
      }
      setActionModal(null);
      // Reload detail
      const res = await getApprovalDetailApi(approvalId);
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!data) return <div className="p-6 text-gray-500">Approval not found</div>;

  // Change diff banner
  const changeSummary = approval?.changeSummary || {};
  const hasChanges = Object.keys(changeSummary).length > 0;
  const changeLines = Object.entries(changeSummary).map(([k, v]) => {
    const fromVal = v.from != null ? String(v.from) : 'none';
    const toVal = v.to != null ? String(v.to) : 'none';
    return `${k}: ${fromVal} → ${toVal}`;
  });

  return (
    <div className="p-6 space-y-6 pb-32">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(isAdmin ? '/csat/approval-inbox' : '/csat/my-requests')}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0 mt-0.5"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-gray-900 truncate">{survey?.name || 'Survey'}</h1>
            {approval?.version > 1 && (
              <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full">v{approval.version}</span>
            )}
            <StatusChip status={approval?.status} />
          </div>
          <p className="text-sm text-gray-400 mt-0.5">
            Requested by {approval?.requestedBy?.name} · {fmt(approval?.submittedAt)}
          </p>
        </div>
      </div>

      {/* Change diff banner */}
      {hasChanges && approval?.version > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          <span className="font-semibold">What changed in v{approval.version}:</span>{' '}
          {changeLines.join(' · ')}
        </div>
      )}

      {/* Deadline urgency banner */}
      {isPending && hoursRemaining !== null && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          hoursRemaining < 0 ? 'bg-red-50 text-red-700 border border-red-200' :
          hoursRemaining < 4 ? 'bg-red-50 text-red-700 border border-red-200' :
          hoursRemaining < 24 ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
          'bg-gray-50 text-gray-600 border border-gray-200'
        }`}>
          <HiOutlineClock className="w-4 h-4 flex-shrink-0" />
          {hoursRemaining < 0
            ? 'Approval deadline has passed — this request will expire on next cron tick'
            : `Approval needed by ${fmt(approval.approvalDeadline)} — ${hoursRemaining}h remaining`
          }
        </div>
      )}

      {/* Already reviewed banner */}
      {!isPending && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          approval?.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          approval?.status === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-yellow-50 text-yellow-700 border border-yellow-200'
        }`}>
          {approval?.status === 'approved' ? <HiOutlineCheckCircle className="w-4 h-4" /> :
           approval?.status === 'rejected' ? <HiOutlineXCircle className="w-4 h-4" /> :
           <HiOutlineRefresh className="w-4 h-4" />}
          {approval?.status === 'approved' ? `Approved` :
           approval?.status === 'rejected' ? `Rejected` :
           `Changes Requested`} by {approval?.reviewedBy?.name} on {fmt(approval?.reviewedAt)}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {['summary', 'preview', 'feedback'].map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
              activeTab === t
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'preview' ? 'Survey Preview' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab: Summary */}
      {activeTab === 'summary' && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {[
                ['Survey', survey ? (
                  <span className="flex items-center gap-2">
                    <span className="text-gray-900">{survey.name}</span>
                    <a
                      href={`/csat/surveys/${survey.id}/preview`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline"
                    >
                      Preview →
                    </a>
                  </span>
                ) : '—'],
                ['Organisation', dispatch?.clientOrganisation?.name],
                ['Send Mode', MODE_LABELS[dispatch?.dispatchMode]],
                dispatch?.scheduledAt ? ['Scheduled At', fmt(dispatch.scheduledAt)] : null,
                dispatch?.expiresAt ? ['Expires', fmt(dispatch.expiresAt)] : null,
                dispatch?.reminderDays ? ['Reminder', `${dispatch.reminderDays} days after send`] : null,
                ['Email Subject', dispatch?.emailSubject],
                approval?.approvalDeadline ? ['Approval SLA', `Must act by ${fmt(approval.approvalDeadline)}`] : null,
              ].filter(Boolean).map(([label, value]) => (
                <tr key={label}>
                  <td className="px-5 py-3 text-gray-500 font-medium w-40">{label}</td>
                  <td className="px-5 py-3 text-gray-900">{value || '—'}</td>
                </tr>
              ))}
              <tr>
                <td className="px-5 py-3 text-gray-500 font-medium align-top">Recipients</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{(dispatch?.employeeIds || []).length} employees</span>
                    {recipients.length > 0 && (
                      <button
                        onClick={() => setRecipientsOpen(o => !o)}
                        className="text-emerald-600 text-xs font-medium hover:underline flex items-center gap-0.5"
                      >
                        {recipientsOpen ? <HiOutlineChevronUp className="w-3 h-3" /> : <HiOutlineChevronDown className="w-3 h-3" />}
                        {recipientsOpen ? 'Hide' : 'View list'}
                      </button>
                    )}
                  </div>
                  {recipientsOpen && (
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {recipients.map(r => (
                        <div key={r.id} className="text-xs text-gray-500">{r.name} · {r.email}</div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Survey Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-4">
          {questions.length === 0 ? (
            <p className="text-gray-400 text-sm">No questions found</p>
          ) : questions.map((q, i) => (
            <div key={q.id} className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Q{i + 1}</span>
                  <p className="font-semibold text-gray-900 mt-0.5">{q.questionText}</p>
                  {q.helperText && <p className="text-sm text-gray-400 mt-0.5">{q.helperText}</p>}
                </div>
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                  {q.questionType === 'rating' ? `Rating ${q.minValue}–${q.maxValue}` : q.questionType}
                </span>
              </div>
              {q.options && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(Array.isArray(q.options) ? q.options : JSON.parse(q.options || '[]')).map((opt, j) => (
                    <span key={j} className="text-xs bg-gray-50 border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg">{opt}</span>
                  ))}
                </div>
              )}
              {q.feedback && (
                <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
                  <span className="font-semibold">Admin note:</span> {q.feedback}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Feedback */}
      {activeTab === 'feedback' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Overall Feedback {actionModal === 'reject' && <span className="text-red-400">*</span>}
              <span className="text-gray-400 font-normal ml-1">(optional on approve / changes)</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={overallFeedback}
              onChange={e => setOverallFeedback(e.target.value)}
              disabled={!isPending || !isAdmin}
              placeholder="Your overall comment about this request..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="text-xs text-gray-400 text-right">{overallFeedback.length}/500</p>
          </div>

          {questions.map((q, i) => (
            <div key={q.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Q{i + 1} · {q.questionText}</span>
                <span className="text-xs bg-white border border-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{q.questionType}</span>
              </div>
              <div className="px-4 py-3">
                {q.feedback && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2 mb-2">
                    Previous note: {q.feedback}
                  </p>
                )}
                <textarea
                  rows={2}
                  maxLength={500}
                  value={questionFeedbacks[q.id] || ''}
                  onChange={e => setQuestionFeedbacks(prev => ({ ...prev, [q.id]: e.target.value }))}
                  disabled={!isPending || !isAdmin}
                  placeholder="Note about this question (optional)..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <p className="text-xs text-gray-400 text-right">{(questionFeedbacks[q.id] || '').length}/500</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval History */}
      {approvalHistory.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Approval History ({approvalHistory.length} version{approvalHistory.length > 1 ? 's' : ''})
            {historyOpen ? <HiOutlineChevronUp className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
          </button>
          {historyOpen && (
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {approvalHistory.map(h => (
                <div key={h.id} className="px-5 py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">v{h.version}</span>
                    <span className="text-xs text-gray-400">Submitted {fmt(h.submittedAt)}</span>
                    {h.reviewedBy && (
                      <StatusChip status={h.status} />
                    )}
                    {h.reviewedBy && (
                      <span className="text-xs text-gray-400">by {h.reviewedBy.name} · {fmt(h.reviewedAt)}</span>
                    )}
                  </div>
                  {h.overallFeedback && (
                    <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{h.overallFeedback}</p>
                  )}
                  {h.feedbacks?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {h.feedbacks.map(fb => (
                        <p key={fb.id} className="text-xs text-gray-500 pl-3 border-l-2 border-gray-200">{fb.feedback}</p>
                      ))}
                    </div>
                  )}
                  {h.changeSummary && Object.keys(h.changeSummary).length > 0 && (
                    <div className="mt-2 text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-1.5">
                      Changes: {Object.entries(h.changeSummary).map(([k, v]) => `${k}: ${v.from} → ${v.to}`).join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sticky Action Bar — admin only, pending only */}
      {isAdmin && isPending && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3 z-30">
          <button
            onClick={() => { setActiveTab('feedback'); setActionModal('changes'); }}
            className="px-5 py-2.5 text-sm font-semibold text-yellow-700 border border-yellow-300 bg-yellow-50 rounded-xl hover:bg-yellow-100 transition-colors"
          >
            Request Changes
          </button>
          <button
            onClick={() => { setActiveTab('feedback'); setActionModal('reject'); }}
            className="px-5 py-2.5 text-sm font-semibold text-red-700 border border-red-300 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => setActionModal('approve')}
            className="px-6 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            ✓ Approve
          </button>
        </div>
      )}

      {/* Confirm Modal */}
      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={
          actionModal === 'approve' ? 'Confirm Approval' :
          actionModal === 'changes' ? 'Request Changes' :
          'Reject Request'
        }
      >
        <div className="space-y-4">
          {actionModal === 'approve' && (
            <p className="text-sm text-gray-600">
              This will immediately fire/queue the dispatch to{' '}
              <strong>{(dispatch?.employeeIds || []).length} recipients</strong>.
              {overallFeedback && <span className="block mt-2 bg-gray-50 rounded-lg px-3 py-2 text-gray-700">"{overallFeedback}"</span>}
            </p>
          )}
          {actionModal === 'changes' && (
            <p className="text-sm text-gray-600">
              Manager will be notified to revise and resubmit. Request stays open.
            </p>
          )}
          {actionModal === 'reject' && (
            <>
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <HiOutlineExclamation className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">This permanently closes this request. Manager must create a new one.</p>
              </div>
              {!overallFeedback.trim() && (
                <p className="text-xs text-red-500">Overall feedback is required to reject.</p>
              )}
            </>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={() => setActionModal(null)}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAction}
              disabled={submitting || (actionModal === 'reject' && !overallFeedback.trim())}
              className={`px-5 py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-colors ${
                actionModal === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                actionModal === 'changes' ? 'bg-yellow-600 hover:bg-yellow-700' :
                'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {submitting ? 'Processing...' :
               actionModal === 'approve' ? 'Confirm Approve' :
               actionModal === 'changes' ? 'Send Feedback & Request Changes' :
               'Confirm Reject'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
