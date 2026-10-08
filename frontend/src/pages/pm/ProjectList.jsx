import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProjects } from '../../store/pmSlice';
import {
  HiOutlinePlus, HiOutlineSearch, HiOutlineFolderOpen,
  HiOutlineViewGrid, HiOutlineViewList, HiOutlineEye, HiX, HiOutlineUpload, HiOutlinePencil,
} from 'react-icons/hi';
import api from '../../api/axios';
import { projectProgress } from '../../utils/pmProgress';
import BulkImportProjectsModal from '../../components/pm/BulkImportProjectsModal';
import SearchSelect from '../../components/common/SearchSelect';
import { listTeamsApi, getTeamMembersApi } from '../../api/helpdesk/teams.api';

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
// Same rule as ProjectDetail.jsx's canManage — manager-tier role, or the project's own manager.
const MANAGER_ROLES = ['admin', 'manager', 'senior_manager'];

export default function ProjectList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { projects, projectsLoading, projectsError } = useSelector(s => s.pm);
  const { user } = useSelector(s => s.auth);

  // ── Filter state (all local, not Redux) ──────────────────────────────────────
  const [search,            setSearch]            = useState('');
  // PM dashboard drill-down links pre-set these (?status=Active&billing=Billable&
  // client=X&projectType=Y). Read once here only as the very-first-render default —
  // the effect below keeps them in sync on every later navigation too, since React
  // Router reuses this same page component across same-route navigations and a
  // useState initializer only ever runs once.
  const [searchParams] = useSearchParams();
  const [statusFilter,      setStatusFilter]      = useState(searchParams.get('status')  || '');
  const [billingFilter,     setBillingFilter]     = useState(searchParams.get('billing') || '');
  const [projectTypeFilter, setProjectTypeFilter] = useState(searchParams.get('projectType') || '');
  const [clientFilter,      setClientFilter]      = useState(searchParams.get('client') || '');
  const [managerFilter,     setManagerFilter]     = useState('');
  const [myProjects,        setMyProjects]        = useState(false);
  const [showBulkImport,    setShowBulkImport]    = useState(false);

  // ── Team / Employee filters (mirrors PMDashboard.jsx's own Team/Employee
  // filters, so a dashboard drill-down link lands on a list that can actually
  // apply the same filter) ──────────────────────────────────────────────────
  const [teams,          setTeams]          = useState([]);
  const [teamFilter,     setTeamFilter]     = useState(searchParams.get('teamManagerId') || '');
  const [teamMemberIds,  setTeamMemberIds]  = useState(null); // Set of ids for the selected team
  const [teamRoster,     setTeamRoster]     = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState(searchParams.get('employeeId') || '');

  // When this URL sync is about to change teamFilter, it also sets the correct
  // employeeFilter in the SAME pass — the team-roster effect further down must
  // not then wipe that back out just because teamFilter happened to change too.
  const suppressEmployeeClear = useRef(false);

  // Re-applies every time the URL's query params actually change (a dashboard
  // card click while this page is already mounted doesn't remount it, so a
  // one-time useState initializer above would miss every click after the first).
  // A deep link "must show exactly what it names" — same rule TicketList.jsx
  // follows — so any filter not present in the URL is cleared, not left stacked.
  useEffect(() => {
    if (searchParams.toString() === '') return;
    setStatusFilter(searchParams.get('status') || '');
    setBillingFilter(searchParams.get('billing') || '');
    setProjectTypeFilter(searchParams.get('projectType') || '');
    setClientFilter(searchParams.get('client') || '');
    suppressEmployeeClear.current = true;
    setTeamFilter(searchParams.get('teamManagerId') || '');
    setEmployeeFilter(searchParams.get('employeeId') || '');
  }, [searchParams]);

  // ── View toggle ──────────────────────────────────────────────────────────────
  const [view,        setView]        = useState('card');
  const [raidSummary, setRaidSummary] = useState({});

  // /pm/projects/raid-summary is admin/manager/senior_manager-only server side.
  // Fetching it unconditionally 403'd for every other role — including a plain
  // employee just opening the project list — and the global axios interceptor
  // toasts every 403 app-wide regardless of this call's own .catch (React 18
  // StrictMode double-invokes effects in dev, hence two stacked toasts). The
  // badge it powers (⚠ N RAID on a card) is purely informational; skipping it
  // for non-managers loses nothing they could act on anyway.
  const canSeeRaidSummary = ['admin', 'manager', 'senior_manager'].includes(user?.role);
  useEffect(() => {
    dispatch(fetchProjects());
    if (canSeeRaidSummary) {
      api.get('/pm/projects/raid-summary')
        .then(res => setRaidSummary(res.data?.data ?? {}))
        .catch(() => {}); // non-fatal — badge just won't show
    }
    // Restore last view preference from localStorage
    try {
      const saved = localStorage.getItem('pm_projects_view');
      if (saved === 'list' || saved === 'card') setView(saved);
    } catch (_) {}
  }, [dispatch, canSeeRaidSummary]);

  const handleViewChange = (newView) => {
    setView(newView);
    try { localStorage.setItem('pm_projects_view', newView); } catch (_) {}
  };

  const canCreate = CREATOR_ROLES.includes(user?.role);
  const uid = String(user?._id || user?.id || '');

  // Same gate as canSeeRaidSummary above — avoids the "unconditional call to a
  // restricted route toasts Access Denied for every role" bug class this app
  // has hit before; the Team picker is only meaningful for manager-tier roles.
  useEffect(() => {
    if (!canSeeRaidSummary) return;
    listTeamsApi().then(res => setTeams(res.data?.data ?? [])).catch(() => setTeams([]));
  }, [canSeeRaidSummary]);

  // teamRoster holds the SELECTED team's actual members (employee master, via
  // getTeamMembersApi) — same source PMDashboard.jsx's Team/Employee filters use.
  useEffect(() => {
    let alive = true;
    // Only clear a previously-picked employee when the USER changes the team
    // filter directly — not when teamFilter changed as a side effect of the
    // URL-sync effect above, which already set the correct employeeFilter
    // itself in that same pass (see suppressEmployeeClear).
    if (suppressEmployeeClear.current) {
      suppressEmployeeClear.current = false;
    } else {
      setEmployeeFilter('');
    }
    if (!teamFilter) { setTeamMemberIds(null); setTeamRoster(null); return undefined; }
    getTeamMembersApi(teamFilter).then(res => {
      if (!alive) return;
      const d = res.data?.data ?? {};
      const members = d.members || [];
      setTeamMemberIds(new Set([teamFilter, ...members.map(m => String(m._id ?? m.id))]));
      setTeamRoster(members.map(m => ({ id: String(m._id ?? m.id), name: m.name })).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => { if (alive) { setTeamMemberIds(new Set([teamFilter])); setTeamRoster([]); } });
    return () => { alive = false; };
  }, [teamFilter]);

  /** Every person attached to a project: PM, owner, account manager, members. */
  const projectPeople = (p) => [p.managerId, p.ownerId, p.accountManagerId, ...(p.members || []).map(m => m.userId)]
    .filter(Boolean).map(String);

  // Team-narrowed project set, used for both the Employee dropdown's own
  // options (picking a team scopes who you can then pick) and the actual filter.
  const teamOnlyProjects = !teamFilter || !teamMemberIds
    ? projects
    : projects.filter(p => projectPeople(p).some(id => teamMemberIds.has(id)));

  const employeeOptions = teamRoster ?? (() => {
    const seen = new Map();
    teamOnlyProjects.forEach(p => {
      [p.projectManager, p.owner, p.accountManager].forEach(u => { if (u) seen.set(String(u._id ?? u.id), u.name); });
      (p.members || []).forEach(m => { if (m.user) seen.set(String(m.user._id ?? m.user.id), m.user.name); });
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  // ── Dynamic filter options derived from loaded data ──────────────────────────
  const uniqueStatuses     = [...new Set(projects.map(p => p.status).filter(Boolean))].sort();
  const uniqueProjectTypes = [...new Set(projects.map(p => p.projectType).filter(Boolean))].sort();
  const uniqueClients      = [...new Set(projects.map(p => p.clientOrg?.name || p.clientName).filter(Boolean))].sort();
  const uniqueManagers     = [...new Set(projects.map(p => p.projectManager?.name).filter(Boolean))].sort();

  const normStatus = (s) => String(s || '').trim().toLowerCase().replace(/[_-]+/g, ' ');

  // ── Composed filter (AND logic — all active filters must match) ──────────────
  const filtered = projects.filter(p => {
    const matchSearch  = !search            || p.name?.toLowerCase().includes(search.toLowerCase());
    // Legacy rows store 'active' / 'on_hold' / 'completed'; newer ones 'Active' / 'On Hold'.
    // Compare normalised so the list agrees with the PM dashboard's counts.
    const matchStatus  = !statusFilter      || normStatus(p.status) === normStatus(statusFilter);
    const matchBilling = !billingFilter     || p.billingType?.toLowerCase() === billingFilter.toLowerCase();
    const matchType    = !projectTypeFilter || p.projectType === projectTypeFilter;
    const matchClient  = !clientFilter      || (p.clientOrg?.name || p.clientName) === clientFilter;
    const matchManager = !managerFilter     || p.projectManager?.name === managerFilter;
    const matchTeam     = !teamFilter       || !teamMemberIds || projectPeople(p).some(id => teamMemberIds.has(id));
    const matchEmployee = !employeeFilter   || projectPeople(p).includes(String(employeeFilter));
    const matchMine    = !myProjects        || projectPeople(p).includes(uid);
    return matchSearch && matchStatus && matchBilling && matchType && matchClient && matchManager
      && matchTeam && matchEmployee && matchMine;
  });

  const activeFilterCount = [
    search, statusFilter, billingFilter, projectTypeFilter, clientFilter, managerFilter,
    teamFilter, employeeFilter, myProjects,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setBillingFilter('');
    setProjectTypeFilter('');
    setClientFilter('');
    setManagerFilter('');
    setTeamFilter('');
    setEmployeeFilter('');
    setMyProjects(false);
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // ── Empty state: differentiate "no projects at all" vs "filters too narrow" ──
  const emptyState = (
    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
      <HiOutlineFolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      {projects.length === 0 ? (
        <>
          <p className="text-gray-500 font-medium">No projects yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {canCreate
              ? 'Get started by creating your first project.'
              : "You'll see a project here once you're added as a team member on it."}
          </p>
          {canCreate && (
            <button
              onClick={() => navigate('/pm/projects/create')}
              className="mt-3 text-sm text-emerald-600 hover:underline"
            >
              Create your first project
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-gray-500 font-medium">No projects match your current filters</p>
          <p className="text-xs text-gray-400 mt-1">Try adjusting or clearing the active filters.</p>
          <button
            onClick={clearFilters}
            className="mt-3 text-sm text-emerald-600 hover:underline"
          >
            Clear all filters
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projectsLoading ? (
              <span className="inline-block w-24 h-3 bg-gray-200 rounded animate-pulse" />
            ) : (
              `${filtered.length} project${filtered.length !== 1 ? 's' : ''}${filtered.length !== projects.length ? ` of ${projects.length}` : ''}`
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Card / List view toggle */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={() => handleViewChange('card')}
              title="Card view"
              className={`px-3 py-1.5 text-sm transition-colors ${
                view === 'card' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <HiOutlineViewGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleViewChange('list')}
              title="List view"
              className={`px-3 py-1.5 text-sm transition-colors ${
                view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <HiOutlineViewList className="w-4 h-4" />
            </button>
          </div>

          {canCreate && (
            <button
              onClick={() => setShowBulkImport(true)}
              title="Bulk-import Operations projects from an Excel sheet"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <HiOutlineUpload className="w-4 h-4" />
              Import Projects
            </button>
          )}

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
      </div>

      <BulkImportProjectsModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={() => dispatch(fetchProjects())}
      />

      {/* ── Filter bar ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">

        {/* Search */}
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-52"
          />
        </div>

        {/* Project Type */}
        <select
          value={projectTypeFilter}
          onChange={e => setProjectTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">All Types</option>
          {uniqueProjectTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Client */}
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">All Clients</option>
          {uniqueClients.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Manager */}
        <select
          value={managerFilter}
          onChange={e => setManagerFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">All Managers</option>
          {uniqueManagers.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {/* Team — manager-tier only, same gate as canSeeRaidSummary */}
        {canSeeRaidSummary && teams.length > 0 && (
          <div className="w-40" title="Filter by Team">
            <SearchSelect
              options={teams.map(t => ({ value: t._id ?? t.id, label: t.name }))}
              value={teamFilter}
              placeholder="All Teams"
              onChange={v => setTeamFilter(v || '')}
              size="md"
              className="h-9"
            />
          </div>
        )}

        {/* Employee — scoped to the selected team's roster once one is picked */}
        {canSeeRaidSummary && (
          <div className="w-44" title={teamFilter ? "Employees in the selected team" : "All employees"}>
            <SearchSelect
              options={employeeOptions.map(o => ({ value: o.id, label: o.name }))}
              value={employeeFilter}
              placeholder={teamFilter ? 'All team members' : 'All Employees'}
              onChange={v => setEmployeeFilter(v || '')}
              size="md"
              className="h-9"
            />
          </div>
        )}

        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">All Statuses</option>
          {uniqueStatuses.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Billing type */}
        <select
          value={billingFilter}
          onChange={e => setBillingFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          {BILLING_TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>
              {t ? (t === 'Billable' ? '💰 ' : '🔧 ') + t : 'All Billing Types'}
            </option>
          ))}
        </select>

        {/* My Projects toggle */}
        <button
          onClick={() => setMyProjects(v => !v)}
          className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            myProjects
              ? 'bg-emerald-500 text-white border-emerald-500'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          My Projects
        </button>

        {/* Clear + active filter count badge */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <HiX className="w-3.5 h-3.5" />
            Clear
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold leading-none">
              {activeFilterCount}
            </span>
          </button>
        )}
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {projectsError && !projectsLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between">
          <span className="text-sm text-red-700">{projectsError}</span>
          <button
            onClick={() => dispatch(fetchProjects())}
            className="text-sm font-medium text-red-600 underline ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      {projectsLoading ? (
        /* Loading skeleton */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>

      ) : filtered.length === 0 ? (
        emptyState

      ) : view === 'list' ? (

        /* ── List / table view ─────────────────────────────────────────────── */
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {['Project Name', 'Type', 'Status', 'Manager', 'Client', 'Start', 'End', 'Members', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p, idx) => {
                const pid         = p._id || p.id;
                const memberCount = (p.members || []).length;
                return (
                  <tr
                    key={pid}
                    onClick={() => navigate(`/pm/projects/${pid}`)}
                    className={`cursor-pointer transition-colors hover:bg-emerald-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                  >
                    {/* Project Name */}
                    <td className="px-4 py-3 max-w-[220px]">
                      <span title={p.name} className="font-medium text-gray-900 text-sm truncate block">
                        {p.name}
                      </span>
                      {p.billingType && (
                        <span className={`text-xs font-medium ${p.billingType === 'Billable' ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {p.billingType === 'Billable' ? '💰' : '🔧'} {p.billingType}
                        </span>
                      )}
                    </td>

                    {/* Project Type */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.projectType ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600 border border-blue-100">
                          {p.projectType}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                        {p.status || '—'}
                      </span>
                    </td>

                    {/* Manager */}
                    <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                      {p.projectManager?.name || '—'}
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3 max-w-[160px]">
                      <span title={p.clientOrg?.name || p.clientName} className="text-sm text-gray-700 truncate block">
                        {p.clientOrg?.name || p.clientName || '—'}
                      </span>
                    </td>

                    {/* Start */}
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {fmtDate(p.startDate)}
                    </td>

                    {/* End */}
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {fmtDate(p.endDate)}
                    </td>

                    {/* Members */}
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {memberCount} member{memberCount !== 1 ? 's' : ''}
                    </td>

                    {/* Actions — stop row-click propagation here */}
                    <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/pm/projects/${pid}`)}
                        title="View project"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <HiOutlineEye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      ) : (

        /* ── Card view (existing layout, unchanged) ────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const ms      = p.milestones || [];
            const topMs   = ms.filter(m => !m.parentMilestoneId);   // "N milestones" label
            // Weighted by milestone weight; sub progress already rolled up server-side
            const pct     = projectProgress(ms);
            const today   = new Date().toISOString().slice(0, 10);
            const delayed = ms.filter(m => m.plannedEndDate && m.plannedEndDate < today && m.status !== 'completed').length;
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
                    {(MANAGER_ROLES.includes(user?.role) || String(p.managerId) === String(user?._id || user?.id)) && (
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/pm/projects/${pid}?edit=1`); }}
                        title="Edit project"
                        className="p-1 rounded text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                      >
                        <HiOutlinePencil className="w-3.5 h-3.5" />
                      </button>
                    )}
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
                  <span>Client: <strong className="text-gray-700">{p.clientOrg?.name || p.clientName || '—'}</strong></span>
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

                {/* RAID indicator badge */}
                {raidSummary[pid]?.total > 0 && (
                  <div className="mt-2 flex">
                    <div className="relative group">
                      <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full cursor-default">
                        ⚠ {raidSummary[pid].total} RAID
                      </span>
                      {/* Hover tooltip */}
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-10 bg-gray-900 text-white text-xs rounded-lg shadow-lg p-3 min-w-[180px] max-w-xs">
                        <p className="font-semibold mb-1.5 text-orange-300">Open RAID Items</p>
                        {raidSummary[pid].risk > 0      && <p>🔴 Risks: {raidSummary[pid].risk}</p>}
                        {raidSummary[pid].action > 0    && <p>🟡 Actions: {raidSummary[pid].action}</p>}
                        {raidSummary[pid].issue > 0     && <p>🟠 Issues: {raidSummary[pid].issue}</p>}
                        {raidSummary[pid].decision > 0  && <p>🔵 Decisions: {raidSummary[pid].decision}</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
