import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch,
  HiOutlineOfficeBuilding, HiOutlineUsers,
} from 'react-icons/hi';
import {
  getClientOrgsApi, createClientOrgApi, updateClientOrgApi, deleteClientOrgApi,
} from '../../api/csat.api';
import { getUsersApi } from '../../api/users.api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Pagination from '../../components/common/Pagination';

const ADMIN_ROLES = ['admin'];

const emptyForm = {
  name: '', description: '', managedById: '', industry: '',
};

const INDUSTRY_COLORS = {
  'BFSI': 'bg-blue-50 text-blue-700',
  'Healthcare': 'bg-emerald-50 text-emerald-700',
  'IT': 'bg-violet-50 text-violet-700',
  'Manufacturing': 'bg-amber-50 text-amber-700',
  'Retail': 'bg-pink-50 text-pink-700',
};

function IndustryChip({ industry }) {
  if (!industry) return <span className="text-gray-400 text-xs">—</span>;
  const cls = INDUSTRY_COLORS[industry] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${cls}`}>{industry}</span>
  );
}

export default function ClientOrgsPage() {
  const { user } = useSelector((s) => s.auth);
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editOrg, setEditOrg] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [users, setUsers] = useState([]);

  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getClientOrgsApi({ search, page, limit: 15, isActive: true });
      setOrgs(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load client organisations');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  useEffect(() => {
    getUsersApi({ isActive: true, limit: 200 })
      .then((res) => setUsers(res.data?.data?.users || res.data?.data || []))
      .catch(() => {});
  }, []);

  const openCreate = () => { setEditOrg(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (org) => {
    setEditOrg(org);
    setForm({
      name: org.name || '',
      description: org.description || '',
      managedById: org.managedById || '',
      industry: org.industry || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Organisation name is required'); return; }
    setSaving(true);
    try {
      if (editOrg) {
        await updateClientOrgApi(editOrg._id, form);
        toast.success('Organisation updated');
      } else {
        await createClientOrgApi(form);
        toast.success('Organisation created');
      }
      setShowForm(false);
      fetchOrgs();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteClientOrgApi(deleteTarget._id);
      toast.success('Organisation deactivated');
      setDeleteTarget(null);
      fetchOrgs();
    } catch {
      toast.error('Failed to deactivate organisation');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Client Organisations</h1>
          <p className="text-sm text-gray-500 mt-1">Manage client companies and their survey contacts</p>
        </div>
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-100 flex-shrink-0"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Add Organisation
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative max-w-xs">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search organisations..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-2xl">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiOutlineOfficeBuilding className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-700 font-semibold text-sm">No organisations found</p>
          {isAdmin && (
            <button
              onClick={openCreate}
              className="mt-3 text-emerald-600 text-sm font-medium hover:underline"
            >
              Add your first organisation →
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Organisation</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Managed By</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Industry</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employees</th>
                {isAdmin && <th className="px-5 py-3.5 w-20" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orgs.map((org) => (
                <tr key={org._id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <HiOutlineOfficeBuilding className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{org.name}</p>
                        {org.description && (
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{org.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {org.managedBy ? (
                      <div>
                        <p className="text-sm font-medium text-gray-800">{org.managedBy.name}</p>
                        {org.managedBy.employeeCode && (
                          <p className="text-xs text-gray-400">{org.managedBy.employeeCode}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <IndustryChip industry={org.industry} />
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => navigate(`/csat/client-organisations/${org._id}/employees`)}
                      className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-800 font-semibold hover:underline transition-colors"
                    >
                      <HiOutlineUsers className="w-4 h-4" />
                      View Employees
                    </button>
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(org)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <HiOutlinePencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(org)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deactivate"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
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

      {/* Create / Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editOrg ? 'Edit Organisation' : 'Add Client Organisation'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Organisation Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Acme Corp"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Managed By</label>
            <select
              value={form.managedById}
              onChange={(e) => setForm((f) => ({ ...f, managedById: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">— Select employee —</option>
              {users.map((u) => (
                <option key={u.id || u._id} value={u.id || u._id}>
                  {u.name}{u.employeeCode ? ` (${u.employeeCode})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
            <input
              type="text"
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              placeholder="e.g. BFSI, Healthcare"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Brief description..."
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors"
            >
              {saving ? 'Saving...' : editOrg ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Deactivate Organisation"
        message={`Deactivate "${deleteTarget?.name}"? It will no longer appear in survey dispatch lists.`}
        confirmLabel="Deactivate"
        danger
      />
    </div>
  );
}
