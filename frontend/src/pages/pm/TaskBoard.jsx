import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { getTasksApi, createTaskApi, updateTaskApi, deleteTaskApi, updateTaskStatusApi } from '../../api/pm/tasks.api';
import { getMilestonesApi } from '../../api/pm/milestones.api';
import { getProjectByIdApi } from '../../api/pm/projects.api';
import { getUsersApi } from '../../api/users.api';
import { HiOutlineArrowLeft, HiOutlinePlus, HiOutlineTrash, HiOutlinePencil } from 'react-icons/hi';

const COLUMNS = [
  { id: 'todo', label: 'To Do', color: 'bg-gray-50 border-gray-200', header: 'text-gray-700' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-50 border-blue-200', header: 'text-blue-700' },
  { id: 'completed', label: 'Completed', color: 'bg-emerald-50 border-emerald-200', header: 'text-emerald-700' },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-50 border-red-200', header: 'text-red-700' },
];

export default function TaskBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState({ milestoneId: '', title: '', assignedToId: '', dueDate: '', notes: '', status: 'todo' });
  const [milestoneFilter, setMilestoneFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([getProjectByIdApi(id), getMilestonesApi(id)]);
      setProject(pRes.data.data);
      const ms = mRes.data.data || [];
      setMilestones(ms);
      // Load all tasks across all milestones
      const taskArrays = await Promise.all(ms.map(m => getTasksApi(id, m.id).then(r => r.data.data || []).catch(() => [])));
      setTasks(taskArrays.flat());
    } catch { toast.error('Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    getUsersApi({ isActive: true, limit: 200 }).then(r => setUsers(r.data?.data?.users || r.data?.data || [])).catch(() => {});
  }, [id]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSave = async () => {
    if (!form.milestoneId) return toast.error('Select a milestone');
    if (!form.title.trim()) return toast.error('Task title is required');
    setSaving(true);
    try {
      if (editingTask) {
        await updateTaskApi(id, form.milestoneId || editingTask.milestoneId, editingTask.id, form);
        toast.success('Task updated');
      } else {
        await createTaskApi(id, form.milestoneId, form);
        toast.success('Task created');
      }
      setShowForm(false);
      load();
    } catch (err) { toast.error(err.response?.data?.error?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (task) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await deleteTaskApi(id, task.milestoneId, task.id);
      toast.success('Task deleted');
      load();
    } catch { toast.error('Failed'); }
  };

  const handleStatusChange = async (task, status) => {
    try {
      await updateTaskStatusApi(id, task.milestoneId, task.id, status);
      setTasks(p => p.map(t => t.id === task.id ? { ...t, status } : t));
    } catch { toast.error('Failed to update status'); }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";

  const filteredTasks = tasks.filter(t => {
    if (milestoneFilter && t.milestoneId !== milestoneFilter) return false;
    if (assigneeFilter && t.assignedToId !== assigneeFilter) return false;
    return true;
  });

  const columnTasks = (status) => filteredTasks.filter(t => t.status === status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/pm/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Task Board</h1>
          <p className="text-sm text-gray-500">{project?.name || '...'}</p>
        </div>
        <button
          onClick={() => { setForm({ milestoneId: '', title: '', assignedToId: '', dueDate: '', notes: '', status: 'todo' }); setEditingTask(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <HiOutlinePlus className="w-4 h-4" /> Add Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={milestoneFilter} onChange={e => setMilestoneFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value="">All Milestones</option>
          {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value="">All Assignees</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="text-xs text-gray-400 self-center">{filteredTasks.length} tasks</span>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">{editingTask ? 'Edit Task' : 'New Task'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Milestone *</label>
              <select value={form.milestoneId} onChange={e => set('milestoneId', e.target.value)} className={inputClass}>
                <option value="">Select milestone</option>
                {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Assign To</label>
              <select value={form.assignedToId} onChange={e => set('assignedToId', e.target.value)} className={inputClass}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Task Title *</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} className={inputClass} placeholder="e.g. Design login screen mockups" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving...' : editingTask ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading tasks...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 min-h-64">
          {COLUMNS.map(col => {
            const colTasks = columnTasks(col.id);
            return (
              <div key={col.id} className={`rounded-xl border ${col.color} p-3`}>
                <div className={`flex items-center justify-between mb-3`}>
                  <h3 className={`text-sm font-semibold ${col.header}`}>{col.label}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full bg-white ${col.header}`}>{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(task => (
                    <div key={task.id} className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
                      <p className="text-sm font-medium text-gray-900 leading-snug">{task.title}</p>
                      <p className="text-xs text-gray-400 mt-1">{task.milestone?.name || '—'}</p>
                      {task.assignedTo && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                            {task.assignedTo.name?.charAt(0) || '?'}
                          </div>
                          <span className="text-xs text-gray-500">{task.assignedTo.name}</span>
                        </div>
                      )}
                      {task.dueDate && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Due: {new Date(task.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50">
                        <select
                          value={task.status}
                          onChange={e => handleStatusChange(task, e.target.value)}
                          className="flex-1 text-[10px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 cursor-pointer"
                        >
                          {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button
                          onClick={() => { setForm({ milestoneId: task.milestoneId, title: task.title, assignedToId: task.assignedToId || '', dueDate: task.dueDate || '', notes: task.notes || '', status: task.status }); setEditingTask(task); setShowForm(true); }}
                          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"
                        >
                          <HiOutlinePencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleDelete(task)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600">
                          <HiOutlineTrash className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center text-xs text-gray-400 py-6">Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
