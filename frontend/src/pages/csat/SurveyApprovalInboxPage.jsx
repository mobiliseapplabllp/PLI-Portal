import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineInbox, HiOutlineClock, HiOutlineExclamation, HiOutlineCheckCircle,
  HiOutlineXCircle, HiOutlineRefresh, HiOutlineSearch,
} from 'react-icons/hi';
import { getApprovalsApi } from '../../api/csat.api';
import Pagination from '../../components/common/Pagination';

function deadlineBadge(hoursRemaining) {
  if (hoursRemaining === null) return <span className="text-gray-400 text-xs">No deadline</span>;
  if (hoursRemaining < 0) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><HiOutlineExclamation className="w-3 h-3" />Overdue</span>;
  if (hoursRemaining < 4) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><HiOutlineClock className="w-3 h-3" />Due in {hoursRemaining}h</span>;
  if (hoursRemaining < 24) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full"><HiOutlineClock className="w-3 h-3" />Due tomorrow</span>;
  const days = Math.floor(hoursRemaining / 24);
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><HiOutlineClock className="w-3 h-3" />Due in {days}d</span>;
}

function statusChip(status) {
  const map = {
    approved: { label: 'Approved', cls: 'text-emerald-700 bg-emerald-50', icon: <HiOutlineCheckCircle className="w-3.5 h-3.5" /> },
    rejected: { label: 'Rejected', cls: 'text-red-700 bg-red-50', icon: <HiOutlineXCircle className="w-3.5 h-3.5" /> },
    changes_requested: { label: 'Changes Requested', cls: 'text-yellow-700 bg-yellow-50', icon: <HiOutlineRefresh className="w-3.5 h-3.5" /> },
    expired_unapproved: { label: 'Expired', cls: 'text-gray-500 bg-gray-100', icon: <HiOutlineClock className="w-3.5 h-3.5" /> },
  };
  const s = map[status] || { label: status, cls: 'text-gray-500 bg-gray-100', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

const MODE_LABELS = { instant: 'Instant', scheduled: 'Scheduled', recurring: 'Recurring' };

export default function SurveyApprovalInboxPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('pending');
  const [approvals, setApprovals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getApprovalsApi({ status: tab, page, limit: 20 });
      setApprovals(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { setPage(1); }, [tab]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Inbox</h1>
          <p className="text-sm text-gray-400 mt-0.5">Review survey dispatch requests from managers</p>
        </div>
        {tab === 'pending' && pagination.total > 0 && (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-semibold rounded-full">
            {pagination.total} pending
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'pending', label: 'Pending' },
          { key: 'reviewed', label: 'Reviewed' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <HiOutlineInbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No {tab} approval requests</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Survey</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Requested By</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Organisation</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mode</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Deadline</th>
                {tab === 'reviewed' && (
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {approvals.map(a => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/csat/approval/${a.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-gray-900">{a.dispatch?.survey?.name || '—'}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{a.requestedBy?.name || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-500">{a.dispatch?.clientOrganisation?.name || '—'}</td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                      {MODE_LABELS[a.dispatch?.dispatchMode] || a.dispatch?.dispatchMode}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {a.version > 1 && (
                      <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        v{a.version}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">{deadlineBadge(a.hoursRemaining)}</td>
                  {tab === 'reviewed' && (
                    <td className="px-5 py-3.5">{statusChip(a.status)}</td>
                  )}
                </tr>
              ))}
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
