import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import DefinerTargetPicker from '../../components/common/DefinerTargetPicker';
import {
  getKpiDefinitionRequestsApi, approveKpiDefinitionRequestApi, rejectKpiDefinitionRequestApi,
  getMyKpiDefinitionAccessApi, grantSubDefinerApi, getMyGrantedDefinersApi, revokeMyGrantedDefinerApi,
} from '../../api/kpiDefinitionRequest.api';
import { getUsersApi } from '../../api/users.api';
import { getDepartmentsApi } from '../../api/departments.api';

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

  const isAdmin = user?.role === 'admin';
  const [canGrant, setCanGrant] = useState(false);
  const [myAccess, setMyAccess] = useState(null);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [myGrants, setMyGrants] = useState([]);
  const [loadingGrants, setLoadingGrants] = useState(false);

  useEffect(() => {
    // Admin already has the full console at /admin/kpi-definition-delegation
    // — this button is specifically the self-service path for a Definer or
    // Approver who has no access to that admin-only page at all.
    if (isAdmin) { setCanGrant(false); return; }
    getMyKpiDefinitionAccessApi()
      .then((r) => {
        const access = r.data?.data || {};
        setMyAccess(access);
        setCanGrant(!!access.isDefiner || !!access.isApprover);
      })
      .catch(() => {});
  }, [isAdmin]);

  // Only the department(s) this granter themselves can define for — unlike
  // admin's unrestricted picker, a Definer/Approver like Renosh can only
  // grant within the department(s) they already have rights to.
  const grantableDepartmentIds = new Set([
    ...(myAccess?.isDefiner && myAccess.definerDepartmentId ? [myAccess.definerDepartmentId] : []),
    ...(myAccess?.isApprover ? myAccess.approverDepartmentIds || [] : []),
  ]);
  const grantableDepartments = departments.filter((d) => grantableDepartmentIds.has(d._id || d.id));

  const loadMyGrants = () => {
    if (isAdmin) return;
    setLoadingGrants(true);
    getMyGrantedDefinersApi()
      .then((r) => setMyGrants(r.data?.data || []))
      .catch(() => {})
      .finally(() => setLoadingGrants(false));
  };

  // Only once this user is actually known to be able to grant (not just
  // "logged in") — avoids a pointless fetch for everyone else on the page.
  useEffect(() => { if (canGrant) loadMyGrants(); }, [canGrant]); // eslint-disable-line react-hooks/exhaustive-deps

  const openGrantModal = () => {
    setGrantUserId('');
    setShowGrantModal(true);
    if (users.length === 0) {
      getUsersApi({ limit: 1000 }).then((r) => setUsers(r.data.data || [])).catch(() => {});
    }
    if (departments.length === 0) {
      getDepartmentsApi().then((r) => setDepartments(r.data.data || [])).catch(() => {});
    }
  };

  const handleGrant = async () => {
    if (!grantUserId) { toast.error('Select a user'); return; }
    setBusy(true);
    try {
      await grantSubDefinerApi(grantUserId);
      toast.success('Definer rights granted — scoped to that user\'s own department.');
      setShowGrantModal(false);
      loadMyGrants();
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Failed to grant');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeMyGrant = async (userId) => {
    if (!window.confirm('Revoke Definer rights for this user?')) return;
    try {
      await revokeMyGrantedDefinerApi(userId);
      toast.success('Definer rights revoked.');
      loadMyGrants();
    } catch (e) {
      toast.error(e.response?.data?.error?.message || 'Failed to revoke');
    }
  };

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
        const res = await approveKpiDefinitionRequestApi(reviewing.request.id, note);
        toast.success(res.data?.message || 'Approved.');
      } else {
        const res = await rejectKpiDefinitionRequestApi(reviewing.request.id, note);
        toast.success(res.data?.message || 'Rejected.');
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

  // Stage progress: the chain is intermediate approvers only — admin is
  // always the implicit final stage (see buildApprovalChain on the backend).
  const stageLabel = (r) => {
    const chainLen = (r.approvalChain || []).length;
    const totalStages = chainLen + 1; // + admin
    const stageNum = Math.min(r.currentStage + 1, totalStages);
    return totalStages > 1 ? `Stage ${stageNum} of ${totalStages}` : null;
  };

  const columns = [
    { key: 'action', label: 'Action', render: (r) => ACTION_LABELS[r.action] || r.action },
    { key: 'department', label: 'Department', render: (r) => r.department?.name || '—' },
    { key: 'detail', label: 'Detail', render: (r) => <span className="text-gray-500">{describePayload(r)}</span> },
    { key: 'requestedBy', label: 'Requested By', render: (r) => `${r.requestedBy?.name || '—'} (${r.requestedBy?.role || ''})` },
    { key: 'approver', label: 'Current Approver', render: (r) => (
      <div>
        <div>{r.approver?.name || 'Admin'}</div>
        {r.status === 'pending' && stageLabel(r) && <div className="text-xs text-gray-400">{stageLabel(r)}</div>}
      </div>
    )},
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
        subtitle="Publishing a KPI plan is the only action that needs approval. A request climbs the chain of whoever granted the submitter access, ending with admin's final sign-off."
        actions={
          <div className="flex items-center gap-2">
            {canGrant && (
              <button onClick={openGrantModal} className="btn-primary text-sm">+ Grant Definer Access</button>
            )}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field text-sm">
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
        }
      />
      <DataTable columns={columns} data={requests} loading={loading} emptyMessage="No requests here." />

      {canGrant && (
        <div className="mt-10">
          <h2 className="text-base font-semibold text-gray-900 mb-3">People You've Granted</h2>
          <DataTable
            loading={loadingGrants}
            emptyMessage="You haven't granted anyone Definer access yet."
            data={myGrants}
            columns={[
              { key: 'user', label: 'User', render: (g) => g.user?.name || '—' },
              { key: 'department', label: 'Department', render: (g) => g.department?.name || '—' },
              { key: 'grantedAt', label: 'Granted', render: (g) => g.grantedAt ? new Date(g.grantedAt).toLocaleString() : '—' },
              { key: 'status', label: 'Status', render: (g) => (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${g.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {g.isActive ? 'Active' : 'Revoked'}
                </span>
              )},
              { key: 'actions', label: '', render: (g) => (
                g.isActive ? (
                  <button onClick={() => handleRevokeMyGrant(g.userId)} className="text-red-600 text-sm hover:underline">Revoke</button>
                ) : null
              )},
            ]}
          />
        </div>
      )}

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

      <Modal open={showGrantModal} onClose={() => setShowGrantModal(false)} title="Grant KPI Definer Access">
        <div className="space-y-4">
          <div>
            <DefinerTargetPicker
              departments={grantableDepartments}
              users={users}
              value={grantUserId}
              onChange={setGrantUserId}
            />
            <p className="text-xs text-gray-400 mt-1">
              Rights are auto-scoped to this user's own department. You can only grant this for a
              department you yourself have rights to define for — and only to a manager-level person,
              or an employee reached through their manager's team.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowGrantModal(false)} className="btn-secondary" disabled={busy}>Cancel</button>
            <button onClick={handleGrant} className="btn-primary" disabled={busy}>{busy ? 'Granting…' : 'Grant'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
