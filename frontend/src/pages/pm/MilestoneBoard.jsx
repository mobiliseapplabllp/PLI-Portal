import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { getMilestonesApi, createMilestoneApi, updateMilestoneApi, deleteMilestoneApi, updateMilestoneStatusApi, updateMilestoneProgressApi } from '../../api/pm/milestones.api';
import { getProjectByIdApi } from '../../api/pm/projects.api';
import { getUsersApi } from '../../api/users.api';
import { HiOutlineArrowLeft, HiOutlinePlus, HiOutlineTrash, HiOutlinePencil, HiOutlineFlag } from 'react-icons/hi';

const STATUS_OPTIONS = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'cancelled'];
const STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  delayed: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-400',
};
const MANAGER_ROLES = ['admin', 'manager', 'senior_manager'];

const EMPTY_FORM = { name: '', description: '', startDate: '', endDate: '', accountableUserId: '', status: 'not_started', completionPercentage: 0 };

export default function MilestoneBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const canManage = MANAGER_ROLES.includes(user?.role);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([getProjectByIdApi(id), getMilestonesApi(id)]);
      setProject(pRes.data.data);
      setMilestones(mRes.data.data || []);
    } catch { toast.error('Failed to load milestones'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    getUsersApi({ isActive: true, limit: 200 }).then(res => setUsers(res.data?.data?.users || res.data?.data || [])).catch(() => {});
  }, [id]);

  const set = (f, v) => setForm(prev => ({ ...prev, [f]: v }));

  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); };
  const openEdit = (m) => { setForm({ name: m.name, description: m.description || '', startDate: m.startDate || '', endDate: m.endDate || '', accountableUserId: m.accountableUserId || '', status: m.status, completionPercentage: m.completionPercentage || 0 }); setEditingId(m.id); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Milestone name is required');
    setSaving(true);
    try {
      if (editingId) {
        await updateMilestoneApi(id, editingId, form);
        toast.success('Milestone updated');
      } else {
        await createMilestoneApi(id, form);
        toast.success('Milestone created');
      }
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (milestoneId) => {
    if (!window.confirm('Delete this milestone and all its tasks?')) return;
    try {
      await deleteMilestoneApi(id, milestoneId);
      toast.success('Milestone deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const handleStatusChange = async (milestoneId, status) => {
    try {
      await updateMilestoneStatusApi(id, milestoneId, status);
      setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, status } : m));
    } catch { toast.error('Failed to update status'); }
  };

  const handleProgressChange = async (milestoneId, completionPercentage) => {
    try {
      await updateMilestoneProgressApi(id, milestoneId, Number(completionPercentage));
      setMilestones(prev => prev.map(m => m.id === milestoneId ? { ...m, completionPercentage: Number(completionPercentage) } : m));
    } catch { toast.error('Failed to update progress'); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/pm/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Milestones</h1>
          <p className="text-sm text-gray-500">{project?.name || '...'}</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => navigate(`/pm/projects/${id}/gantt`)} className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
              Gantt View
            </button>
            <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              <HiOutlinePlus className="w-4 h-4" /> Add Milestone
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">{editingId ? 'Edit Milestone' : 'New Milestone'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Milestone Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} className={inputClass} placeholder="e.g. Design Phase Complete" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">End Date (Deadline)</label>
              <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Accountable Person</label>
              <select value={form.accountableUserId} onChange={e => set('accountableUserId', e.target.value)} className={inputClass}>
                <option value="">Select person</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Completion % ({form.completionPercentage}%)</label>
              <input type="range" min="0" max="100" step="5" value={form.completionPercentage} onChange={e => set('completionPercentage', Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Milestones Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">Loading...</div>
      ) : milestones.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineFlag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No milestones yet</p>
          {canManage && <button onClick={openCreate} className="mt-3 text-sm text-emerald-600 hover:underline">Add the first milestone</button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left">#</th>
                <th className="px-5 py-3 text-left">Milestone</th>
                <th className="px-5 py-3 text-left">Accountable</th>
                <th className="px-5 py-3 text-left">Start</th>
                <th className="px-5 py-3 text-left">Due Date</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Progress</th>
                {canManage && <th className="px-5 py-3 text-left">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {milestones.map((m, i) => {
                const isDelayed = m.endDate && m.endDate < today && m.status !== 'completed';
                return (
                  <tr key={m.id} className={isDelayed ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{m.name}</p>
                      {m.description && <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{m.accountableUser?.name || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{m.startDate ? new Date(m.startDate).toLocaleDateString('en-IN') : '—'}</td>
                    <td className={`px-5 py-3 text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {m.endDate ? new Date(m.endDate).toLocaleDateString('en-IN') : '—'}
                      {isDelayed && ' ⚠️'}
                    </td>
                    <td className="px-5 py-3">
                      {canManage ? (
                        <select
                          value={m.status}
                          onChange={e => handleStatusChange(m.id, e.target.value)}
                          className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer capitalize ${STATUS_COLORS[m.status] || 'bg-gray-100'}`}
                        >
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[m.status] || 'bg-gray-100'}`}>
                          {m.status?.replace(/_/g, ' ')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="range" min="0" max="100" step="5"
                            value={m.completionPercentage || 0}
                            onChange={e => handleProgressChange(m.id, e.target.value)}
                            className="w-20"
                          />
                          <span className="text-xs text-gray-500 w-8">{m.completionPercentage || 0}%</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-gray-200 rounded-full">
                            <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${m.completionPercentage || 0}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{m.completionPercentage || 0}%</span>
                        </div>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(m)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors">
                            <HiOutlinePencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(m.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors">
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
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
