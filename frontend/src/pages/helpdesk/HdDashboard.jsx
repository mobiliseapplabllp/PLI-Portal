/**
 * HdDashboard.jsx — Operations dashboard.
 * Same shape as the PM dashboard: stat cards → open-ticket breakdown
 * (priority / team / project) → full-width "Breached | Upcoming Deadlines" card.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  HiOutlineTicket,
  HiOutlineFolderOpen,
  HiOutlineClock,
  HiOutlineExclamation,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineDownload,
} from 'react-icons/hi';
import {
  getDashboardStatsApi,
  getByTeamApi,
  getProjectStatsApi,
  getOpenByPriorityApi,
  getDeadlinesApi,
  getBillingTicketsApi,
  exportDashboardApi,
} from '../../api/helpdesk/hdDashboard.api';
import { listTeamsApi, getTeamMembersApi } from '../../api/helpdesk/teams.api';
import { getHdOptionsApi } from '../../api/helpdesk/helpdesk.api';
import SearchSelect from '../../components/common/SearchSelect';

/** Same "this is actively filtering" cue as the PM dashboard. Ring, not border —
 * SearchSelect sets its own border-color internally and Tailwind does not
 * guarantee a later class wins a same-property conflict. */
const searchSelectActiveCls = (active) => active ? 'ring-2 ring-indigo-400' : '';
const filterBoxCls = (active) => `text-sm border rounded-lg px-3 py-2 bg-white text-gray-700 disabled:opacity-50 ${
  active ? 'border-indigo-400 ring-1 ring-indigo-100' : 'border-gray-200'}`;

/** Team/Employee options come from an org-wide directory endpoint (every team,
 * every member — not scoped to the caller). Mirrors the backend's own role→scope
 * mapping (helpdeskAuth.js resolveRoleMapping) so the FILTER OPTIONS a role sees
 * match what its ticket visibility can actually use them for:
 *   scope 'all'   (admin, senior_manager) → sees every team's tickets → full
 *                 org-wide Team/Employee directory is genuinely useful.
 *   scope 'group' (manager, hr_admin)     → sees only their OWN team's tickets
 *                 → an org-wide Team dropdown is a dead end (picking any other
 *                 team returns an empty dashboard); show just their own team's
 *                 roster as the Employee filter, no Team dropdown at all.
 *   scope 'own'   (employee)              → sees only their own tickets → no
 *                 people-directory filter has anything to narrow; hidden.
 */
const ORG_WIDE_TEAM_ROLES = ['admin', 'senior_manager'];
const OWN_TEAM_ONLY_ROLES = ['manager', 'hr_admin'];

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-blue-100 text-blue-700',
  low:      'bg-emerald-100 text-emerald-700',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const extractData = (res) => res?.data?.data ?? res?.data ?? res ?? null;

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, loading, onClick }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 animate-pulse">
        <div className={`p-3 rounded-xl ${color} opacity-40`}><Icon className="w-6 h-6" /></div>
        <div className="space-y-2">
          <div className="h-6 bg-gray-200 rounded w-12" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>
    );
  }
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? `Show ${label.toLowerCase()}` : undefined}
      className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-indigo-300 hover:shadow-sm transition' : ''}`}
    >
      <div className={`p-3 rounded-xl ${color}`}><Icon className="w-6 h-6" /></div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ─── Tab 1: Dashboard ─────────────────────────────────────────────────────────
// Same shape as the PM dashboard: stat cards → breakdown row → one full-width
// "Breached | Upcoming Deadlines" card.

const PRIORITY_PIE_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#3b82f6', low: '#10b981' };

function BreakdownList({ title, tone, rows, empty, onRowClick }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-100 ${tone}`}>
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="divide-y divide-gray-50 max-h-48 overflow-auto">
        {rows.length === 0
          ? <div className="p-4 text-center text-gray-400 text-xs">{empty}</div>
          : rows.map((r, i) => (
              <div
                key={r.key ?? i}
                onClick={r.clickable ? () => onRowClick(r) : undefined}
                className={`px-4 py-2.5 flex justify-between items-center text-xs ${r.clickable ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
              >
                <span className={`font-medium truncate ${r.clickable ? 'text-gray-800' : 'text-gray-500'}`}>{r.label}</span>
                <span className="ml-2 shrink-0 font-semibold text-amber-600" title="Open tickets">{r.count}</span>
              </div>
            ))}
      </div>
    </div>
  );
}

/** A list of open tickets (REQ # + title + project) — the Billable / Non-Billable cards. */
function TicketListCard({ title, tone, tickets, onOpen }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-3 border-b border-gray-100 ${tone}`}>
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="divide-y divide-gray-50 max-h-48 overflow-auto">
        {tickets.length === 0
          ? <div className="p-4 text-center text-gray-400 text-xs">None</div>
          : tickets.map(t => {
              const tid = t._id ?? t.id;
              return (
                <div key={tid} onClick={() => onOpen(tid)} className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer text-xs">
                  <p className="font-medium text-gray-800 truncate">
                    <span className="font-mono text-gray-400 mr-1.5">{t.reqNumber ?? `#${tid}`}</span>
                    {t.title}
                  </p>
                  <p className="text-gray-400 truncate">{t.projectName || '—'}</p>
                </div>
              );
            })}
      </div>
    </div>
  );
}

function DeadlineBadge({ row, basis }) {
  if (basis === 'breached') {
    const overdue = row.daysLeft != null && row.daysLeft < 0 ? -row.daysLeft : null;
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-700">
        {overdue ? `${overdue}d overdue` : 'SLA breached'}
      </span>
    );
  }
  const d = row.daysLeft;
  const cls = d <= 2 ? 'bg-red-100 text-red-700' : d <= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cls}`}>
      {d === 0 ? 'Today' : `${d}d`}
    </span>
  );
}

/** 'YYYY-MM-DD' (already in business timezone) → "19 Sep" without a timezone shift. */
const fmtDay = (ymd) => {
  if (!ymd) return '—';
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

function DashboardTab() {
  const navigate = useNavigate();
  const { user: authUser } = useSelector(s => s.auth);
  const authUserId        = String(authUser?._id || authUser?.id || '');
  const canSeeOrgWideTeam = ORG_WIDE_TEAM_ROLES.includes(authUser?.role);
  const isOwnTeamOnly     = OWN_TEAM_ONLY_ROLES.includes(authUser?.role);
  const canSeeTeamFilters = canSeeOrgWideTeam || isOwnTeamOnly;

  const [loading, setLoading]       = useState(true);
  const [stats, setStats]           = useState(null);
  const [byPriority, setByPriority] = useState([]);
  const [byTeam, setByTeam]         = useState([]);
  const [byProject, setByProject]   = useState([]);
  const [deadlines, setDeadlines]   = useState({ breached: [], upcoming: [] });
  const [billing, setBilling]       = useState({ billable: [], nonBillable: [] });
  const [basis, setBasis]           = useState('breached');   // 'breached' | 'upcoming'

  // ── Team / Employee filters — narrow the whole dashboard, never widen it: the
  // server ANDs these onto the caller's own visibility, so a manager already
  // scoped to their own team can't reach into another's data via this dropdown. ──
  const [teams, setTeams]                 = useState([]);
  const [teamFilter, setTeamFilter]       = useState('');   // teamManagerId or ''
  const [employeeOptions, setEmployeeOptions] = useState([]); // people to pick from
  const [employeeFilter, setEmployeeFilter]   = useState('');   // userId or ''

  // Team list, loaded once — the same "manager + active direct reports" list used
  // everywhere else (Create Ticket, KPI, Approval Workbench). Only fetched for
  // scope:'all' roles — the endpoint is org-wide, not scoped to the caller, and a
  // scope:'group' role (manager/hr_admin) can only ever see their OWN team's
  // tickets anyway, so this dropdown would be nothing but dead-end options.
  useEffect(() => {
    if (!canSeeOrgWideTeam) return undefined;
    let alive = true;
    listTeamsApi().then(res => {
      if (!alive) return;
      const d = extractData(res);
      setTeams(Array.isArray(d) ? d : []);
    }).catch(() => setTeams([]));
    return () => { alive = false; };
  }, [canSeeOrgWideTeam]);

  // Employee dropdown scoped to the selected team (manager + their reports);
  // with no team picked, offer every team's people so the dropdown never sits empty.
  // scope:'all' only — scope:'group' gets its own roster-only effect below.
  useEffect(() => {
    if (!canSeeOrgWideTeam) return undefined;
    let alive = true;
    setEmployeeFilter('');   // changing the team invalidates a person picked under the old one
    (async () => {
      if (teamFilter) {
        try {
          const res = await getTeamMembersApi(teamFilter);
          const d = extractData(res) || {};
          if (alive) setEmployeeOptions(d.members || []);
        } catch { if (alive) setEmployeeOptions([]); }
        return;
      }
      if (!teams.length) { setEmployeeOptions([]); return; }
      const seen = new Map();
      const lists = await Promise.allSettled(teams.map(t => getTeamMembersApi(t._id ?? t.id)));
      lists.forEach(r => {
        if (r.status !== 'fulfilled') return;
        (extractData(r.value)?.members || []).forEach(m => seen.set(m._id ?? m.id, m));
      });
      if (alive) setEmployeeOptions([...seen.values()].sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => { alive = false; };
  }, [teamFilter, teams, canSeeOrgWideTeam]);

  // scope:'group' (manager, hr_admin): no Team dropdown — there's only ever one
  // valid choice (their own team), so the Employee filter goes straight to their
  // own roster via the SAME "manager + reports" lookup, keyed by their own id.
  useEffect(() => {
    if (!isOwnTeamOnly || !authUserId) return undefined;
    let alive = true;
    getTeamMembersApi(authUserId).then(res => {
      if (!alive) return;
      const d = extractData(res) || {};
      setEmployeeOptions(d.members || []);
    }).catch(() => { if (alive) setEmployeeOptions([]); });
    return () => { alive = false; };
  }, [isOwnTeamOnly, authUserId]);

  // ── Project / Category / Billing Type filters — same "narrow only" rule as Team/Employee. ──
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [categoryFilter, setCategoryFilter]   = useState('');
  const [projectOptions, setProjectOptions]   = useState([]);
  const [projectFilter, setProjectFilter]     = useState('');
  const [billingTypeFilter, setBillingTypeFilter] = useState(''); // '', 'Billable', 'Non-Billable'

  // Category list is a fixed admin-managed catalog — doesn't need to shrink/grow
  // with other filters, loaded once (same convention as Create Ticket's dropdowns).
  useEffect(() => {
    let alive = true;
    getHdOptionsApi('category').then(res => {
      if (!alive) return;
      const d = extractData(res);
      setCategoryOptions((Array.isArray(d) ? d : []).map(o => o.name).filter(Boolean));
    }).catch(() => setCategoryOptions([]));
    return () => { alive = false; };
  }, []);

  // Project dropdown OPTIONS deliberately exclude the project filter itself from
  // their own query — otherwise picking a project would collapse this list down
  // to the one already picked, and there'd be no way to switch. Narrowed by
  // Team/Employee/Category/Billing Type, same idea as Employee being narrowed by Team.
  useEffect(() => {
    let alive = true;
    const params = {
      ...(teamFilter ? { teamManagerId: teamFilter } : {}),
      ...(employeeFilter ? { assigneeId: employeeFilter } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(billingTypeFilter ? { billingType: billingTypeFilter } : {}),
    };
    getProjectStatsApi(params).then(res => {
      if (!alive) return;
      const d = extractData(res);
      setProjectOptions(Array.isArray(d) ? d.filter(r => r.pmProjectId) : []);
    }).catch(() => setProjectOptions([]));
    return () => { alive = false; };
  }, [teamFilter, employeeFilter, categoryFilter, billingTypeFilter]);

  // Shared by the data-fetch effect below AND the Download Excel button, so the
  // exported file always matches exactly what's currently on screen.
  const buildFilterParams = () => ({
    ...(teamFilter ? { teamManagerId: teamFilter } : {}),
    ...(employeeFilter ? { assigneeId: employeeFilter } : {}),
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(projectFilter ? { projectId: projectFilter } : {}),
    ...(billingTypeFilter ? { billingType: billingTypeFilter } : {}),
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDashboardApi(buildFilterParams());
    } catch {
      toast.error('Failed to export dashboard');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const filterParams = buildFilterParams();
      try {
        const [sRes, prRes, tmRes, pjRes, dlRes, blRes] = await Promise.allSettled([
          getDashboardStatsApi(filterParams),
          getOpenByPriorityApi(filterParams),
          getByTeamApi(filterParams),
          getProjectStatsApi(filterParams),
          getDeadlinesApi(filterParams),
          getBillingTicketsApi(filterParams),
        ]);
        if (alive && blRes.status === 'fulfilled') {
          const d = extractData(blRes.value) || {};
          setBilling({ billable: d.billable || [], nonBillable: d.nonBillable || [] });
        }
        if (!alive) return;
        if (sRes.status === 'fulfilled')  setStats(extractData(sRes.value));
        if (prRes.status === 'fulfilled') { const d = extractData(prRes.value); setByPriority(Array.isArray(d) ? d : []); }
        if (tmRes.status === 'fulfilled') { const d = extractData(tmRes.value); setByTeam(Array.isArray(d) ? d : []); }
        if (pjRes.status === 'fulfilled') { const d = extractData(pjRes.value); setByProject(Array.isArray(d) ? d : []); }
        if (dlRes.status === 'fulfilled') {
          const d = extractData(dlRes.value) || {};
          setDeadlines({ breached: d.breached || [], upcoming: d.upcoming || [] });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [teamFilter, employeeFilter, categoryFilter, projectFilter, billingTypeFilter]);

  // /stats returns flat keys (open, inProgress…); older shapes nested them under byStatus
  const s = stats || {};
  const count = (flat, nested) => s[flat] ?? s.byStatus?.[nested];

  const pieData = byPriority
    .map(r => {
      const label = String(r.priority ?? r.label ?? '').toLowerCase();
      return { name: label || 'none', value: Number(r.count) || 0, color: PRIORITY_PIE_COLORS[label] || '#9ca3af' };
    })
    .filter(d => d.value > 0);

  const teamRows = byTeam
    .map((t, i) => ({
      key: t.teamManagerId ?? `t-${i}`, label: t.teamName ?? '—', count: Number(t.pending) || 0,
      clickable: !!t.teamManagerId, teamManagerId: t.teamManagerId,
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const projectRows = byProject
    .map((p, i) => ({
      key: p.pmProjectId ?? `p-${i}`, label: p.projectName ?? '—', count: Number(p.pending) || 0,
      clickable: !!p.pmProjectId, pmProjectId: p.pmProjectId,
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const billingPie = [
    { name: 'Billable',     value: billing.billable.length,    color: '#10b981' },
    { name: 'Non-Billable', value: billing.nonBillable.length, color: '#6b7280' },
  ].filter(d => d.value > 0);

  const rows = basis === 'breached' ? deadlines.breached : deadlines.upcoming;

  // The ticket list has no "breached" filter — the Breached card below IS that list
  const showBreached = () => {
    setBasis('breached');
    document.getElementById('hd-deadlines')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Every drill-through link carries the dashboard's active Team/Employee filter
  // forward, so the ticket list it opens always matches the count that was clicked
  // — the same "card must match the list" rule the earlier stale-request fix relies on.
  const ticketListUrl = (extra = {}) => {
    const params = new URLSearchParams({
      ...(teamFilter ? { teamManagerId: teamFilter } : {}),
      ...(employeeFilter ? { assigneeId: employeeFilter } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(projectFilter ? { projectId: projectFilter } : {}),
      ...(billingTypeFilter ? { billingType: billingTypeFilter } : {}),
      ...extra,
    });
    return `/helpdesk/tickets?${params.toString()}`;
  };
  const isEmpty = !loading && (s.total ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of tickets, SLA breaches and deadlines</p>
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

      {/* Dashboard filters — narrow the WHOLE dashboard below, from the stat cards
          down to the deadlines card. Narrows only: the server enforces this on top
          of what the signed-in role already sees. Full page width (not squeezed
          beside the title) so the grid below wraps evenly instead of leaving
          ragged, unevenly-filled rows. */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Dashboard filters</span>
          {(teamFilter || employeeFilter || categoryFilter || projectFilter || billingTypeFilter) && (
            <button
              type="button"
              onClick={() => { setTeamFilter(''); setEmployeeFilter(''); setCategoryFilter(''); setProjectFilter(''); setBillingTypeFilter(''); }}
              className="text-xs text-gray-500 hover:text-gray-800 underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {canSeeOrgWideTeam && (
            <SearchSelect
              options={teams.map(t => ({ value: t._id ?? t.id, label: `${t.name} (${t.memberCount ?? 0})` }))}
              value={teamFilter}
              onChange={v => setTeamFilter(v || '')}
              placeholder="All teams"
              disabled={teams.length === 0}
              size="sm"
              className={searchSelectActiveCls(!!teamFilter)}
            />
          )}
          {canSeeTeamFilters && (
            <SearchSelect
              options={employeeOptions.map(m => ({ value: m._id ?? m.id, label: m.name }))}
              value={employeeFilter}
              onChange={v => setEmployeeFilter(v || '')}
              placeholder={canSeeOrgWideTeam ? `All employees${teamFilter ? ' in this team' : ''}` : 'Anyone on my team'}
              disabled={employeeOptions.length === 0}
              size="sm"
              className={searchSelectActiveCls(!!employeeFilter)}
            />
          )}
          <SearchSelect
            options={projectOptions.map(p => ({ value: p.pmProjectId, label: p.projectName }))}
            value={projectFilter}
            onChange={v => setProjectFilter(v || '')}
            placeholder="All projects"
            size="sm"
            className={searchSelectActiveCls(!!projectFilter)}
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className={filterBoxCls(!!categoryFilter)}
            title="Show only this category"
          >
            <option value="">All categories</option>
            {categoryOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={billingTypeFilter}
            onChange={e => setBillingTypeFilter(e.target.value)}
            className={filterBoxCls(!!billingTypeFilter)}
            title="Show only tickets on billable / non-billable projects"
          >
            <option value="">All billing types</option>
            <option value="Billable">Billable</option>
            <option value="Non-Billable">Non-Billable</option>
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Tickets" value={s.total}                          icon={HiOutlineTicket}      color="bg-blue-100 text-blue-600"       loading={loading} onClick={() => navigate(ticketListUrl({ view: 'all' }))} />
        <StatCard label="Open"          value={count('open', 'open')}             icon={HiOutlineFolderOpen}  color="bg-sky-100 text-sky-600"         loading={loading} onClick={() => navigate(ticketListUrl({ statusKey: 'open' }))} />
        <StatCard label="In Progress"   value={count('inProgress', 'in_progress')} icon={HiOutlineClock}      color="bg-amber-100 text-amber-600"     loading={loading} onClick={() => navigate(ticketListUrl({ statusKey: 'in-progress' }))} />
        <StatCard label="SLA Breached"  value={s.slaBreached}                     icon={HiOutlineExclamation} color="bg-red-100 text-red-600"         loading={loading} onClick={showBreached} />
        <StatCard label="Resolved"      value={count('resolved', 'resolved')}     icon={HiOutlineCheckCircle} color="bg-emerald-100 text-emerald-600" loading={loading} onClick={() => navigate(ticketListUrl({ statusKey: 'resolved' }))} />
        <StatCard label="Closed"        value={count('closed', 'closed')}         icon={HiOutlineXCircle}     color="bg-gray-100 text-gray-600"       loading={loading} onClick={() => navigate(ticketListUrl({ statusKey: 'closed' }))} />
      </div>

      {isEmpty ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineTicket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No tickets yet</h3>
        </div>
      ) : (
        <>
          {/* Billable vs Non-Billable — open tickets by their project's billing type (as on the PM dashboard) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 text-sm">Billing Type Distribution</h2>
              {billingPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={billingPie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                      {billingPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value} tickets`, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-gray-400 text-sm text-center px-4">
                  No open tickets on a billable or non-billable project
                </div>
              )}
            </div>

            <TicketListCard
              title={`💰 Billable Tickets (${billing.billable.length})`}
              tone="bg-emerald-50 text-emerald-700"
              tickets={billing.billable}
              onOpen={tid => navigate(`/helpdesk/tickets/${tid}`)}
            />

            <TicketListCard
              title={`🔧 Non-Billable Tickets (${billing.nonBillable.length})`}
              tone="bg-gray-50 text-gray-600"
              tickets={billing.nonBillable}
              onOpen={tid => navigate(`/helpdesk/tickets/${tid}`)}
            />
          </div>

          {/* Breakdown row — open tickets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4 text-sm">Open Tickets by Priority</h2>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value"
                      cursor="pointer" onClick={(slice) => navigate(ticketListUrl({ priority: slice.name }))}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value} tickets`, name]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No open tickets</div>
              )}
            </div>

            <BreakdownList
              title={`Open by Team (${teamRows.reduce((n, r) => n + r.count, 0)})`}
              tone="bg-indigo-50 text-indigo-700"
              rows={teamRows}
              empty="No open tickets"
              onRowClick={r => navigate(ticketListUrl({ teamManagerId: r.teamManagerId }))}
            />

            <BreakdownList
              title={`Open by Project (${projectRows.reduce((n, r) => n + r.count, 0)})`}
              tone="bg-emerald-50 text-emerald-700"
              rows={projectRows}
              empty="No open tickets with a project"
              onRowClick={r => navigate(ticketListUrl({ projectId: r.pmProjectId }))}
            />
          </div>

          {/* Breached | Upcoming Deadlines — full width */}
          <div id="hd-deadlines" className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-4">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900">
                {basis === 'breached'
                  ? 'Breached Tickets'
                  : <>Upcoming Deadlines <span className="text-xs font-normal text-gray-400">(next 14 days)</span></>}
              </h2>
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50" role="tablist" aria-label="Ticket deadlines">
                {[
                  { key: 'breached', label: 'Breached Tickets',   count: deadlines.breached.length },
                  { key: 'upcoming', label: 'Upcoming Deadlines', count: deadlines.upcoming.length },
                ].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    aria-selected={basis === t.key}
                    onClick={() => setBasis(t.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      basis === t.key
                        ? 'bg-white text-indigo-700 shadow-sm border border-gray-200'
                        : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {t.label}
                    <span className={`ml-1 ${t.key === 'breached' && t.count > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>{t.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? <Spinner /> : rows.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                {basis === 'breached' ? 'No breached tickets' : 'No open tickets due in the next 14 days'}
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[28rem] overflow-auto">
                {rows.map(t => {
                  const tid = t._id ?? t.id;
                  return (
                    <div
                      key={tid}
                      onClick={() => navigate(`/helpdesk/tickets/${tid}`)}
                      className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors flex items-center gap-3"
                    >
                      <HiOutlineExclamation className={`w-4 h-4 flex-shrink-0 ${basis === 'breached' ? 'text-red-500' : t.daysLeft <= 2 ? 'text-red-500' : t.daysLeft <= 5 ? 'text-yellow-500' : 'text-blue-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          <span className="font-mono text-xs text-gray-400 mr-1.5">{t.reqNumber ?? `#${tid}`}</span>
                          {t.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {t.projectName || 'No project'} · {t.assigneeName || 'Unassigned'}
                          {t.priority && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize ${PRIORITY_COLORS[String(t.priority).toLowerCase()] || 'bg-gray-100 text-gray-600'}`}>
                              {t.priority}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
                        {t.dueDate ? `Due ${fmtDay(t.dueDate)}` : 'No due date'}
                      </span>
                      <DeadlineBadge row={t} basis={basis} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────
// The Scheduler, Team Availability, Tasks, Reminders and Announcements sub-tabs
// were removed (2026-09-18) — the Operations dashboard is the dashboard only.

export default function HdDashboard() {
  return (
    <div className="h-full overflow-auto bg-[#f5f5f5] p-6 text-[13px]">
      <DashboardTab />
    </div>
  );
}
