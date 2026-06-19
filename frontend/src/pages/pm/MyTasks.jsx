import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { getProjectsApi } from '../../api/pm/projects.api';
import { getAllProjectTasksApi, updateTaskStatusApi } from '../../api/pm/tasks.api';
import { HiOutlineCheckCircle, HiOutlineClock, HiOutlineExclamation } from 'react-icons/hi';

const STATUS_COLORS = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-red-100 text-red-700',
};

export default function MyTasks() {
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const pRes = await getProjectsApi();
        const projects = pRes.data.data || [];
        // Single request per project — no N+1 per milestone
        const allTasks = [];
        await Promise.all(projects.map(async (p) => {
          const pid = p._id || p.id;
          const tRes = await getAllProjectTasksApi(pid).catch(() => ({ data: { data: [] } }));
          const tasks = (tRes.data.data || []).filter(t => t.assignedToId === user?._id || t.assignedToId === user?.id);
          tasks.forEach(t => allTasks.push({ ...t, projectName: p.name, projectId: pid, milestoneName: t.milestone?.name || '—' }));
        }));
        setMyTasks(allTasks);
      } catch { toast.error('Failed to load tasks'); }
      finally { setLoading(false); }
    };
    load();
  }, [user]);

  const filtered = statusFilter ? myTasks.filter(t => t.status === statusFilter) : myTasks;
  const today = new Date().toISOString().slice(0, 10);

  const handleStatus = async (task, status) => {
    try {
      await updateTaskStatusApi(task.projectId, task.milestoneId, task._id || task.id, status);
      setMyTasks(p => p.map(t => (t._id || t.id) === (task._id || task.id) ? { ...t, status } : t));
      toast.success('Status updated');
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
        <p className="text-sm text-gray-500 mt-1">Tasks assigned to you across all projects</p>
      </div>

      <div className="flex gap-3 items-center">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value="">All Statuses</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
        <span className="text-xs text-gray-400">{filtered.length} tasks</span>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading your tasks...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineCheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No tasks assigned to you</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left">Task</th>
                <th className="px-5 py-3 text-left">Project</th>
                <th className="px-5 py-3 text-left">Milestone</th>
                <th className="px-5 py-3 text-left">Due Date</th>
                <th className="px-5 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(task => {
                const isOverdue = task.dueDate && task.dueDate < today && task.status !== 'completed';
                return (
                  <tr key={task._id || task.id} className={isOverdue ? 'bg-red-50' : 'hover:bg-gray-50'}>
                    <td className="px-5 py-3 font-medium text-gray-900">{task.title}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => navigate(`/pm/projects/${task.projectId}`)} className="text-emerald-600 hover:underline text-xs">
                        {task.projectName}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{task.milestoneName}</td>
                    <td className={`px-5 py-3 text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN') : '—'}
                      {isOverdue && ' ⚠️'}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={task.status}
                        onChange={e => handleStatus(task, e.target.value)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer capitalize ${STATUS_COLORS[task.status] || 'bg-gray-100'}`}
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="blocked">Blocked</option>
                      </select>
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
