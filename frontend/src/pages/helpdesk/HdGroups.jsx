/**
 * HdGroups.jsx
 * Helpdesk groups management page (admin/manager only).
 * Table of groups with Create / Edit / Delete actions via inline modal.
 */
import { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  fetchGroups,
  selectGroups,
} from '../../store/helpdeskSlice';
import {
  createGroupApi,
  updateGroupApi,
  deleteGroupApi,
} from '../../api/helpdesk/groups.api';
import { getUsersApi } from '../../api/users.api';
import { HiOutlinePlus, HiOutlineUserGroup, HiOutlineX } from 'react-icons/hi';

const EMPTY_FORM = { name: '', managerId: '', slaEnabled: false, approvalsEnabled: false };

export default function HdGroups() {
  const dispatch = useDispatch();
  const groups = useSelector(selectGroups);
  const groupsLoading = useSelector(s => s.helpdesk.groupsLoading);
  const { user } = useSelector(s => s.auth);

  const [managers, setManagers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const canManage = ['admin', 'manager', 'senior_manager'].includes(user?.role);

  useEffect(() => {
    dispatch(fetchGroups());
    // Load all active users — any user can be set as a group manager
    getUsersApi({ limit: 1000 })
      .then(res => setManagers(res.data?.data?.users || res.data?.data || res.data || []))
      .catch(() => {});
  }, [dispatch]);

  const openCreate = () => {
    setEditingGroup(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (g) => {
    setEditingGroup(g);
    setForm({
      name: g.name || '',
      managerId: g.manager?._id || g.managerId || '',
      slaEnabled: g.slaEnabled || false,
      approvalsEnabled: g.approvalsEnabled || false,
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      if (editingGroup) {
        await updateGroupApi(editingGroup.id || editingGroup.id, form);
        toast.success('Group updated');
      } else {
        await createGroupApi(form);
        toast.success('Group created');
      }
      dispatch(fetchGroups());
      setShowModal(false);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to save group');
    } finally { setSaving(false); }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"? This cannot be undone.`)) return;
    setDeleting(g.id || g.id);
    try {
      await deleteGroupApi(g.id || g.id);
      toast.success('Group deleted');
      dispatch(fetchGroups());
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete group');
    } finally { setDeleting(null); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Helpdesk Groups</h1>
          <p className="text-sm text-gray-500 mt-1">{groups.length} groups configured</p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Create Group
          </button>
        )}
      </div>

      {/* Table */}
      {groupsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
          <div className="h-10 bg-gray-50 border-b border-gray-100" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-gray-50 flex gap-4">
              <div className="h-4 bg-gray-200 rounded flex-1" />
              <div className="h-4 bg-gray-100 rounded w-24" />
              <div className="h-4 bg-gray-100 rounded w-16" />
              <div className="h-4 bg-gray-100 rounded w-16" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineUserGroup className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No groups yet</p>
          {canManage && (
            <button onClick={openCreate} className="mt-3 text-sm text-blue-600 hover:underline">
              Create the first group
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left">Group Name</th>
                  <th className="px-5 py-3 text-left">Manager</th>
                  <th className="px-5 py-3 text-left">SLA</th>
                  <th className="px-5 py-3 text-left">Approvals</th>
                  {canManage && <th className="px-5 py-3 text-left">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {groups.map(g => (
                  <tr key={g.id || g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{g.name}</td>
                    <td className="px-5 py-3 text-gray-600">{g.manager?.name || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${g.slaEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {g.slaEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${g.approvalsEnabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {g.approvalsEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex gap-3">
                          <button onClick={() => openEdit(g)} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Edit</button>
                          <button
                            onClick={() => handleDelete(g)}
                            disabled={deleting === (g.id || g.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-40"
                          >
                            {deleting === (g.id || g.id) ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editingGroup ? 'Edit Group' : 'Create Group'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Group Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. IT Support, HR Helpdesk..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Manager</label>
                <select
                  value={form.managerId}
                  onChange={e => setForm(f => ({ ...f, managerId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No manager</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role?.replace(/_/g, ' ')})</option>)}
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.slaEnabled}
                  onChange={e => setForm(f => ({ ...f, slaEnabled: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Enable SLA Tracking</p>
                  <p className="text-xs text-gray-400">Track and alert on SLA breaches for tickets in this group</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.approvalsEnabled}
                  onChange={e => setForm(f => ({ ...f, approvalsEnabled: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Enable Approvals</p>
                  <p className="text-xs text-gray-400">Allow approval workflows for tickets in this group</p>
                </div>
              </label>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving...' : editingGroup ? 'Save Changes' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
