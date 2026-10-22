import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import {
  getKpiDefinitionRequestsApi, approveKpiDefinitionRequestApi, rejectKpiDefinitionRequestApi,
} from '../../api/kpiDefinitionRequest.api';

const ACTION_LABELS = {
  createPlan: 'Create KPI Plan',
  updatePlan: 'Update KPI Plan',
  updatePlanStatus: 'Change Plan Status',
  addPlanItem: 'Add KPI Item',
  updatePlanItem: 'Update KPI Item',
  deletePlanItem: 'Remove KPI Item',
  publishPlan: 'Publish KPI Plan',
};

const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function KpiDefinitionRequests() {
  const { user } = useSelector((state) => state.auth);
  const location = useLocation();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [reviewing, setReviewing] = useState(null); // { request, action: 'approve'|'reject' }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    getKpiDefinitionRequestsApi(statusFilter ? { status: statusFilter } : {})
      .then((r) => setRequests(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (location.state?.justSubmitted) {
      toast.success('Submitted for approval — showing your pending requests.');
    }
  }, [location.state]);

  const canReview = (r) => user?.role === 'admin' || String(r.approverId) === String(user?._id || user?.id);

  const openReview = (request, action) => { setReviewing({ request, action }); setNote(''); };

  const submitReview = async () => {
    setBusy(true);
    try {
      if (reviewing.action === 'approve') {
        await approveKpiDefinitionRequestApi(reviewing.request.id, note);
        toast.success('Approved and applied.');
      } else {
        await rejectKpiDefinitionRequestApi(reviewing.request.id, note);
        toast.success('Rejected.');
      }
      setReviewing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  };

  const describePayload = (r) => {
    if (!r.payload) return '—';
    if (r.action === 'updatePlanStatus') return `→ ${r.payload.status}`;
    if (r.payload.title) return r.payload.title;
    return JSON.stringify(r.payload).slice(0, 60);
  };

  const columns = [
    { key: 'action', label: 'Action', render: (r) => ACTION_LABELS[r.action] || r.action },
    { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
    { key: 'detail', label: 'Detail', render: (r) => <span className="text-gray-500">{describePayload(r)}</span> },
    { key: 'requestedBy', label: 'Requested By', render: (r) => `${r.requestedBy?.name || '—'} (${r.requestedBy?.role || ''})` },
    { key: 'approver', label: 'Approver', render: (r) => r.approver?.name || 'Falls back to admin' },
    { key: 'status', label: 'Status', render: (r) => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
    )},
    { key: 'createdAt', label: 'Submitted', render: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'actions', label: '', render: (r) => (
      r.status === 'pending' && canReview(r) ? (
        <div className="flex gap-3">
          <button onClick={() => openReview(r, 'approve')} className="text-emerald-600 text-sm hover:underline">Approve</button>
          <button onClick={() => openReview(r, 'reject')} className="text-red-600 text-sm hover:underline">Reject</button>
        </div>
      ) : null
    )},
  ];

  return (
    <div className="p-6">
      <PageHeader
        title="KPI Definition Requests"
        subtitle="KPI-plan changes made by anyone other than admin — including HR Admin and Sales Director — are staged here until approved."
        actions={
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field text-sm">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        }
      />
      <DataTable columns={columns} data={requests} loading={loading} emptyMessage="No requests here." />

      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={reviewing?.action === 'approve' ? 'Approve Request' : 'Reject Request'}
      >
        {reviewing && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {ACTION_LABELS[reviewing.request.action] || reviewing.request.action} on{' '}
              <strong>{reviewing.request.department?.name}</strong> requested by{' '}
              <strong>{reviewing.request.requestedBy?.name}</strong>.
            </p>
            <div>
              <label className="label-text">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="input-field"
                rows={3}
                placeholder={reviewing.action === 'approve' ? 'Looks good…' : 'Reason for rejection…'}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setReviewing(null)} className="btn-secondary" disabled={busy}>Cancel</button>
              <button
                onClick={submitReview}
                disabled={busy}
                className={reviewing.action === 'approve' ? 'btn-success' : 'btn-danger'}
              >
                {busy ? 'Submitting…' : (reviewing.action === 'approve' ? 'Approve' : 'Reject')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
