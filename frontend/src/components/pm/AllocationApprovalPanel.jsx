import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { formatAllocation } from './AllocationTypeInput';

/** API responses rename every `id` to `_id` — read both. */
const idOf = (o) => o?._id ?? o?.id ?? null;

export default function AllocationApprovalPanel({ projectId, canManage }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!projectId || !canManage) return;
    setLoading(true);
    try {
      const res = await api.get(`/pm/projects/${projectId}/allocation-approvals`);
      setApprovals(res.data?.data || []);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const respond = async (approvalId, action) => {
    if (!approvalId) { alert('This request has no id — reload the page and try again.'); return; }
    try {
      await api.patch(`/pm/projects/${projectId}/allocation-approvals/${approvalId}`, { action });
      load();
    } catch (err) {
      const d = err.response?.data;
      alert('Failed to respond: ' + (d?.message || d?.error?.message || err.message));
    }
  };

  if (!canManage || loading || approvals.length === 0) return null;

  return (
    <div className="mb-4 border border-amber-200 bg-amber-50 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-600 text-lg">&#9889;</span>
        <h4 className="font-semibold text-amber-800 text-sm">
          Requests to release hours from this project ({approvals.length})
        </h4>
      </div>
      <div className="space-y-3">
        {approvals.map(approval => (
          <div key={idOf(approval)} className="bg-white border border-amber-100 rounded-lg p-3">
            <p className="text-sm text-gray-800 font-medium">
              {approval.requestedUser?.name || 'A team member'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {approval.requester?.name
                ? `${approval.requester.name} is requesting capacity release`
                : 'Another PM is requesting capacity release'}
              {formatAllocation(approval, 8)
                ? ` (reduce to ${formatAllocation(approval, 8)})`
                : approval.allocationPct != null
                ? ` (reduce to ${approval.allocationPct}%)`
                : ''}
            </p>
            {approval.reason && (
              <p className="text-xs text-gray-600 italic mt-1">"{approval.reason}"</p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => respond(idOf(approval), 'approve')}
                className="px-3 py-1 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition"
              >
                Approve
              </button>
              <button
                onClick={() => respond(idOf(approval), 'reject')}
                className="px-3 py-1 text-xs font-medium bg-white text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
