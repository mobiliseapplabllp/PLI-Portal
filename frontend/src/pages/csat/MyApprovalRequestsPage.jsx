import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineClipboardList, HiOutlineChevronDown, HiOutlineChevronUp,
  HiOutlineClock, HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineRefresh,
} from 'react-icons/hi';
import { getMyApprovalRequestsApi } from '../../api/csat.api';
import Pagination from '../../components/common/Pagination';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusChip({ status }) {
  const map = {
    pending_approval: { label: 'Pending Approval', cls: 'bg-yellow-100 text-yellow-700', icon: <HiOutlineClock className="w-3.5 h-3.5" /> },
    changes_requested: { label: 'Changes Requested', cls: 'bg-orange-100 text-orange-700', icon: <HiOutlineRefresh className="w-3.5 h-3.5" /> },
    approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700', icon: <HiOutlineCheckCircle className="w-3.5 h-3.5" /> },
    rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700', icon: <HiOutlineXCircle className="w-3.5 h-3.5" /> },
    expired_unapproved: { label: 'Expired', cls: 'bg-gray-100 text-gray-500', icon: <HiOutlineClock className="w-3.5 h-3.5" /> },
  };
  const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-500', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

function FeedbackCell({ approval }) {
  const [open, setOpen] = useState(false);
  if (!approval) return <span className="text-gray-300">—</span>;

  const { overallFeedback, feedbacks = [] } = approval;
  if (!overallFeedback && !feedbacks.length) return <span className="text-gray-300">—</span>;

  return (
    <div>
      {overallFeedback && (
        <p className="text-sm text-gray-600">
          {open ? overallFeedback : overallFeedback.slice(0, 80) + (overallFeedback.length > 80 ? '…' : '')}
          {overallFeedback.length > 80 && (
            <button onClick={() => setOpen(o => !o)} className="ml-1 text-emerald-600 text-xs font-medium hover:underline">
              {open ? 'Less' : 'Read more'}
            </button>
          )}
        </p>
      )}
      {feedbacks.length > 0 && (
        <button
          onClick={() => setOpen(o => !o)}
          className="mt-1 text-xs text-gray-500 flex items-center gap-0.5 hover:text-gray-700"
        >
          {open ? <HiOutlineChevronUp className="w-3 h-3" /> : <HiOutlineChevronDown className="w-3 h-3" />}
          {feedbacks.length} question note{feedbacks.length > 1 ? 's' : ''}
        </button>
      )}
      {open && feedbacks.length > 0 && (
        <div className="mt-2 space-y-1 pl-2 border-l-2 border-gray-200">
          {feedbacks.map(fb => (
            <p key={fb.id} className="text-xs text-gray-500">{fb.feedback}</p>
          ))}
        </div>
      )}
    </div>
  );
}

const MODE_LABELS = { instant: 'Instant', scheduled: 'Scheduled', recurring: 'Recurring' };

export default function MyApprovalRequestsPage() {
  const navigate = useNavigate();
  const [dispatches, setDispatches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyApprovalRequestsApi({ page, limit: 20 });
      setDispatches(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Survey Requests</h1>
        <p className="text-sm text-gray-400 mt-0.5">Survey dispatch requests you submitted for admin approval</p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : dispatches.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <HiOutlineClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No approval requests yet</p>
          <button
            onClick={() => navigate('/csat/send-survey')}
            className="mt-3 text-emerald-600 text-sm font-medium hover:underline"
          >
            Create your first survey dispatch →
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Survey</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Org</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Submitted</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ver</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin Feedback</th>
                <th className="px-5 py-3 w-36" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dispatches.map(d => {
                const latestApproval = d.approvals?.[0]; // sorted DESC by version
                const status = d.approvalStatus;

                return (
                  <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-semibold text-gray-900">{d.survey?.name || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{d.clientOrganisation?.name || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {latestApproval ? fmt(latestApproval.submittedAt) : '—'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                        {MODE_LABELS[d.dispatchMode] || d.dispatchMode}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {latestApproval?.version > 1 && (
                        <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                          v{latestApproval.version}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusChip status={status} />
                    </td>
                    <td className="px-5 py-3.5 max-w-xs">
                      <FeedbackCell approval={latestApproval} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1.5">
                        {status === 'changes_requested' && (
                          <button
                            onClick={() => navigate(`/csat/send/${d.id}/revise`)}
                            className="text-xs font-semibold px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                          >
                            Revise & Resubmit
                          </button>
                        )}
                        {(status === 'rejected' || status === 'expired_unapproved') && (
                          <button
                            onClick={() => navigate('/csat/send-survey')}
                            className="text-xs font-semibold px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                          >
                            Create New
                          </button>
                        )}
                        {latestApproval && (
                          <button
                            onClick={() => navigate(`/csat/approval/${latestApproval.id}`)}
                            className="text-xs font-medium px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            View Details
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <Pagination page={page} pages={pagination.pages} onPageChange={setPage} />
      )}
    </div>
  );
}
