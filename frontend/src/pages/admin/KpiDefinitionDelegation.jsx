import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Modal from '../../components/common/Modal';
import { getUsersApi } from '../../api/users.api';
import UserSearchSelect from '../../components/common/UserSearchSelect';
import { getDepartmentsApi } from '../../api/departments.api';
import {
  getKpiDefinersApi, grantKpiDefinerApi, revokeKpiDefinerApi,
  getKpiDefinitionApproversApi, assignKpiDefinitionApproverApi, removeKpiDefinitionApproverApi,
} from '../../api/kpiDefinitionDelegation.api';

export default function KpiDefinitionDelegation() {
  const [definers, setDefiners] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDefiners, setLoadingDefiners] = useState(true);
  const [loadingApprovers, setLoadingApprovers] = useState(true);

  const [showGrantModal, setShowGrantModal] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');

  const [showApproverModal, setShowApproverModal] = useState(false);
  const [approverDeptId, setApproverDeptId] = useState('');
  const [approverUserId, setApproverUserId] = useState('');

  const loadDefiners = () => {
    setLoadingDefiners(true);
    getKpiDefinersApi().then((r) => setDefiners(r.data.data || [])).finally(() => setLoadingDefiners(false));
  };
  const loadApprovers = () => {
    setLoadingApprovers(true);
    getKpiDefinitionApproversApi().then((r) => setApprovers(r.data.data || [])).finally(() => setLoadingApprovers(false));
  };

  useEffect(() => {
    loadDefiners();
    loadApprovers();
    getUsersApi({ limit: 1000 }).then((r) => setUsers(r.data.data || [])).catch(() => {});
    getDepartmentsApi().then((r) => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  const userName = (id) => {
    const u = users.find((x) => (x._id || x.id) === id);
    return u ? `${u.name} (${u.role})` : id;
  };
  const deptName = (id) => departments.find((d) => (d._id || d.id) === id)?.name || id;

  // ── Definers ──────────────────────────────────────────────────────────────
  const handleGrant = async () => {
    if (!grantUserId) { toast.error('Select a user'); return; }
    try {
      await grantKpiDefinerApi(grantUserId);
      toast.success('Definer rights granted — scoped to that user\'s own department.');
      setShowGrantModal(false);
      setGrantUserId('');
      loadDefiners();
    } catch (e) { toast.error(e.response?.data?.error?.message || 'Failed to grant'); }
  };

  const handleRevoke = async (userId) => {
    if (!window.confirm('Revoke Definer rights for this user?')) return;
    try {
      await revokeKpiDefinerApi(userId);
      toast.success('Definer rights revoked');
      loadDefiners();
    } catch (e) { toast.error(e.response?.data?.error?.message || 'Failed to revoke'); }
  };

  const definerColumns = [
    { key: 'user', label: 'User', render: (r) => r.user?.name || userName(r.userId) },
    { key: 'department', label: 'Department (auto-derived)', render: (r) => r.department?.name || deptName(r.departmentId) },
    { key: 'grantedAt', label: 'Granted', render: (r) => r.grantedAt ? new Date(r.grantedAt).toLocaleDateString() : '—' },
    { key: 'actions', label: '', render: (r) => (
      <button onClick={() => handleRevoke(r.userId)} className="text-red-600 text-sm hover:underline">Revoke</button>
    )},
  ];

  // ── Approvers ─────────────────────────────────────────────────────────────
  const handleAssignApprover = async () => {
    if (!approverDeptId || !approverUserId) { toast.error('Select a department and a user'); return; }
    try {
      await assignKpiDefinitionApproverApi(approverDeptId, approverUserId);
      toast.success('Approver assigned');
      setShowApproverModal(false);
      setApproverDeptId(''); setApproverUserId('');
      loadApprovers();
    } catch (e) { toast.error(e.response?.data?.error?.message || 'Failed to assign'); }
  };

  const handleRemoveApprover = async (departmentId) => {
    if (!window.confirm('Remove this department\'s approver? Pending requests will fall back to admin.')) return;
    try {
      await removeKpiDefinitionApproverApi(departmentId);
      toast.success('Approver removed — falls back to admin');
      loadApprovers();
    } catch (e) { toast.error(e.response?.data?.error?.message || 'Failed to remove'); }
  };

  const approverColumns = [
    { key: 'department', label: 'Department', render: (r) => r.department?.name || deptName(r.departmentId) },
    { key: 'user', label: 'Approver', render: (r) => r.user?.name || userName(r.userId) },
    { key: 'assignedAt', label: 'Assigned', render: (r) => r.assignedAt ? new Date(r.assignedAt).toLocaleDateString() : '—' },
    { key: 'actions', label: '', render: (r) => (
      <button onClick={() => handleRemoveApprover(r.departmentId)} className="text-red-600 text-sm hover:underline">Remove</button>
    )},
  ];

  const assignedDeptIds = new Set(approvers.map((a) => a.departmentId));
  const unassignedDepartments = departments.filter((d) => !assignedDeptIds.has(d._id || d.id));

  return (
    <div className="p-6 space-y-10">
      <PageHeader
        title="KPI Definition Delegation"
        subtitle="Grant Definer rights (auto-scoped to the user's own department) and assign a department Approver. Only the admin role writes KPI definitions directly — everyone else, including HR Admin and Sales Director, now needs approval."
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Definers</h2>
          <button onClick={() => setShowGrantModal(true)} className="btn-primary text-sm">+ Grant Definer Rights</button>
        </div>
        <DataTable columns={definerColumns} data={definers} loading={loadingDefiners} emptyMessage="No one has been granted Definer rights yet." />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Department Approvers</h2>
          <button onClick={() => setShowApproverModal(true)} className="btn-primary text-sm">+ Assign Approver</button>
        </div>
        <p className="text-xs text-gray-400 mb-3">A department with no approver assigned here falls back to the admin role automatically.</p>
        <DataTable columns={approverColumns} data={approvers} loading={loadingApprovers} emptyMessage="No department-specific approvers assigned — everything falls back to admin." />
      </div>

      <Modal open={showGrantModal} onClose={() => setShowGrantModal(false)} title="Grant KPI Definer Rights">
        <div className="space-y-4">
          <div>
            <label className="label-text">User</label>
            <UserSearchSelect
              users={users.filter((u) => u.departmentId)}
              value={grantUserId}
              onChange={setGrantUserId}
              placeholder="Search by name, email or role…"
              getLabel={(u) => `${u.name} — ${u.role} (${deptName(u.departmentId)})`}
            />
            <p className="text-xs text-gray-400 mt-1">Rights are auto-scoped to this user's own department — not admin-picked.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowGrantModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleGrant} className="btn-primary">Grant</button>
          </div>
        </div>
      </Modal>

      <Modal open={showApproverModal} onClose={() => setShowApproverModal(false)} title="Assign Department Approver">
        <div className="space-y-4">
          <div>
            <label className="label-text">Department</label>
            <select value={approverDeptId} onChange={(e) => setApproverDeptId(e.target.value)} className="input-field">
              <option value="">Select a department…</option>
              {departments.map((d) => (
                <option key={d._id || d.id} value={d._id || d.id}>{d.name}{unassignedDeptIdsHint(d, assignedDeptIds)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Approver</label>
            <UserSearchSelect
              users={users}
              value={approverUserId}
              onChange={setApproverUserId}
              placeholder="Search by name, email or role…"
            />
            <p className="text-xs text-gray-400 mt-1">The approver can be anyone — not restricted to this department.</p>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowApproverModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleAssignApprover} className="btn-primary">Assign</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function unassignedDeptIdsHint(d, assignedDeptIds) {
  return assignedDeptIds.has(d._id || d.id) ? ' (already has an approver — will replace)' : '';
}
