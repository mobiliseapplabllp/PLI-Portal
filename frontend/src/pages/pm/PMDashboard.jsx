import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import { fetchProjects } from '../../store/pmSlice';
import {
  HiOutlineFolderOpen, HiOutlineCheckCircle, HiOutlineClock,
  HiOutlineExclamation, HiOutlineFlag,
  HiOutlineChartBar, HiOutlineChevronRight, HiOutlineArrowRight, HiOutlineDownload,
} from 'react-icons/hi';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { listTeamsApi, getTeamMembersApi } from '../../api/helpdesk/teams.api';
import { exportPmDashboardApi } from '../../api/pm/pmDashboard.api';
import SearchSelect from '../../components/common/SearchSelect';

/** Highlight a filter control once it has a real value — the ERP-style "this is
 * actively filtering" cue this dashboard was missing (plain vs active border).
 * For a native <select> we own every class, so overriding border-color is safe. */
const filterBoxCls = (active) => `text-sm border rounded-lg px-3 py-2 bg-white text-gray-700 disabled:opacity-50 ${
  active ? 'border-emerald-400 ring-1 ring-emerald-100' : 'border-gray-200'}`;
/** Same cue for SearchSelect: it sets its OWN border-color internally, and Tailwind
 * does not guarantee a later class in the string wins a border-color conflict — a
 * `ring` (box-shadow) never collides with `border`, so it's the safe way to layer
 * an "active" cue onto a component we don't fully own the markup of. */
const searchSelectActiveCls = (active) => active ? 'ring-2 ring-emerald-400' : '';

function StatCard({ label, value, icon: Icon, color, onClick }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? `Show ${label.toLowerCase()} projects` : undefined}
      className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-emerald-300 hover:shadow-sm transition' : ''}`}
    >
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

/** Colour by urgency: ≤2 days red, ≤5 amber, else blue. */
const dueTone = (d) => d <= 2
  ? { icon: 'text-red-500',    badge: 'bg-red-100 text-red-700' }
  : d <= 5
    ? { icon: 'text-yellow-500', badge: 'bg-yellow-100 text-yellow-700' }
    : { icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700' };

function DueBadge({ days }) {
  if (days < 0) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-700">
        {-days}d overdue
      </span>
    );
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${dueTone(days).badge}`}>
      {days === 0 ? 'Today' : `${days}d`}
    </span>
  );
}

/** 'YYYY-MM-DD' → "19 Sep", read as a calendar day (no timezone shift). */
const fmtDue = (ymd) => {
  if (!ymd) return '';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export default function PMDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { projects: allProjects, projectsLoading } = useSelector(s => s.pm);
  const { user: authUser } = useSelector(s => s.auth);
  const uid = String(authUser?._id || authUser?.id || '');
  // Team dropdown pulls listTeamsApi — an org-wide directory, not scoped to the
  // caller. Only 'admin' actually sees every project regardless of team
  // (project.service.js isProjectVisible); 'manager'/'senior_manager' only ever
  // see projects they're personally attached to (managerId/ownerId/accountManager/
  // member) no matter which team is picked, so an org-wide Team dropdown is a
  // dead end for them — same fix as the Operations dashboard's scope:'group'
  // roles. They get their OWN team's roster as the Employee filter's default
  // instead (see the ownTeamRoster effect below), no Team dropdown at all.
  const ORG_WIDE_TEAM_ROLES = ['admin'];
  const OWN_TEAM_ONLY_ROLES = ['manager', 'senior_manager'];
  const canSeeOrgWideTeam = ORG_WIDE_TEAM_ROLES.includes(authUser?.role);
  const isOwnTeamOnly     = OWN_TEAM_ONLY_ROLES.includes(authUser?.role);

  useEffect(() => { dispatch(fetchProjects()); }, [dispatch]);

  // ── Team / Employee filters — narrow the WHOLE dashboard, never widen it:
  // `allProjects` is already scoped server-side to what this role may see
  // (project.service.js isProjectVisible), so this only narrows further —
  // same principle as the Operations dashboard's server-side filter.
  const [teams, setTeams]           = useState([]);
  const [teamFilter, setTeamFilter] = useState('');        // managerId or ''
  const [teamMemberIds, setTeamMemberIds] = useState(null); // Set of ids for the selected team
  const [employeeFilter, setEmployeeFilter] = useState('');

  useEffect(() => {
    if (!canSeeOrgWideTeam) return undefined;
    let alive = true;
    listTeamsApi().then(res => { if (alive) setTeams(res.data?.data ?? []); }).catch(() => setTeams([]));
    return () => { alive = false; };
  }, [canSeeOrgWideTeam]);

  // teamRoster holds the SELECTED team's actual members (employee master, via
  // getTeamMembersApi) — not who happens to be on a PM project. Without this, a
  // team whose people aren't attached to any project would show an empty Employee
  // dropdown despite genuinely having members: the dropdown listed "who's on a
  // project" instead of "who's on this team". null = no team picked.
  const [teamRoster, setTeamRoster] = useState(null);

  useEffect(() => {
    let alive = true;
    setEmployeeFilter('');   // switching team invalidates a person picked under the old one
    if (!teamFilter) { setTeamMemberIds(null); setTeamRoster(null); return undefined; }
    getTeamMembersApi(teamFilter).then(res => {
      if (!alive) return;
      const d = res.data?.data ?? {};
      const members = d.members || [];
      setTeamMemberIds(new Set([teamFilter, ...members.map(m => String(m._id ?? m.id))]));
      setTeamRoster(members
        .map(m => ({ id: String(m._id ?? m.id), name: m.name }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => { if (alive) { setTeamMemberIds(new Set([teamFilter])); setTeamRoster([]); } });
    return () => { alive = false; };
  }, [teamFilter]);

  // 'manager'/'senior_manager' get no Team dropdown (see canSeeOrgWideTeam above),
  // so default their Employee filter to their OWN team's roster instead of the
  // "who's on a visible project" fallback — same idea as teamRoster above, just
  // keyed by their own id instead of a picked team.
  useEffect(() => {
    if (!isOwnTeamOnly || !uid) return undefined;
    let alive = true;
    getTeamMembersApi(uid).then(res => {
      if (!alive) return;
      const d = res.data?.data ?? {};
      setTeamRoster((d.members || [])
        .map(m => ({ id: String(m._id ?? m.id), name: m.name }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => { if (alive) setTeamRoster([]); });
    return () => { alive = false; };
  }, [isOwnTeamOnly, uid]);

  /** Every person attached to a project: PM, owner, account manager, members. */
  const projectPeople = (p) => [p.managerId, p.ownerId, p.accountManagerId, ...(p.members || []).map(m => m.userId)]
    .filter(Boolean).map(String);

  // Team-narrowed first (used for the Employee dropdown's own options too, so
  // picking a team scopes who you can then pick as the employee).
  const teamOnlyProjects = !teamFilter || !teamMemberIds
    ? allProjects
    : allProjects.filter(p => projectPeople(p).some(id => teamMemberIds.has(id)));

  // A team is picked → show its real roster (always populated, matches Operations
  // dashboard). No team picked → fall back to "who's attached to a visible project",
  // the same safe, already-scoped default as before.
  const employeeOptions = teamRoster ?? (() => {
    const seen = new Map();
    teamOnlyProjects.forEach(p => {
      [p.projectManager, p.owner, p.accountManager].forEach(u => { if (u) seen.set(String(u._id ?? u.id), u.name); });
      (p.members || []).forEach(m => { if (m.user) seen.set(String(m.user._id ?? m.user.id), m.user.name); });
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();

  // Client / Project Type / My Projects — independent axes, not chained through
  // each other (unlike Employee, which narrows WITH Team because both are "people").
  // Options are drawn from the full visible set so picking one filter never shrinks
  // what another filter offers to choose from.
  const [clientFilter,      setClientFilter]      = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('');
  const [billingTypeFilter, setBillingTypeFilter] = useState(''); // '', 'Billable', 'Non-Billable'
  const [projectFilter,     setProjectFilter]     = useState('');   // one specific project's id or ''
  const [myProjectsOnly,    setMyProjectsOnly]    = useState(false);
  const clientOf = (p) => p.clientOrg?.name || p.clientName || '';
  const clientOptions      = [...new Set(allProjects.map(clientOf).filter(Boolean))].sort()
    .map(name => ({ id: name, name }));
  const projectTypeOptions = [...new Set(allProjects.map(p => p.projectType).filter(Boolean))].sort();
  // Options drawn from the FULL visible set, same rule as Client/Project Type —
  // picking a project must never shrink the list down to just itself.
  const projectOptions = [...allProjects].sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ id: String(p._id ?? p.id), name: p.name }));

  const projects = teamOnlyProjects
    .filter(p => !employeeFilter     || projectPeople(p).includes(String(employeeFilter)))
    .filter(p => !clientFilter       || clientOf(p) === clientFilter)
    .filter(p => !projectTypeFilter  || p.projectType === projectTypeFilter)
    .filter(p => !projectFilter      || String(p._id ?? p.id) === projectFilter)
    .filter(p => !billingTypeFilter  || p.billingType === billingTypeFilter)
    .filter(p => !myProjectsOnly     || projectPeople(p).includes(uid));

  // Status filters — support both new names and legacy
  const active    = projects.filter(p => p.status === 'Active'    || p.status === 'active');
  const completed = projects.filter(p => p.status === 'Completed' || p.status === 'completed');
  const onHold    = projects.filter(p => p.status === 'On Hold'   || p.status === 'on_hold');

  // ── Deadline Breached | Upcoming Deadlines — by PLANNED or ACTUAL end date,
  // at the Both / Parent / Sub-milestone level. Dates are compared as local
  // calendar days (never toISOString, which is UTC).
  const [mainTab,       setMainTab]       = useState('upcoming');  // 'breached' | 'upcoming'
  const [deadlineBasis, setDeadlineBasis] = useState('planned');   // 'planned' | 'actual'
  const [level,         setLevel]         = useState('both');      // 'both' | 'parent' | 'sub'
  // "Assigned To" — the milestone/sub-milestone's own Accountable Person, a
  // different question from the dashboard-wide Employee filter above (which asks
  // "is this person anywhere on the project"). Scoped to THIS card only.
  const [assignedTo, setAssignedTo] = useState('');   // accountableUser id or ''
  const acctId = (m) => String(m.accountableUser?._id ?? m.accountableUser?.id ?? '');
  const assignedToOptions = (() => {
    const seen = new Map();
    projects.forEach(p => (p.milestones || []).forEach(m => {
      if (m.accountableUser) seen.set(acctId(m), m.accountableUser.name);
    }));
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const [openPhases, setOpenPhases]       = useState(() => new Set()); // expanded phase rows
  const togglePhase = (key) => setOpenPhases(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const dayNumber = (ymd) => {
    const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };
  const now = new Date();
  const todayNum = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;

  /**
   * One row per PHASE. mode 'upcoming' = due within the next 14 days (unfinished);
   * mode 'breached' = already past its date and not completed (daysLeft negative —
   * worst-overdue sorts first via the same ascending sort).
   * level 'parent' → ignore sub-milestones entirely (subs: []); level 'sub' → the
   * phase's OWN date is ignored (own: null) — it only appears via its sub-milestones,
   * and the phase's own due/overdue label is hidden in the UI for that level; level
   * 'both' (default) → a phase appears when its own date matches OR any sub's does
   * ("sub-milestone due/overdue soon" — nothing is hidden).
   */
  const buildRows = (basis, mode, lvl) => {
    const field = basis === 'actual' ? 'actualEndDate' : 'plannedEndDate';
    const relevant = (m) => {
      if (!m[field]) return null;
      const isCompleted = String(m.status).toLowerCase() === 'completed';
      const d = dayNumber(m[field]) - todayNum;
      if (mode === 'breached') return (!isCompleted && d < 0) ? d : null;
      // upcoming — unchanged from before: planned excludes completed, actual does not
      if (basis === 'planned' && isCompleted) return null;
      return (d >= 0 && d <= 14) ? d : null;
    };
    const assignedToOk = (m) => !assignedTo || acctId(m) === String(assignedTo);
    const rows = [];
    projects.forEach(p => {
      const ms = p.milestones || [];
      ms.filter(m => !m.parentMilestoneId).forEach(phase => {
        const pid = String(phase._id || phase.id);
        const subs = lvl === 'parent' ? [] : ms
          .filter(s => String(s.parentMilestoneId) === pid && assignedToOk(s))
          .map(s => ({ ...s, dueDate: s[field], daysLeft: relevant(s) }))
          .filter(s => s.daysLeft != null)
          .sort((a, b) => a.daysLeft - b.daysLeft);
        // A phase whose OWN accountable person doesn't match still shows via a
        // matching sub-milestone — same "Phase not due" fallback already used
        // when only a sub-milestone (not the phase itself) is what's due.
        const own = (lvl === 'sub' || !assignedToOk(phase)) ? null : relevant(phase);
        if (own == null && subs.length === 0) return;
        rows.push({
          ...phase,
          key: `${p._id || p.id}:${pid}`,
          dueDate: own != null ? phase[field] : null,
          daysLeft: own,                                        // null → only subs matched
          soonest: Math.min(own ?? Infinity, ...subs.map(s => s.daysLeft)),
          subs,
          projectName: p.name,
          projectId: p._id || p.id,
        });
      });
    });
    return rows.sort((a, b) => a.soonest - b.soonest);
  };
  const breachedRows = buildRows(deadlineBasis, 'breached', level);
  const upcomingRows = buildRows(deadlineBasis, 'upcoming', level);
  const rows = mainTab === 'breached' ? breachedRows : upcomingRows;

  // billingType is the correct field (projectType is now the category like Signed/Demo Prototype)
  const billable    = projects.filter(p => p.billingType === 'Billable');
  const nonBillable = projects.filter(p => p.billingType === 'Non-Billable');

  const pieData = [
    { name: 'Billable',     value: billable.length,    color: '#10b981' },
    { name: 'Non-Billable', value: nonBillable.length, color: '#6b7280' },
  ].filter(d => d.value > 0);

  // Dashboard filters entirely client-side (see the Team-roster comment above),
  // so the export sends its own already-filtered summary rather than re-deriving
  // the same filter chain on the backend — the file always matches the screen.
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const filters = [
        teamFilter       && `Team: ${teams.find(t => (t._id ?? t.id) === teamFilter)?.name || teamFilter}`,
        employeeFilter    && `Employee: ${employeeOptions.find(o => o.id === employeeFilter)?.name || employeeFilter}`,
        clientFilter      && `Client: ${clientFilter}`,
        projectFilter     && `Project: ${projectOptions.find(o => o.id === projectFilter)?.name || projectFilter}`,
        projectTypeFilter && `Project Type: ${projectTypeFilter}`,
        billingTypeFilter && `Billing Type: ${billingTypeFilter}`,
        myProjectsOnly    && 'My Projects only',
        assignedTo        && `Deadlines assigned to: ${assignedToOptions.find(o => o.id === assignedTo)?.name || assignedTo}`,
      ].filter(Boolean);

      const deadlineRows = [
        ...breachedRows.map(r => ({ ...r, kind: 'breached' })),
        ...upcomingRows.map(r => ({ ...r, kind: 'upcoming' })),
      ].map(r => ({ kind: r.kind, title: r.name, projectName: r.projectName, dueDate: r.dueDate, daysLeft: r.daysLeft }));

      await exportPmDashboardApi({
        filters,
        stats: {
          total: projects.length, active: active.length, completed: completed.length,
          onHold: onHold.length, billable: billable.length, nonBillable: nonBillable.length,
        },
        deadlines: deadlineRows,
      });
    } catch {
      toast.error('Failed to export dashboard');
    } finally {
      setExporting(false);
    }
  };

  // Every drill-through link carries the dashboard's active filters forward, so
  // the list it opens always matches the count that was clicked — Project List
  // now has matching Team/Employee/Client/Project Type filters of its own.
  const projectListUrl = (extra = {}) => {
    const params = new URLSearchParams({
      ...(teamFilter         ? { teamManagerId: teamFilter } : {}),
      ...(employeeFilter     ? { employeeId: employeeFilter } : {}),
      ...(clientFilter      ? { client: clientFilter } : {}),
      ...(projectTypeFilter ? { projectType: projectTypeFilter } : {}),
      ...(billingTypeFilter ? { billing: billingTypeFilter } : {}),
      ...extra,
    });
    const qs = params.toString();
    return qs ? `/pm/projects?${qs}` : '/pm/projects';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Management</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of all projects, milestones, and deadlines</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          title="Download this dashboard (with the filters currently applied) as an Excel file"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <HiOutlineDownload className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
          {exporting ? 'Exporting…' : 'Download Excel'}
        </button>
      </div>

      {/* Dashboard filters — narrow everything below: stat cards, billing, and the
          deadlines card. Narrows only; the underlying project list is already
          scoped server-side to what this role may see. Full page width (not
          squeezed beside the title) so the grid below wraps evenly instead of
          leaving ragged, unevenly-filled rows. */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Dashboard filters</span>
          {(teamFilter || employeeFilter || clientFilter || projectFilter || projectTypeFilter || billingTypeFilter || myProjectsOnly || assignedTo) && (
            <button
              type="button"
              onClick={() => {
                setTeamFilter(''); setEmployeeFilter(''); setClientFilter(''); setProjectFilter('');
                setProjectTypeFilter(''); setBillingTypeFilter(''); setMyProjectsOnly(false); setAssignedTo('');
              }}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2">
          {canSeeOrgWideTeam && (
            <SearchSelect
              options={teams.map(t => ({ value: t._id ?? t.id, label: `${t.name} (${t.memberCount ?? 0})` }))}
              value={teamFilter}
              onChange={v => setTeamFilter(v || '')}
              placeholder="All teams"
              disabled={teams.length === 0}
              size="md"
              className={searchSelectActiveCls(!!teamFilter)}
            />
          )}

          <SearchSelect
            options={employeeOptions.map(o => ({ value: o.id, label: o.name }))}
            value={employeeFilter}
            onChange={v => setEmployeeFilter(v || '')}
            placeholder={teamFilter ? 'All employees in this team' : (isOwnTeamOnly ? 'Anyone on my team' : 'All employees')}
            disabled={employeeOptions.length === 0}
            size="md"
            className={searchSelectActiveCls(!!employeeFilter)}
          />

          <SearchSelect
            options={clientOptions.map(o => ({ value: o.id, label: o.name }))}
            value={clientFilter}
            onChange={v => setClientFilter(v || '')}
            placeholder="All clients"
            disabled={clientOptions.length === 0}
            size="md"
            className={searchSelectActiveCls(!!clientFilter)}
          />

          <SearchSelect
            options={projectOptions.map(o => ({ value: o.id, label: o.name }))}
            value={projectFilter}
            onChange={v => setProjectFilter(v || '')}
            placeholder="All projects"
            disabled={projectOptions.length === 0}
            size="md"
            className={searchSelectActiveCls(!!projectFilter)}
          />

          <select
            value={projectTypeFilter}
            onChange={e => setProjectTypeFilter(e.target.value)}
            className={filterBoxCls(!!projectTypeFilter)}
            disabled={projectTypeOptions.length === 0}
            title="Show only this project type"
          >
            <option value="">All project types</option>
            {projectTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <select
            value={billingTypeFilter}
            onChange={e => setBillingTypeFilter(e.target.value)}
            className={filterBoxCls(!!billingTypeFilter)}
            title="Show only billable / non-billable projects"
          >
            <option value="">All billing types</option>
            <option value="Billable">Billable</option>
            <option value="Non-Billable">Non-Billable</option>
          </select>

          <label className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border cursor-pointer select-none ${
            myProjectsOnly ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-white text-gray-700'}`}>
            <input type="checkbox" checked={myProjectsOnly} onChange={e => setMyProjectsOnly(e.target.checked)} className="accent-emerald-600" />
            My Projects
          </label>
        </div>

        {/* Card filter — the milestone's own Accountable Person. A different
            question from Employee above (who's on the project vs who's actually
            responsible for a deadline). Affects ONLY the Deadlines card below —
            stat cards and billing count PROJECTS, which have no single
            "accountable person" to filter by. */}
        <div className="pt-3 border-t border-gray-100">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Deadlines card only</span>
          <div className="mt-1 max-w-xs">
            <SearchSelect
              options={assignedToOptions.map(o => ({ value: o.id, label: o.name }))}
              value={assignedTo}
              onChange={v => setAssignedTo(v || '')}
              placeholder="Assigned to: Anyone"
              disabled={assignedToOptions.length === 0}
              size="md"
              className={searchSelectActiveCls(!!assignedTo)}
            />
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Projects"  value={projects.length}    icon={HiOutlineFolderOpen}  color="bg-blue-100 text-blue-600"       onClick={() => navigate(projectListUrl())} />
        <StatCard label="Active"          value={active.length}      icon={HiOutlineClock}        color="bg-emerald-100 text-emerald-600" onClick={() => navigate(projectListUrl({ status: 'Active' }))} />
        <StatCard label="Completed"       value={completed.length}   icon={HiOutlineCheckCircle}  color="bg-indigo-100 text-indigo-600"   onClick={() => navigate(projectListUrl({ status: 'Completed' }))} />
        <StatCard label="On Hold"         value={onHold.length}      icon={HiOutlineExclamation}  color="bg-yellow-100 text-yellow-600"   onClick={() => navigate(projectListUrl({ status: 'On Hold' }))} />
        <StatCard label="Billable"        value={billable.length}    icon={HiOutlineFlag}         color="bg-green-100 text-green-600"     onClick={() => navigate(projectListUrl({ billing: 'Billable' }))} />
        <StatCard label="Non-Billable"    value={nonBillable.length} icon={HiOutlineChartBar}     color="bg-gray-100 text-gray-600"       onClick={() => navigate(projectListUrl({ billing: 'Non-Billable' }))} />
      </div>

      {/* Billable vs Non-Billable breakdown */}
      {projects.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pie Chart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Billing Type Distribution</h2>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value"
                    cursor="pointer" onClick={(slice) => navigate(projectListUrl({ billing: slice.name }))}>
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [`${value} projects`, name]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No data</div>
            )}
          </div>

          {/* Billable Projects List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-emerald-50">
              <h2 className="font-semibold text-emerald-700 text-sm">💰 Billable Projects ({billable.length})</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-48 overflow-auto">
              {billable.length === 0
                ? <div className="p-4 text-center text-gray-400 text-xs">None</div>
                : billable.map(p => (
                    <div key={p._id || p.id} onClick={() => navigate(`/pm/projects/${p._id || p.id}`)}
                      className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer text-xs">
                      <span className="font-medium text-gray-800 truncate block">{p.name}</span>
                    </div>
                  ))}
            </div>
          </div>

          {/* Non-Billable Projects List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-semibold text-gray-600 text-sm">🔧 Non-Billable Projects ({nonBillable.length})</h2>
            </div>
            <div className="divide-y divide-gray-50 max-h-48 overflow-auto">
              {nonBillable.length === 0
                ? <div className="p-4 text-center text-gray-400 text-xs">None</div>
                : nonBillable.map(p => (
                    <div key={p._id || p.id} onClick={() => navigate(`/pm/projects/${p._id || p.id}`)}
                      className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer text-xs">
                      <span className="font-medium text-gray-800 truncate block">{p.name}</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}

      {/* Deadline Breached | Upcoming Deadlines — full width */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">
            {mainTab === 'breached'
              ? 'Deadline Breached'
              : <>Upcoming Deadlines <span className="text-xs font-normal text-gray-400">(next 14 days)</span></>}
          </h2>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="Deadline status">
            {[
              { key: 'breached', label: 'Deadline Breached',  count: breachedRows.length },
              { key: 'upcoming', label: 'Upcoming Deadlines', count: upcomingRows.length },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={mainTab === t.key}
                onClick={() => setMainTab(t.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mainTab === t.key
                    ? 'bg-white text-emerald-700 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-800'}`}
              >
                {t.label}
                <span className={`ml-1 ${t.key === 'breached' && t.count > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Secondary switches — which date, and which level, apply to whichever main tab is open */}
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-4">
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="Deadline date">
            {[
              { key: 'planned', label: 'Planned date' },
              { key: 'actual',  label: 'Actual date' },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={deadlineBasis === t.key}
                onClick={() => setDeadlineBasis(t.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  deadlineBasis === t.key
                    ? 'bg-white text-emerald-700 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-800'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="Deadline level">
            {[
              { key: 'both',   label: 'Both' },
              { key: 'parent', label: 'Parent' },
              { key: 'sub',    label: 'Sub-milestone' },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={level === t.key}
                onClick={() => setLevel(t.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  level === t.key
                    ? 'bg-white text-emerald-700 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-800'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {projectsLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {mainTab === 'breached'
              ? (deadlineBasis === 'actual' ? 'No milestones overdue on actual end date' : 'No overdue milestones')
              : (deadlineBasis === 'actual' ? 'No milestones with an actual end date in the next 14 days' : 'No milestones due in the next 14 days')}
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[28rem] overflow-auto">
              {rows.map(m => {
                const open = openPhases.has(m.key);
                const hasSubs = m.subs.length > 0;
                const openProject = () => navigate(`/pm/projects/${m.projectId}`);
                return (
                  <div key={m.key} className={open ? 'bg-slate-50/70' : ''}>
                    {/* Phase row — with due sub-milestones the whole row expands/collapses;
                        without, it opens the project (as before). */}
                    <div
                      onClick={hasSubs ? () => togglePhase(m.key) : openProject}
                      role="button"
                      aria-expanded={hasSubs ? open : undefined}
                      className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-3"
                    >
                      <span className="w-5 flex-shrink-0 flex items-center justify-center">
                        {hasSubs && (
                          <HiOutlineChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
                        )}
                      </span>
                      <HiOutlineFlag className={`w-4 h-4 flex-shrink-0 ${dueTone(m.soonest).icon}`} />
                      {/* Project is the primary line, the phase name is secondary — this card
                          is read project-first, milestone-second */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{m.projectName}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {m.name}
                          {hasSubs && (
                            <span className="ml-2 text-indigo-600 font-medium">
                              · {m.subs.length} sub-milestone{m.subs.length === 1 ? '' : 's'} {mainTab === 'breached' ? 'overdue' : 'due'} {open ? '(hide)' : '(show)'}
                            </span>
                          )}
                        </p>
                      </div>
                      {/* The phase's OWN deadline — hidden at the Sub-milestone level, since
                          that level judges only the sub-milestones, not the phase itself */}
                      {level === 'sub' ? (
                        hasSubs && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                            mainTab === 'breached' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {m.subs.length} {mainTab === 'breached' ? 'overdue' : 'due'}
                          </span>
                        )
                      ) : m.daysLeft != null ? (
                        <>
                          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
                            {mainTab === 'breached' ? `Phase overdue since ${fmtDue(m.dueDate)}` : `Phase due ${fmtDue(m.dueDate)}`}
                          </span>
                          <DueBadge days={m.daysLeft} />
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {mainTab === 'breached' ? 'Phase not overdue' : 'Phase not due'}
                        </span>
                      )}
                      {hasSubs && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); openProject(); }}
                          className="text-xs text-emerald-700 hover:underline flex items-center gap-0.5 flex-shrink-0"
                          title="Open project"
                        >
                          Open <HiOutlineArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Expanded: the phase's sub-milestones due in the window, nested under it */}
                    {open && (
                      <div className="pb-3 pl-[4.25rem] pr-5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                          {mainTab === 'breached' ? 'Sub-milestones overdue' : 'Sub-milestones due'}
                        </p>
                        <div className="border-l-2 border-gray-200 pl-3 space-y-1">
                          {m.subs.map(s => (
                            <div
                              key={s._id || s.id}
                              onClick={openProject}
                              className="flex items-center gap-3 py-1.5 px-2 -ml-2 rounded hover:bg-white cursor-pointer"
                            >
                              <p className="flex-1 min-w-0 text-sm text-gray-700 truncate">{s.name}</p>
                              <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
                                {mainTab === 'breached' ? `Overdue since ${fmtDue(s.dueDate)}` : `Due ${fmtDue(s.dueDate)}`}
                              </span>
                              <DueBadge days={s.daysLeft} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
