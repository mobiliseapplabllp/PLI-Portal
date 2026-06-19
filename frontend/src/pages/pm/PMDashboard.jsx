import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProjects } from '../../store/pmSlice';
import {
  HiOutlineFolderOpen, HiOutlineCheckCircle, HiOutlineClock,
  HiOutlineExclamation, HiOutlineFlag, HiOutlineArrowRight,
} from 'react-icons/hi';

const STATUS_COLORS = {
  planning: 'bg-gray-100 text-gray-700',
  active: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

const OVERALL_COLORS = {
  on_track: 'text-emerald-600',
  at_risk: 'text-yellow-600',
  delayed: 'text-red-600',
  completed: 'text-blue-600',
};

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function PMDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { projects, loading } = useSelector(s => s.pm);

  useEffect(() => { dispatch(fetchProjects()); }, [dispatch]);

  const active = projects.filter(p => p.status === 'active');
  const completed = projects.filter(p => p.status === 'completed');
  const onHold = projects.filter(p => p.status === 'on_hold');

  // Collect upcoming milestone deadlines across all projects
  const today = new Date().toISOString().slice(0, 10);
  const upcomingMilestones = [];
  projects.forEach(p => {
    (p.milestones || []).forEach(m => {
      if (!m.endDate || m.status === 'completed') return;
      const diff = Math.round((new Date(m.endDate) - new Date(today)) / 86400000);
      if (diff >= 0 && diff <= 14) {
        upcomingMilestones.push({ ...m, projectName: p.name, projectId: p.id, daysLeft: diff });
      }
    });
  });
  upcomingMilestones.sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Project Management</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of all projects, milestones, and deadlines</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={projects.length} icon={HiOutlineFolderOpen} color="bg-blue-100 text-blue-600" />
        <StatCard label="Active" value={active.length} icon={HiOutlineClock} color="bg-emerald-100 text-emerald-600" />
        <StatCard label="Completed" value={completed.length} icon={HiOutlineCheckCircle} color="bg-indigo-100 text-indigo-600" />
        <StatCard label="On Hold" value={onHold.length} icon={HiOutlineExclamation} color="bg-yellow-100 text-yellow-600" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Active Projects */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Active Projects</h2>
            <button onClick={() => navigate('/pm/projects')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              View All <HiOutlineArrowRight className="w-3 h-3" />
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
          ) : active.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No active projects</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {active.slice(0, 6).map(p => {
                const milestones = p.milestones || [];
                const done = milestones.filter(m => m.status === 'completed').length;
                const pct = milestones.length > 0 ? Math.round((done / milestones.length) * 100) : 0;
                return (
                  <div
                    key={p._id || p.id}
                    onClick={() => navigate(`/pm/projects/${p._id || p.id}`)}
                    className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          PM: {p.projectManager?.name || 'â€”'} Â· {milestones.length} milestones
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-gray-700">{pct}%</span>
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full mt-1">
                          <div
                            className="h-1.5 bg-emerald-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Milestones */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Upcoming Deadlines <span className="text-xs font-normal text-gray-400">(next 14 days)</span></h2>
          </div>
          {upcomingMilestones.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No upcoming deadlines</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingMilestones.slice(0, 8).map(m => (
                <div
                  key={m._id || m.id}
                  onClick={() => navigate(`/pm/projects/${m.projectId}`)}
                  className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-3"
                >
                  <HiOutlineFlag className={`w-4 h-4 flex-shrink-0 ${m.daysLeft <= 2 ? 'text-red-500' : m.daysLeft <= 5 ? 'text-yellow-500' : 'text-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.projectName}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0
                    ${m.daysLeft === 0 ? 'bg-red-100 text-red-700' :
                      m.daysLeft <= 2 ? 'bg-red-100 text-red-700' :
                      m.daysLeft <= 5 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'}`}>
                    {m.daysLeft === 0 ? 'Today' : `${m.daysLeft}d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* All Projects Quick Table */}
      {projects.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">All Projects</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left">Project</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-left">Manager</th>
                  <th className="px-5 py-3 text-left">End Date</th>
                  <th className="px-5 py-3 text-left">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projects.map(p => {
                  const ms = p.milestones || [];
                  const pct = ms.length > 0 ? Math.round((ms.filter(m => m.status === 'completed').length / ms.length) * 100) : 0;
                  return (
                    <tr
                      key={p._id || p.id}
                      onClick={() => navigate(`/pm/projects/${p._id || p.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                          {p.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{p.projectManager?.name || 'â€”'}</td>
                      <td className="px-5 py-3 text-gray-600">
                        {p.endDate ? new Date(p.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'â€”'}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full">
                            <div className="h-1.5 bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

