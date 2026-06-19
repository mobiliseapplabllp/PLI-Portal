import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProjectById, clearActiveProject } from '../../store/pmSlice';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft, HiOutlinePencil, HiOutlineUserAdd,
  HiOutlineFlag, HiOutlineChartBar, HiOutlineUsers, HiOutlineMail,
  HiOutlineCalendar, HiOutlineClipboardList,
} from 'react-icons/hi';
import { updateProjectApi, addMemberApi, removeMemberApi } from '../../api/pm/projects.api';
import { getUsersApi } from '../../api/users.api';

const STATUS_COLORS = {
  planning: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

const MILESTONE_STATUS_COLORS = {
  not_started: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  delayed: 'bg-red-100 text-red-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-gray-100 text-gray-400',
};

const MANAGER_ROLES = ['admin', 'manager', 'senior_manager'];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { activeProject: project, loading, error } = useSelector(s => s.pm);
  const { user } = useSelector(s => s.auth);
  const [activeTab, setActiveTab] = useState('overview');
  const [allUsers, setAllUsers] = useState([]);
  const [addingMember, setAddingMember] = useState(false);
  const [memberForm, setMemberForm] = useState({ userId: '', role: '', responsibilities: '' });
  const [statusUpdating, setStatusUpdating] = useState(false);

  useEffect(() => {
    dispatch(clearActiveProject());
    dispatch(fetchProjectById(id));
  }, [dispatch, id]);

  useEffect(() => {
    if (MANAGER_ROLES.includes(user?.role)) {
      getUsersApi({ isActive: true, limit: 200 }).then(res => setAllUsers(res.data?.data?.users || res.data?.data || [])).catch(() => {});
    }
  }, [user]);

  const canManage = MANAGER_ROLES.includes(user?.role) || (project && String(project.managerId) === String(user?._id));

  const handleStatusChange = async (status) => {
    setStatusUpdating(true);
    try {
      await updateProjectApi(id, { status });
      dispatch(fetchProjectById(id));
      toast.success('Status updated');
    } catch (err) {
      toast.error('Failed to update status');
    } finally { setStatusUpdating(false); }
  };

  const handleAddMember = async () => {
    if (!memberForm.userId) return toast.error('Select a user');
    try {
      await addMemberApi(id, memberForm);
      toast.success('Member added');
      dispatch(fetchProjectById(id));
      setMemberForm({ userId: '', role: '', responsibilities: '' });
      setAddingMember(false);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!window.confirm('Remove this member?')) return;
    try {
      await removeMemberApi(id, memberId);
      toast.success('Member removed');
      dispatch(fetchProjectById(id));
    } catch { toast.error('Failed to remove member'); }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-32 bg-gray-100 rounded-xl" />
        <div className="h-24 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-gray-700 mb-2">Project not found</p>
        <p className="text-sm text-gray-400 mb-6">{error || 'This project may have been deleted or you may not have access.'}</p>
        <button onClick={() => navigate('/pm/projects')} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors">
          Back to Projects
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const milestones = project.milestones || [];
  const members = project.members || [];
  const total = milestones.length;
  const completed = milestones.filter(m => m.status === 'completed').length;
  const delayed = milestones.filter(m => m.status === 'delayed' || (m.endDate && m.endDate < today && m.status !== 'completed')).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: HiOutlineChartBar },
    { id: 'milestones', label: `Milestones (${total})`, icon: HiOutlineFlag },
    { id: 'team', label: `Team (${members.length})`, icon: HiOutlineUsers },
    { id: 'dailylog', label: 'Daily Log', icon: HiOutlineClipboardList },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/pm/projects')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 mt-1 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            {canManage ? (
              <select
                value={project.status}
                onChange={e => handleStatusChange(e.target.value)}
                disabled={statusUpdating}
                className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 cursor-pointer capitalize ${STATUS_COLORS[project.status] || 'bg-gray-100'}`}
              >
                {['planning', 'active', 'on_hold', 'completed', 'cancelled'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            ) : (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[project.status] || 'bg-gray-100'}`}>
                {project.status?.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
            <span>PM: <strong className="text-gray-700">{project.projectManager?.name || 'â€”'}</strong></span>
            <span>Owner: <strong className="text-gray-700">{project.owner?.name || 'â€”'}</strong></span>
            {project.clientName && <span>Client: <strong className="text-gray-700">{project.clientName}</strong></span>}
            {project.endDate && <span>Due: <strong className="text-gray-700">{new Date(project.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>}
          </div>
        </div>

        {canManage && (
          <button
            onClick={() => navigate(`/pm/projects/${id}/milestones`)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <HiOutlineFlag className="w-4 h-4" />
            Manage Milestones
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Overall Progress</span>
          <span className="text-sm font-bold text-emerald-700">{pct}%</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full">
          <div className="h-3 bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-6 mt-3 text-xs text-gray-500">
          <span><strong className="text-gray-900">{total}</strong> Total</span>
          <span><strong className="text-emerald-600">{completed}</strong> Completed</span>
          <span><strong className="text-blue-600">{milestones.filter(m => m.status === 'in_progress').length}</strong> In Progress</span>
          <span><strong className="text-red-600">{delayed}</strong> Delayed</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.id ? 'text-emerald-700 border-emerald-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            {project.description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-gray-700">{project.description}</p>
              </div>
            )}
            {project.purpose && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Purpose / Objective</p>
                <p className="text-sm text-gray-700">{project.purpose}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              {[
                ['Start Date', project.startDate ? new Date(project.startDate).toLocaleDateString('en-IN') : 'â€”'],
                ['End Date', project.endDate ? new Date(project.endDate).toLocaleDateString('en-IN') : 'â€”'],
                ['Client', project.clientName || 'â€”'],
                ['Notify Client', project.notifyClient ? 'Yes' : 'No'],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-xs text-gray-400 uppercase tracking-wider">{l}</p>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Gantt Quick View */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Milestone Timeline</h3>
              <button
                onClick={() => navigate(`/pm/projects/${id}/gantt`)}
                className="text-xs text-emerald-600 hover:underline"
              >
                Full Gantt View â†’
              </button>
            </div>
            {milestones.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No milestones yet</p>
            ) : (
              <div className="space-y-2">
                {milestones.map(m => {
                  const isDelayed = m.endDate && m.endDate < today && m.status !== 'completed';
                  return (
                    <div key={m._id || m.id} className="flex items-center gap-3">
                      <div className="w-1/3 text-xs text-gray-700 truncate">{m.name}</div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize whitespace-nowrap ${MILESTONE_STATUS_COLORS[m.status] || 'bg-gray-100'}`}>
                        {m.status?.replace(/_/g, ' ')}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full">
                        <div
                          className={`h-2 rounded-full ${isDelayed ? 'bg-red-400' : m.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${m.completionPercentage || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-8 text-right">{m.completionPercentage || 0}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Milestones Tab */}
      {activeTab === 'milestones' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Milestones</h3>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/pm/projects/${id}/gantt`)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">Gantt View</button>
              {canManage && <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">Manage</button>}
            </div>
          </div>
          {milestones.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No milestones. {canManage && <span>Click Manage to add some.</span>}</div>
          ) : (
            <div className="overflow-x-auto">
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {milestones.map((m, i) => {
                    const isDelayed = m.endDate && m.endDate < today && m.status !== 'completed';
                    return (
                      <tr key={m._id || m.id} className={isDelayed ? 'bg-red-50' : ''}>
                        <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{m.name}</p>
                          {m.description && <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{m.accountableUser?.name || 'â€”'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{m.startDate ? new Date(m.startDate).toLocaleDateString('en-IN') : 'â€”'}</td>
                        <td className={`px-5 py-3 text-xs ${isDelayed ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {m.endDate ? new Date(m.endDate).toLocaleDateString('en-IN') : 'â€”'}
                          {isDelayed && ' âš ï¸'}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${MILESTONE_STATUS_COLORS[m.status] || 'bg-gray-100'}`}>
                            {m.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-gray-200 rounded-full">
                              <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${m.completionPercentage || 0}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{m.completionPercentage || 0}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Team Members</h3>
            {canManage && (
              <button onClick={() => setAddingMember(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
                <HiOutlineUserAdd className="w-3.5 h-3.5" /> Add Member
              </button>
            )}
          </div>

          {addingMember && (
            <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-100">
              <div className="flex gap-3 flex-wrap items-end">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">User</label>
                  <select value={memberForm.userId} onChange={e => setMemberForm(f => ({ ...f, userId: e.target.value }))} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                    <option value="">Select user</option>
                    {allUsers.filter(u => !members.some(m => m.userId === (u._id || u.id))).map(u => <option key={u._id || u.id} value={u._id || u.id}>{u.name} ({u.role})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Role in Project</label>
                  <input value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Frontend Dev" className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-36" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Responsibilities</label>
                  <input value={memberForm.responsibilities} onChange={e => setMemberForm(f => ({ ...f, responsibilities: e.target.value }))} placeholder="Brief note..." className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-48" />
                </div>
                <button onClick={handleAddMember} className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-colors">Add</button>
                <button onClick={() => setAddingMember(false)} className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-sm transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {members.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No team members assigned</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {members.map(m => (
                <div key={m._id || m.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {m.user?.name?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{m.user?.name}</p>
                    <p className="text-xs text-gray-500">{m.user?.email} Â· {m.user?.role?.replace(/_/g, ' ')}</p>
                    {m.role && <p className="text-xs text-emerald-700 mt-0.5">Project Role: {m.role}</p>}
                    {m.responsibilities && <p className="text-xs text-gray-400 mt-0.5">{m.responsibilities}</p>}
                  </div>
                  {canManage && (
                    <button onClick={() => handleRemoveMember(m._id || m.id)} className="text-xs text-red-500 hover:text-red-700 transition-colors">Remove</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Daily Log Tab */}
      {activeTab === 'dailylog' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">Submit or view today's status report</p>
            <div className="flex gap-2">
              <button onClick={() => navigate(`/pm/projects/${id}/daily-log`)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
                Update Today's Log
              </button>
              <button onClick={() => navigate(`/pm/projects/${id}/daily-logs`)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                View History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

