import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProjects } from '../../store/pmSlice';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineFolderOpen } from 'react-icons/hi';

// New status names (from pm_statuses config table)
const STATUS_COLORS = {
  'Yet to Start':  'bg-gray-100 text-gray-700',
  'Active':        'bg-emerald-100 text-emerald-700',
  'On Hold':       'bg-yellow-100 text-yellow-700',
  'On Track':      'bg-blue-100 text-blue-700',
  'Cancelled':     'bg-red-100 text-red-700',
  'Delayed':       'bg-orange-100 text-orange-700',
  'Completed':     'bg-blue-100 text-blue-700',
  // legacy (backward compat)
  planning:        'bg-gray-100 text-gray-700',
  active:          'bg-emerald-100 text-emerald-700',
  on_hold:         'bg-yellow-100 text-yellow-700',
  completed:       'bg-blue-100 text-blue-700',
  cancelled:       'bg-red-100 text-red-700',
};

const BILLING_TYPE_OPTIONS = ['', 'Billable', 'Non-Billable'];

// Roles that can create projects — backend enforces allowedCreatorRoles from PMSettings
const CREATOR_ROLES = ['admin', 'manager', 'senior_manager', 'md', 'director'];

export default function ProjectList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { projects, loading } = useSelector(s => s.pm);
  const { user } = useSelector(s => s.auth);
  const [search,      setSearch]      = useState('');
  const [statusFilter,setStatusFilter]= useState('');
  const [typeFilter,  setTypeFilter]  = useState('');

  useEffect(() => { dispatch(fetchProjects()); }, [dispatch]);

  const canCreate = CREATOR_ROLES.includes(user?.role);

  const filtered = projects.filter(p => {
    const matchSearch = !search      || p.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter|| p.status === statusFilter;
    const matchType   = !typeFilter  || p.billingType === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  // Collect unique statuses from loaded projects for dynamic filter
  const uniqueStatuses = [...new Set(projects.map(p => p.status).filter(Boolean))].sort();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">{projects.length} total projects</p>
        </div>
        {canCreate && (
          <button
            onClick={() => navigate('/pm/projects/create')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
            New Project
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-60"
          />
        </div>

        {/* Status filter — dynamic from loaded data */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All Statuses</option>
          {uniqueStatuses.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Billing type filter */}
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {BILLING_TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>
              {t ? (t === 'Billable' ? '💰 ' : '🔧 ') + t : 'All Billing Types'}
            </option>
          ))}
        </select>
      </div>

      {/* Project Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineFolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No projects found</p>
          {canCreate && (
            <button
              onClick={() => navigate('/pm/projects/create')}
              className="mt-3 text-sm text-emerald-600 hover:underline"
            >
              Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const ms      = p.milestones || [];
            // Count from flat milestones (both defaults and subs) — count only top-level for progress
            const topMs   = ms.filter(m => !m.parentMilestoneId);
            const pct     = topMs.length > 0
              ? Math.round((topMs.filter(m => m.status === 'completed').length / topMs.length) * 100)
              : 0;
            const today   = new Date().toISOString().slice(0, 10);
            const delayed = ms.filter(m => m.endDate && m.endDate < today && m.status !== 'completed').length;
            const pid     = p._id || p.id;

            return (
              <div
                key={pid}
                onClick={() => navigate(`/pm/projects/${pid}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-emerald-200 cursor-pointer transition-all"
              >
                {/* Top row */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-base leading-tight pr-2">{p.name}</h3>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {/* Status badge */}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                      {p.status || '—'}
                    </span>
                    {/* Billing type badge */}
                    {p.billingType && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                        p.billingType === 'Billable'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.billingType === 'Billable' ? '💰' : '🔧'} {p.billingType}
                      </span>
                    )}
                  </div>
                </div>

                {/* Project type chip */}
                {p.projectType && (
                  <span className="inline-block mb-2 px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600 border border-blue-100">
                    {p.projectType}
                  </span>
                )}

                {p.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span>PM: <strong className="text-gray-700">{p.projectManager?.name || '—'}</strong></span>
                  <span>Client: <strong className="text-gray-700">{p.clientName || '—'}</strong></span>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{topMs.length} milestones</span>
                    <span>{pct}% complete</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full">
                    <div
                      className="h-1.5 bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">
                    {p.endDate
                      ? `Due ${new Date(p.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                      : 'No deadline'}
                  </span>
                  {delayed > 0 && (
                    <span className="text-red-600 font-semibold">{delayed} delayed</span>
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
