/**
 * HdSettings.jsx
 * Helpdesk Settings — sidebar + content panel layout matching original Setup.jsx.
 * Left nav: collapsible groups with active highlights.
 * Right panel: swaps content based on selected menu item.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  fetchHdProjects,
  selectHdProjects,
} from '../../store/helpdeskSlice';
import {
  createHdProjectApi,
  updateHdProjectApi,
  deleteHdProjectApi,
  regenerateTokenApi,
} from '../../api/helpdesk/hdProjects.api';
import {
  getGroupsApi,
  getHdOptionsApi,
  createHdOptionApi,
  deleteHdOptionApi,
  getUserGroupsApi,
  assignUserGroupApi,
  bulkAssignUserGroupsApi,
} from '../../api/helpdesk/helpdesk.api';
import {
  HiOutlineCog,
  HiOutlineCollection,
  HiOutlineShieldCheck,
  HiOutlineUsers,
  HiOutlineMail,
  HiOutlineColorSwatch,
  HiOutlineLightningBolt,
  HiOutlineDatabase,
  HiOutlineLightBulb,
  HiOutlineChartPie,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineUserGroup,
  HiOutlineClipboard,
  HiOutlineRefresh,
  HiOutlinePlus,
  HiOutlineX,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineCheck,
  HiOutlineExternalLink,
} from 'react-icons/hi';

// ─── localStorage helpers ─────────────────────────────────────────────────────
const HD_STORE = 'pli_hd_settings';
function getHdSetting(key, fallback = null) {
  try {
    const raw = localStorage.getItem(`${HD_STORE}_${key}`);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveHdSetting(key, value) {
  try { localStorage.setItem(`${HD_STORE}_${key}`, JSON.stringify(value)); } catch {}
}

// ─── Menu definition ──────────────────────────────────────────────────────────
const MENU_ITEMS = [
  { id: 'instance',     label: 'Instance Configuration', icon: HiOutlineCog },
  { id: 'projects',     label: 'Projects',               icon: HiOutlineCollection },
  { id: 'user-master',  label: 'User Master',            icon: HiOutlineShieldCheck, adminOnly: true },
  {
    id: 'users-permissions', label: 'Users & Permissions', icon: HiOutlineUsers, adminOnly: true,
    items: [
      { id: 'groups-perm', label: 'Groups' },
    ],
  },
  {
    id: 'mail', label: 'Mail Settings', icon: HiOutlineMail,
    items: [
      { id: 'mail-server',    label: 'Mail Server Settings' },
      { id: 'mail-filter',    label: 'Mail Filter' },
      { id: 'email-command',  label: 'Email Command' },
    ],
  },
  {
    id: 'customization', label: 'Customization', icon: HiOutlineColorSwatch,
    items: [
      { id: 'helpdesk',          label: 'Helpdesk' },
      { id: 'additional-fields', label: 'Additional Fields' },
      { id: 'checklists',        label: 'Checklists' },
      { id: 'announcement',      label: 'Announcement' },
    ],
  },
  { id: 'automation', label: 'Automation',       icon: HiOutlineLightningBolt },
  {
    id: 'data-admin', label: 'Data Administration', icon: HiOutlineDatabase, adminOnly: true,
    items: [
      { id: 'teams',  label: 'Raised by Team (Add/Delete)' },
      { id: 'groups', label: 'Groups — Assignment' },
      { id: 'sites',  label: 'Sites' },
    ],
  },
  {
    id: 'general', label: 'General Settings', icon: HiOutlineCog,
    items: [
      { id: 'advanced-portal',  label: 'Advanced Portal Settings' },
      { id: 'requester-portal', label: 'Requester Portal' },
    ],
  },
  { id: 'zia',     label: 'Zia (AI Assistant)', icon: HiOutlineLightBulb },
  { id: 'reports', label: 'Reports',            icon: HiOutlineChartPie },
];

const OPTION_TABS = [
  { key: 'category',        label: 'Category' },
  { key: 'status',          label: 'Status',       readOnly: true },  // DB ENUM — cannot be changed via UI
  { key: 'level',           label: 'Level' },
  { key: 'mode',            label: 'Mode' },
  { key: 'impact',          label: 'Impact' },
  { key: 'urgency',         label: 'Urgency' },
  { key: 'priority',        label: 'Priority' },
  { key: 'priority_matrix', label: 'Priority Matrix' },
  { key: 'request_type',    label: 'Request Type' },
];

// ─── Shared: Placeholder ──────────────────────────────────────────────────────
function PlaceholderContent({ title }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <HiOutlineCog className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-400 text-sm">{title} — Coming soon</p>
    </div>
  );
}

// ─── Section: Instance Configuration ─────────────────────────────────────────
function InstanceSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Instance Configuration</h2>
        <p className="text-sm text-gray-500 mt-1">Current environment details for this PLI Portal helpdesk instance.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
        {[
          ['Environment',   'UAT (pli_portal_uat)'],
          ['Backend Port',  '5105'],
          ['Version',       'PLI Portal Helpdesk v1.0'],
          ['Database',      'MySQL 8 · pli_portal_uat'],
          ['Auth',          'JWT (PLI Portal users)'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center px-5 py-3 gap-4">
            <span className="w-40 text-gray-500 shrink-0">{k}</span>
            <span className="text-gray-800 font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Projects — full CRUD ────────────────────────────────────────────
function ProjectsSettings() {
  const dispatch  = useDispatch();
  const hdProjects       = useSelector(selectHdProjects);
  const hdProjectsLoading = useSelector(s => s.helpdesk.hdProjectsLoading);

  const [groups,         setGroups]         = useState([]);
  const [showCreate,     setShowCreate]     = useState(false);
  const [form,           setForm]           = useState({ name: '', description: '', groupId: '', status: 'Active' });
  const [creating,       setCreating]       = useState(false);
  const [editingId,      setEditingId]      = useState(null);
  const [editForm,       setEditForm]       = useState({});
  const [saving,         setSaving]         = useState(false);
  const [deletingId,     setDeletingId]     = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [copiedId,       setCopiedId]       = useState(null);

  useEffect(() => {
    dispatch(fetchHdProjects());
    getGroupsApi()
      .then(r => setGroups(r.data?.data || r.data || []))
      .catch(() => {});
  }, [dispatch]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Project name is required'); return; }
    setCreating(true);
    try {
      await createHdProjectApi({
        name:        form.name.trim(),
        description: form.description || null,
        groupId:     form.groupId ? Number(form.groupId) : null,
        status:      form.status || 'Active',
      });
      toast.success('Project created');
      dispatch(fetchHdProjects());
      setShowCreate(false);
      setForm({ name: '', description: '', groupId: '', status: 'Active' });
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to create project');
    } finally { setCreating(false); }
  };

  const startEdit = (p) => {
    setEditingId(p._id ?? p.id);
    setEditForm({ name: p.name, description: p.description || '', groupId: p.groupId || '', status: p.status || 'Active' });
  };

  const handleSave = async (id) => {
    setSaving(true);
    try {
      await updateHdProjectApi(id, {
        name:        editForm.name.trim(),
        description: editForm.description || null,
        groupId:     editForm.groupId ? Number(editForm.groupId) : null,
        status:      editForm.status,
      });
      toast.success('Project updated');
      dispatch(fetchHdProjects());
      setEditingId(null);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to update project');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteHdProjectApi(id);
      toast.success('Project deleted');
      dispatch(fetchHdProjects());
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to delete project');
    } finally { setDeletingId(null); }
  };

  const handleRegenToken = async (id) => {
    if (!window.confirm('Regenerate token? Existing widget URLs will stop working immediately.')) return;
    setRegeneratingId(id);
    try {
      await regenerateTokenApi(id);
      toast.success('Token regenerated');
      dispatch(fetchHdProjects());
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to regenerate token');
    } finally { setRegeneratingId(null); }
  };

  const copyToken = (token, id) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedId(id);
      toast.success('Token copied');
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast.error('Copy failed'));
  };

  const statusBadge = (s) => {
    const cls =
      s === 'Active'    ? 'bg-emerald-100 text-emerald-700' :
      s === 'On Hold'   ? 'bg-yellow-100 text-yellow-700'   :
      s === 'Completed' ? 'bg-gray-100 text-gray-600'       :
      'bg-gray-100 text-gray-500';
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s || 'Active'}</span>;
  };

  const groupName = (p) =>
    p.group?.name || groups.find(g => (g._id || g.id) === p.groupId)?.name || '—';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Projects</h2>
          <p className="text-sm text-gray-500 mt-0.5">Each project has a unique public widget token for embedding the support form.</p>
        </div>
        <button
          onClick={() => setShowCreate(f => !f)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors"
        >
          {showCreate ? <HiOutlineX className="w-4 h-4" /> : <HiOutlinePlus className="w-4 h-4" />}
          {showCreate ? 'Cancel' : 'New Project'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <p className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wide">New Project</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. IT Helpdesk" autoFocus required
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Team / Group</label>
              <select value={form.groupId} onChange={e => setForm(f => ({ ...f, groupId: e.target.value }))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">— No group —</option>
                {groups.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>Active</option>
                <option>On Hold</option>
                <option>Completed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description"
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" disabled={creating}
              className="px-4 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {hdProjectsLoading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : hdProjects.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-lg border border-gray-200">
          No projects yet. Create one above.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left">Project</th>
                <th className="px-4 py-2.5 text-left">Team</th>
                <th className="px-4 py-2.5 text-left">Status</th>
                <th className="px-4 py-2.5 text-left">Widget Token</th>
                <th className="px-4 py-2.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {hdProjects.map(p => (
                <tr key={p._id ?? p.id} className="hover:bg-gray-50 transition-colors">
                  {editingId === (p._id ?? p.id) ? (
                    <>
                      <td className="px-4 py-2">
                        <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          className="px-2 py-1 border border-blue-300 rounded text-sm w-36 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                          placeholder="Description" className="mt-1 px-2 py-1 border border-gray-200 rounded text-xs w-36 focus:outline-none" />
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.groupId} onChange={e => setEditForm(f => ({ ...f, groupId: e.target.value }))}
                          className="px-2 py-1 border border-gray-200 rounded text-xs w-32 focus:outline-none">
                          <option value="">— None —</option>
                          {groups.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                          className="px-2 py-1 border border-gray-200 rounded text-xs w-28 focus:outline-none">
                          <option>Active</option>
                          <option>On Hold</option>
                          <option>Completed</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400 italic">— unchanged —</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleSave(p._id ?? p.id)} disabled={saving}
                            className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50">
                            <HiOutlineCheck className="w-3.5 h-3.5" />
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                            <HiOutlineX className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        {p.description && <p className="text-xs text-gray-400 mt-0.5">{p.description}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{groupName(p)}</td>
                      <td className="px-4 py-2.5">{statusBadge(p.status)}</td>
                      <td className="px-4 py-2.5">
                        {p.publicToken
                          ? <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-700">{p.publicToken.slice(0, 18)}…</code>
                          : <span className="text-xs text-gray-400">No token</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => startEdit(p)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                            <HiOutlinePencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          {p.publicToken && (
                            <button onClick={() => copyToken(p.publicToken, p._id ?? p.id)}
                              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium">
                              <HiOutlineClipboard className="w-3.5 h-3.5" />
                              {copiedId === (p._id ?? p.id) ? 'Copied!' : 'Copy Token'}
                            </button>
                          )}
                          <button onClick={() => handleRegenToken(p._id ?? p.id)} disabled={regeneratingId === (p._id ?? p.id)}
                            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium disabled:opacity-40">
                            <HiOutlineRefresh className={`w-3.5 h-3.5 ${regeneratingId === (p._id ?? p.id) ? 'animate-spin' : ''}`} />
                            Regen Token
                          </button>
                          <button onClick={() => handleDelete(p._id ?? p.id, p.name)} disabled={deletingId === (p._id ?? p.id)}
                            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-40">
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                            {deletingId === (p._id ?? p.id) ? '…' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section: User Master (User ↔ Group assignment) ──────────────────────────
function UserMasterSettings() {
  const [data,          setData]          = useState([]);
  const [groups,        setGroups]        = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState({});
  const [bulkGroup,     setBulkGroup]     = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [search,        setSearch]        = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([getUserGroupsApi(), getGroupsApi()])
      .then(([u, g]) => {
        setData(u.data?.data || []);
        setGroups(g.data?.data || g.data || []);
      })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  const handleGroupChange = async (userId, groupId) => {
    setSaving(p => ({ ...p, [userId]: true }));
    try {
      await assignUserGroupApi(userId, groupId ? Number(groupId) : null);
      setData(prev => prev.map(u => (u._id || u.id) === userId ? { ...u, hdGroupId: groupId || null } : u));
      toast.success('Group updated');
    } catch { toast.error('Failed to update group'); }
    finally { setSaving(p => ({ ...p, [userId]: false })); }
  };

  const handleBulkAssign = async () => {
    if (!bulkGroup) { toast.error('Select a group first'); return; }
    if (!window.confirm(`Assign all ${filtered.length} visible users to this group?`)) return;
    setBulkAssigning(true);
    try {
      const assignments = filtered.map(u => ({ userId: u._id || u.id, groupId: Number(bulkGroup) }));
      await bulkAssignUserGroupsApi(assignments);
      setData(prev => prev.map(u => ({ ...u, hdGroupId: Number(bulkGroup) })));
      toast.success('All users assigned');
    } catch { toast.error('Bulk assign failed'); }
    finally { setBulkAssigning(false); }
  };

  const filtered = data.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">User Master</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Assign each PLI user to a helpdesk group so Project and Raised-by-Team auto-fill when selecting a requester.
        </p>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading users…</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users…"
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs w-52 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-xs text-gray-400">{filtered.length} user{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Name</th>
                  <th className="px-4 py-2.5 text-left">Email</th>
                  <th className="px-4 py-2.5 text-left">Role</th>
                  <th className="px-4 py-2.5 text-left">Helpdesk Group</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No users found.</td></tr>
                ) : filtered.map(u => {
                  const uid = u._id || u.id;
                  return (
                    <tr key={uid} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-xs font-medium text-gray-800">{u.name}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{u.email}</td>
                      <td className="px-4 py-2 text-xs">
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">{u.role}</span>
                      </td>
                      <td className="px-4 py-2">
                        <select value={u.hdGroupId || ''} onChange={e => handleGroupChange(uid, e.target.value)}
                          disabled={saving[uid]}
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                          <option value="">— Unassigned —</option>
                          {groups.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        {saving[uid] ? 'Saving…' : (u.hdGroup?.name || groups.find(g => (g._id || g.id) == u.hdGroupId)?.name || '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bulk assign */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-3">
            <span className="text-xs font-medium text-gray-700">Bulk Assign:</span>
            <select value={bulkGroup} onChange={e => setBulkGroup(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none">
              <option value="">— Select Group —</option>
              {groups.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={bulkAssigning || !bulkGroup}
              className="px-3 py-1.5 bg-[#2196f3] text-white rounded text-xs font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
              {bulkAssigning ? 'Assigning…' : 'Assign All Visible'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Groups link ────────────────────────────────────────────────────
function GroupsLinkSection() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Groups</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage helpdesk support groups, SLA policies, and approval workflows.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-xl">
            <HiOutlineUserGroup className="w-6 h-6 text-[#2196f3]" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Helpdesk Groups</p>
            <p className="text-sm text-gray-500">Create and configure team groups with SLA and approvals.</p>
          </div>
        </div>
        <button onClick={() => navigate('/helpdesk/groups')}
          className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
          <HiOutlineExternalLink className="w-4 h-4" /> Manage Groups
        </button>
      </div>
    </div>
  );
}

// ─── Section: Mail Server Settings (localStorage) ────────────────────────────
function MailServerSettings() {
  const [form, setForm] = useState(() => getHdSetting('mail_server', {
    host: '', port: '587', user: '', pass: '', from: '', secure: false,
  }));
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    saveHdSetting('mail_server', form);
    setSaved(true);
    toast.success('Mail server settings saved (local)');
    setTimeout(() => setSaved(false), 2000);
  };

  const field = (label, key, type = 'text', placeholder = '') => (
    <div key={key}>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <input type={type} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Mail Server Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Outgoing SMTP configuration for helpdesk email notifications.</p>
      </div>
      <form onSubmit={handleSave} className="bg-white rounded-lg border border-gray-200 p-5 space-y-4 max-w-lg">
        {field('SMTP Host',      'host', 'text', 'mail.example.com')}
        {field('SMTP Port',      'port', 'text', '587')}
        {field('Username',       'user', 'text', 'noreply@example.com')}
        {field('Password',       'pass', 'password', '••••••••')}
        {field('From Address',   'from', 'text', 'Helpdesk <noreply@example.com>')}
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!form.secure} onChange={e => setForm(f => ({ ...f, secure: e.target.checked }))}
            id="smtp-secure" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <label htmlFor="smtp-secure" className="text-sm text-gray-700">Use SSL/TLS</label>
        </div>
        <button type="submit"
          className="px-5 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </form>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 max-w-lg">
        ⚠️ Settings are stored locally in this browser. Configure SMTP in the backend <code>.env</code> file for production use.
      </p>
    </div>
  );
}

// ─── Section: Mail Filter ────────────────────────────────────────────────────
function MailFilterSettings() {
  const [rules, setRules] = useState(() => getHdSetting('mail_filter', []));
  const [newRule, setNewRule] = useState({ keyword: '', action: 'block' });

  const addRule = () => {
    if (!newRule.keyword.trim()) return;
    const updated = [...rules, { ...newRule, id: Date.now() }];
    setRules(updated);
    saveHdSetting('mail_filter', updated);
    setNewRule({ keyword: '', action: 'block' });
    toast.success('Rule added');
  };

  const removeRule = (id) => {
    const updated = rules.filter(r => r.id !== id);
    setRules(updated);
    saveHdSetting('mail_filter', updated);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Mail Filter</h2>
        <p className="text-sm text-gray-500 mt-0.5">Define keywords to automatically block or flag incoming emails.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-lg space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Keyword / Pattern</label>
            <input value={newRule.keyword} onChange={e => setNewRule(r => ({ ...r, keyword: e.target.value }))}
              placeholder="e.g. unsubscribe"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Action</label>
            <select value={newRule.action} onChange={e => setNewRule(r => ({ ...r, action: e.target.value }))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="block">Block</option>
              <option value="flag">Flag</option>
              <option value="auto-close">Auto Close</option>
            </select>
          </div>
          <button onClick={addRule}
            className="px-3 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
            Add
          </button>
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No filter rules yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 text-left">Keyword</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rules.map(r => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-gray-800">{r.keyword}</td>
                  <td className="px-3 py-2 text-gray-600 capitalize">{r.action}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeRule(r.id)} className="text-red-500 hover:text-red-700">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Section: Helpdesk Customization (ticket field options) ──────────────────
function HelpdeskCustomization() {
  const [activeType, setActiveType] = useState('category');
  const [items,       setItems]     = useState([]);
  const [loading,     setLoading]   = useState(false);
  const [showAdd,     setShowAdd]   = useState(false);
  const [newName,     setNewName]   = useState('');
  const [newDesc,     setNewDesc]   = useState('');
  const [saving,      setSaving]    = useState(false);
  const [deletingId,  setDeletingId] = useState(null);
  const [addError,    setAddError]  = useState('');

  const load = useCallback(async (type) => {
    if (type === 'priority_matrix') { setItems([]); return; }
    setLoading(true);
    setAddError('');
    try {
      const res = await getHdOptionsApi(type);
      const raw = res.data?.data;
      setItems(Array.isArray(raw) ? raw : []);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to load options');
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { setShowAdd(false); setNewName(''); setNewDesc(''); load(activeType); }, [activeType, load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError('');
    setSaving(true);
    try {
      await createHdOptionApi({ type: activeType, name: newName.trim(), description: newDesc.trim() || null });
      toast.success('Option added');
      setNewName(''); setNewDesc(''); setShowAdd(false);
      await load(activeType);
    } catch (err) {
      setAddError(err?.response?.data?.error?.message || 'Failed to add option');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove option "${name}"?`)) return;
    setDeletingId(id);
    try {
      await deleteHdOptionApi(id);
      toast.success('Option removed');
      await load(activeType);
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to remove option');
    } finally { setDeletingId(null); }
  };

  const activeTab   = OPTION_TABS.find(t => t.key === activeType);
  const activeLabel = activeTab?.label || activeType;
  const isReadOnly  = !!activeTab?.readOnly;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Helpdesk Customization</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage dropdown options available on ticket forms.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Tab strip */}
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {OPTION_TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveType(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeType === tab.key ? 'text-[#2196f3] border-[#2196f3]' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              {tab.label}
              {tab.readOnly && <span className="ml-1 text-[9px] text-gray-400 font-normal">(fixed)</span>}
            </button>
          ))}
        </div>

        {activeType === 'priority_matrix' ? (
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">Priority is determined by the intersection of Impact and Urgency.</p>
            <table className="text-xs border border-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 bg-gray-50 border-b border-r border-gray-200 text-gray-500">Impact ↓ / Urgency →</th>
                  {['Low','Medium','High'].map(u => <th key={u} className="px-3 py-2 bg-gray-50 border-b border-r border-gray-200 text-gray-700">{u}</th>)}
                </tr>
              </thead>
              <tbody>
                {[['High','High','High','Medium'],['Medium','High','Medium','Low'],['Low','Medium','Low','Low']].map(([impact,...cells]) => (
                  <tr key={impact}>
                    <td className="px-3 py-2 bg-gray-50 border-r border-b border-gray-200 font-medium text-gray-700">{impact}</td>
                    {cells.map((v,i) => (
                      <td key={i} className={`px-3 py-2 border-r border-b border-gray-200 text-center font-semibold ${
                        v==='High'?'text-red-600':v==='Medium'?'text-orange-500':'text-emerald-600'}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                {activeLabel} options {!loading && `(${items.length})`}
                {isReadOnly && (
                  <span className="ml-2 text-xs text-amber-600 font-normal bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    Read-only — defined by the database ENUM
                  </span>
                )}
              </span>
              {!isReadOnly && (
                <button onClick={() => setShowAdd(s => !s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2196f3] text-white rounded-lg text-xs font-medium hover:bg-[#1976d2] transition-colors">
                  {showAdd ? <HiOutlineX className="w-3.5 h-3.5" /> : <HiOutlinePlus className="w-3.5 h-3.5" />}
                  {showAdd ? 'Cancel' : `Add ${activeLabel}`}
                </button>
              )}
            </div>

            {showAdd && (
              <form onSubmit={handleAdd} className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                {addError && <p className="text-xs text-red-600 mb-2">{addError}</p>}
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder={`${activeLabel} name`} required autoFocus
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                    <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                      placeholder="Optional"
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <button type="submit" disabled={saving || !newName.trim()}
                    className="px-4 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
                    {saving ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">No {activeLabel.toLowerCase()} options yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Description</th>
                    <th className="px-4 py-2 w-12">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => {
                    const itemId = item._id || item.id;
                    return (
                      <tr key={itemId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          <span className="text-gray-400 mr-1.5">▸</span>{item.name}
                        </td>
                        <td className="px-4 py-2 text-gray-500">{item.description || '—'}</td>
                        <td className="px-4 py-2">
                          {isReadOnly ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : (
                            <button onClick={() => handleDelete(itemId, item.name)} disabled={deletingId === itemId}
                              className="text-red-500 hover:text-red-700 disabled:opacity-40">
                              {deletingId === itemId ? <span className="text-xs">…</span> : <HiOutlineTrash className="w-4 h-4" />}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Simple option list (Teams or Sites) ────────────────────────────
function SimpleOptionSettings({ type, title, description }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [newName,    setNewName]    = useState('');
  const [adding,     setAdding]     = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [addError,   setAddError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getHdOptionsApi(type);
      const raw = res.data?.data;
      setItems(Array.isArray(raw) ? raw : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError('');
    setAdding(true);
    try {
      await createHdOptionApi({ type, name: newName.trim() });
      toast.success(`${title} added`);
      setNewName('');
      await load();
    } catch (err) {
      setAddError(err?.response?.data?.error?.message || `Failed to add ${title}`);
    } finally { setAdding(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove "${name}"?`)) return;
    setDeletingId(id);
    try {
      await deleteHdOptionApi(id);
      toast.success('Removed');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.error?.message || 'Failed to remove');
    } finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <form onSubmit={handleAdd} className="flex gap-3 items-end max-w-md">
        <div className="flex-1">
          <label className="text-xs font-medium text-gray-600 block mb-1">{title} Name *</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
            placeholder={`Add new ${title.toLowerCase()}…`} required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {addError && <p className="text-xs text-red-600 mt-1">{addError}</p>}
        </div>
        <button type="submit" disabled={adding || !newName.trim()}
          className="px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <div className="py-6 text-center text-gray-400 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-sm bg-white rounded-lg border border-gray-200">
          No {title.toLowerCase()} entries yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">{title}</th>
                <th className="px-4 py-2 w-12">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map(item => {
                const itemId = item._id || item.id;
                return (
                  <tr key={itemId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-800">
                      <span className="text-gray-400 mr-1.5">▸</span>{item.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleDelete(itemId, item.name)} disabled={deletingId === itemId}
                        className="text-red-500 hover:text-red-700 disabled:opacity-40">
                        {deletingId === itemId ? <span className="text-xs">…</span> : <HiOutlineTrash className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Section: Automation ─────────────────────────────────────────────────────
function AutomationSettings() {
  const CARDS = [
    { title: 'Business Rules',   desc: 'Auto-assign tickets based on conditions.' },
    { title: 'SLA Policies',     desc: 'Define response and resolution time targets.' },
    { title: 'Escalations',      desc: 'Auto-escalate tickets that breach SLA.' },
    { title: 'Notifications',    desc: 'Email/SMS alerts for ticket events.' },
    { title: 'Triggers',         desc: 'Fire actions when ticket fields change.' },
    { title: 'Workflows',        desc: 'Multi-step approval and routing flows.' },
  ];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Automation</h2>
        <p className="text-sm text-gray-500 mt-0.5">Configure automated rules, SLA, escalations, and workflows.</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {CARDS.map(c => (
          <div key={c.title} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow cursor-pointer">
            <p className="font-medium text-gray-800 text-sm">{c.title}</p>
            <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
            <p className="text-xs text-[#2196f3] mt-3 font-medium">Configure →</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        ⚠️ Automation rules are not yet active in this environment. Configuration is stored but not applied.
      </p>
    </div>
  );
}

// ─── Section: Advanced Portal Settings (localStorage) ────────────────────────
function AdvancedPortalSettings() {
  const [settings, setSettings] = useState(() => getHdSetting('advanced_portal', {
    quickIncident:          true,
    includeTechnicians:     false,
    showConversations:      true,
    promptReason:           false,
    firstResponseNote:      false,
    firstResponseEmail:     true,
    showNoteToRequester:    false,
    emailTechnicianNote:    false,
  }));
  const [saved, setSaved] = useState(false);

  const save = () => {
    saveHdSetting('advanced_portal', settings);
    setSaved(true);
    toast.success('Settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));

  const rows = [
    ['quickIncident',       'Enable Quick-create Incident button'],
    ['includeTechnicians',  'Include technicians in requester list'],
    ['showConversations',   'Show conversations panel to requester'],
    ['promptReason',        'Prompt agent for reason on status change'],
    ['firstResponseNote',   'Notify on first response (internal note)'],
    ['firstResponseEmail',  'Notify on first response (email)'],
    ['showNoteToRequester', 'Show internal notes to requester'],
    ['emailTechnicianNote', 'Email technician when internal note added'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Advanced Portal Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Fine-tune helpdesk portal behaviour.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-w-lg">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-700">{label}</span>
            <button onClick={() => toggle(key)}
              className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${settings[key] ? 'bg-[#2196f3]' : 'bg-gray-200'}`}>
              <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-0.5 ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={save}
        className="px-5 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  );
}

// ─── Section: Zia AI ─────────────────────────────────────────────────────────
function ZiaSettings() {
  const [settings, setSettings] = useState(() => getHdSetting('zia', {
    suggestions:     false,
    autoCategorize:  false,
    smartReplies:    false,
    sentiment:       false,
  }));
  const [saved, setSaved] = useState(false);

  const toggle = (key) => setSettings(s => ({ ...s, [key]: !s[key] }));

  const save = () => {
    saveHdSetting('zia', settings);
    setSaved(true);
    toast.success('Zia settings saved');
    setTimeout(() => setSaved(false), 2000);
  };

  const rows = [
    ['suggestions',    'Smart suggestions for technicians'],
    ['autoCategorize', 'Auto-categorise incoming tickets'],
    ['smartReplies',   'Smart reply suggestions'],
    ['sentiment',      'Sentiment analysis on conversations'],
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Zia — AI Assistant</h2>
        <p className="text-sm text-gray-500 mt-0.5">Enable AI-powered features to improve helpdesk efficiency.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 max-w-lg">
        {rows.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-gray-700">{label}</span>
            <button onClick={() => toggle(key)}
              className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${settings[key] ? 'bg-[#2196f3]' : 'bg-gray-200'}`}>
              <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-0.5 ${settings[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={save}
        className="px-5 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
      <p className="text-xs text-gray-400">AI features are placeholders in this environment.</p>
    </div>
  );
}

// ─── Section: Announcement link ───────────────────────────────────────────────
function AnnouncementLink() {
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Announcements</h2>
        <p className="text-sm text-gray-500 mt-0.5">Publish notices visible to all helpdesk users.</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between max-w-lg">
        <p className="text-sm text-gray-700">Manage helpdesk announcements</p>
        <button onClick={() => navigate('/helpdesk/announcements')}
          className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] transition-colors">
          <HiOutlineExternalLink className="w-4 h-4" /> Open
        </button>
      </div>
    </div>
  );
}

// ─── Section: Additional Fields ───────────────────────────────────────────────
function AdditionalFieldsSettings() {
  const [fields, setFields] = useState(() => getHdSetting('custom_ticket_fields', []));
  const [newField, setNewField] = useState({ label: '', type: 'text', required: false });
  const [adding, setAdding] = useState(false);

  const addField = (e) => {
    e.preventDefault();
    if (!newField.label.trim()) return;
    setAdding(true);
    const updated = [...fields, { ...newField, id: Date.now(), label: newField.label.trim() }];
    setFields(updated);
    saveHdSetting('custom_ticket_fields', updated);
    setNewField({ label: '', type: 'text', required: false });
    toast.success('Field added');
    setAdding(false);
  };

  const removeField = (id) => {
    const updated = fields.filter(f => f.id !== id);
    setFields(updated);
    saveHdSetting('custom_ticket_fields', updated);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Additional Fields</h2>
        <p className="text-sm text-gray-500 mt-0.5">Add custom fields to the ticket creation form.</p>
      </div>
      <form onSubmit={addField} className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Field Label *</label>
          <input value={newField.label} onChange={e => setNewField(f => ({ ...f, label: e.target.value }))}
            placeholder="e.g. Asset Tag" required
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Type</label>
          <select value={newField.type} onChange={e => setNewField(f => ({ ...f, type: e.target.value }))}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Dropdown</option>
            <option value="checkbox">Checkbox</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 pb-1">
          <input type="checkbox" id="req-field" checked={newField.required} onChange={e => setNewField(f => ({ ...f, required: e.target.checked }))}
            className="w-4 h-4 rounded border-gray-300 text-blue-600" />
          <label htmlFor="req-field" className="text-sm text-gray-700">Required</label>
        </div>
        <button type="submit" disabled={adding}
          className="px-4 py-1.5 bg-[#2196f3] text-white rounded-lg text-sm font-medium hover:bg-[#1976d2] disabled:opacity-50 transition-colors">
          Add Field
        </button>
      </form>

      {fields.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-sm bg-white rounded-lg border border-gray-200">
          No custom fields yet.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Label</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Required</th>
                <th className="px-4 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {fields.map(f => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">{f.label}</td>
                  <td className="px-4 py-2.5 text-gray-600 capitalize">{f.type}</td>
                  <td className="px-4 py-2.5 text-gray-500">{f.required ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => removeField(f.id)} className="text-red-500 hover:text-red-700">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Content router ────────────────────────────────────────────────────────────
function ContentPanel({ activeId }) {
  switch (activeId) {
    case 'instance':         return <InstanceSettings />;
    case 'projects':         return <ProjectsSettings />;
    case 'user-master':      return <UserMasterSettings />;
    case 'groups-perm':      return <GroupsLinkSection />;
    case 'mail-server':      return <MailServerSettings />;
    case 'mail-filter':      return <MailFilterSettings />;
    case 'email-command':    return <PlaceholderContent title="Email Command" />;
    case 'helpdesk':         return <HelpdeskCustomization />;
    case 'additional-fields':return <AdditionalFieldsSettings />;
    case 'checklists':       return <PlaceholderContent title="Checklists" />;
    case 'announcement':     return <AnnouncementLink />;
    case 'templates':        return <PlaceholderContent title="Templates & Forms" />;
    case 'layouts':          return <PlaceholderContent title="Layouts" />;
    case 'automation':       return <AutomationSettings />;
    case 'survey':           return <PlaceholderContent title="User Survey" />;
    case 'teams':            return <SimpleOptionSettings type="team" title="Raised-by Teams" description="Add or remove teams used in the 'Raised by Team' field on tickets." />;
    case 'groups':           return <GroupsLinkSection />;
    case 'sites':            return <SimpleOptionSettings type="site" title="Sites" description="Add or remove site locations used when raising tickets." />;
    case 'advanced-portal':  return <AdvancedPortalSettings />;
    case 'requester-portal': return <PlaceholderContent title="Requester Portal" />;
    case 'apps':             return <PlaceholderContent title="Apps & Add-ons" />;
    case 'developer':        return <PlaceholderContent title="Developer Space" />;
    case 'zia':              return <ZiaSettings />;
    case 'reports':          return <PlaceholderContent title="Reports" />;
    default:                 return <InstanceSettings />;
  }
}

// ─── Main: HdSettings ────────────────────────────────────────────────────────
export default function HdSettings() {
  const { user } = useSelector(s => s.auth);
  const [activeId,  setActiveId]  = useState('instance');
  const [expanded,  setExpanded]  = useState({});   // group open/closed

  if (!['admin', 'senior_manager'].includes(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-gray-700">Access Denied</p>
        <p className="text-sm text-gray-400 mt-2">You do not have permission to view Helpdesk Settings.</p>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';

  const toggleGroup = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const handleItemClick = (id, hasChildren) => {
    if (hasChildren) {
      toggleGroup(id);
    } else {
      setActiveId(id);
    }
  };

  // Find if an item or its sub-items is active
  const isGroupActive = (item) =>
    item.id === activeId || (item.items || []).some(s => s.id === activeId);

  const isGroupOpen = (item) =>
    expanded[item.id] !== undefined ? expanded[item.id] : isGroupActive(item);

  return (
    <div className="h-full flex bg-[#f5f5f5]">
      {/* ── Left sidebar ────────────────────────────────────────────────────── */}
      <div className="w-60 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#2196f3] text-sm">Setup</h2>
        </div>
        <nav className="flex-1 overflow-auto py-1">
          {MENU_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => {
            const Icon = item.icon;
            const hasChildren = !!(item.items?.length);
            const groupOpen   = isGroupOpen(item);
            const groupActive = isGroupActive(item);

            return (
              <div key={item.id}>
                {/* Group / top-level item */}
                <button
                  onClick={() => handleItemClick(item.id, hasChildren)}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-left transition-colors ${
                    !hasChildren && activeId === item.id
                      ? 'bg-blue-50 text-[#2196f3] font-medium'
                      : groupActive && hasChildren
                      ? 'text-[#2196f3]'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    groupOpen
                      ? <HiOutlineChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      : <HiOutlineChevronRight className="w-3.5 h-3.5 text-gray-400" />
                  )}
                </button>

                {/* Sub-items */}
                {hasChildren && groupOpen && (
                  <div>
                    {item.items.map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => setActiveId(sub.id)}
                        className={`w-full text-left px-10 py-2 text-sm transition-colors ${
                          activeId === sub.id
                            ? 'bg-blue-50 text-[#2196f3] font-medium'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* ── Right content panel ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <ContentPanel activeId={activeId} />
      </div>
    </div>
  );
}
