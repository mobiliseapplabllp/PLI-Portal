/**
 * HdReports.jsx
 * Helpdesk Reports page.
 * Uses the existing /helpdesk/dashboard/* API endpoints to build
 * report views: summary KPIs, by-status, by-priority, by-team,
 * monthly trend, agent stats, and project stats.
 */
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  Legend,
} from 'recharts';
import {
  getDashboardStatsApi,
  getByStatusApi,
  getByPriorityApi,
  getByTeamApi,
  getMonthlyTrendApi,
  getAgentStatsApi,
  getProjectStatsApi,
} from '../../api/helpdesk/hdDashboard.api';
import { fetchHdOptions, selectHdOptions } from '../../store/helpdeskSlice';
import {
  HiOutlineTicket,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineExclamationCircle,
  HiOutlineDownload,
  HiOutlineRefresh,
} from 'react-icons/hi';

// ---------------------------------------------------------------------------
// Colour palettes
// ---------------------------------------------------------------------------
// Real colors come from hd_options.color (admin-configurable in Helpdesk
// Settings → Operations Customization — same pattern PM Settings already
// uses for pm_statuses). These are fallbacks ONLY: used before hdOptions has
// loaded, or for a status/priority that was never assigned a color — so the
// pie chart, the priority chart, and the KPI cards all agree with whatever
// the admin configured, instead of each picking colors independently (which
// is exactly why "Open" could show as a different color in each place).
const STATUS_COLOR_FALLBACK   = '#94a3b8';
const PRIORITY_COLOR_FALLBACK = '#6366f1';
const TEAM_COLOR     = '#6366f1';
const TEAM_PENDING_COLOR = '#f59e0b';
const AREA_CREATED   = '#6366f1';
const AREA_CLOSED    = '#10b981';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const fmt = (v) => (v == null ? '—' : new Intl.NumberFormat('en-IN').format(v));

// hexColor (admin-configured, e.g. the "open" status's color) takes priority
// over the named `color` prop (a fixed Tailwind palette, kept as a fallback
// for cards that aren't tied to a specific configurable status/priority).
function KpiCard({ icon: Icon, label, value, sub, color = 'blue', hexColor }) {
  const palette = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   icon: 'bg-blue-100' },
    green:  { bg: 'bg-green-50',  text: 'text-green-600',  icon: 'bg-green-100' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  icon: 'bg-amber-100' },
    red:    { bg: 'bg-red-50',    text: 'text-red-600',    icon: 'bg-red-100' },
  };
  const p = palette[color] || palette.blue;
  const style = hexColor
    ? { bg: { backgroundColor: `${hexColor}1A` }, icon: { backgroundColor: `${hexColor}33` }, text: { color: hexColor } }
    : null;
  return (
    <div className={style ? 'rounded-xl p-4 flex items-start gap-3' : `${p.bg} rounded-xl p-4 flex items-start gap-3`} style={style?.bg}>
      <div className={style ? 'rounded-xl p-2.5 shrink-0' : `${p.icon} rounded-xl p-2.5 shrink-0`} style={style?.icon}>
        <Icon className={style ? 'w-5 h-5' : `w-5 h-5 ${p.text}`} style={style?.text} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className={style ? 'text-2xl font-bold leading-tight' : `text-2xl font-bold ${p.text} leading-tight`} style={style?.text}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HdReports() {
  const dispatch = useDispatch();
  const hdOptions = useSelector(selectHdOptions);
  useEffect(() => {
    if (!hdOptions || Object.keys(hdOptions).length === 0) dispatch(fetchHdOptions());
  }, [dispatch, hdOptions]);
  // name -> hex color, built from admin-configured hd_options (the single
  // source of truth every status/priority color must come from).
  // Lowercased keys on both sides — hd_tickets.priority is stored lowercase
  // ('low'/'medium'/'high') while hd_options.priority names are Title Case
  // ('Low'/'Medium'/'High'/'Critical'); a case-sensitive lookup here would
  // silently never match and always fall back to the generic color.
  const statusColorMap = Object.fromEntries((hdOptions?.status || []).map(o => [o.name.toLowerCase(), o.color]).filter(([, c]) => c));
  const priorityColorMap = Object.fromEntries((hdOptions?.priority || []).map(o => [o.name.toLowerCase(), o.color]).filter(([, c]) => c));

  const [stats,    setStats]    = useState(null);
  const [byStatus, setByStatus] = useState([]);
  const [byPri,    setByPri]    = useState([]);
  const [byTeam,   setByTeam]   = useState([]);
  const [trend,    setTrend]    = useState([]);
  const [agents,   setAgents]   = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [sR, stR, prR, tmR, trR, agR, pjR] = await Promise.allSettled([
        getDashboardStatsApi(),
        getByStatusApi(),
        getByPriorityApi(),
        getByTeamApi(),
        getMonthlyTrendApi(),
        getAgentStatsApi(),
        getProjectStatsApi(),
      ]);

      const safe = (r) => (r.status === 'fulfilled' ? (r.value?.data?.data ?? r.value?.data ?? []) : []);

      setStats(safe(sR));
      setByStatus(normaliseArray(safe(stR)));
      setByPri(normaliseArray(safe(prR)));
      setByTeam(normaliseTeams(safe(tmR)));
      setTrend(normaliseArray(safe(trR)));
      setAgents(normaliseArray(safe(agR)));
      setProjects(normaliseArray(safe(pjR)));
    } catch (e) {
      setError(e.message || 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Export summary as CSV
  const handleExport = () => {
    const rows = [
      ['Report', 'Operations Summary', new Date().toLocaleString()],
      [],
      ['By Status', 'Count'],
      ...byStatus.map(r => [r.label || r.status || r.name, r.count ?? r.value ?? 0]),
      [],
      ['By Priority', 'Count'],
      ...byPri.map(r => [r.label || r.priority || r.name, r.count ?? r.value ?? 0]),
      [],
      ['By Team', 'Total', 'Pending'],
      ...byTeam.map(r => [r.label, r.count ?? 0, r.pending ?? 0]),
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hd_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading reports…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
        {error}
        <button onClick={load} className="ml-3 underline hover:no-underline">Retry</button>
      </div>
    );
  }

  const totalTickets   = stats?.total        ?? stats?.totalTickets      ?? 0;
  const openTickets    = stats?.open         ?? stats?.openTickets        ?? 0;
  const closedTickets  = stats?.closed       ?? stats?.closedTickets      ?? 0;
  const overdueTickets = stats?.overdue      ?? stats?.overdueTickets     ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live stats from all operations tickets</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <HiOutlineRefresh className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <HiOutlineDownload className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={HiOutlineTicket}           label="Total Tickets"  value={fmt(totalTickets)}   color="blue" />
        <KpiCard icon={HiOutlineClock}            label="Open"           value={fmt(openTickets)}    color="amber" hexColor={statusColorMap.open} />
        <KpiCard icon={HiOutlineCheckCircle}      label="Closed"         value={fmt(closedTickets)}  color="green" hexColor={statusColorMap.closed} />
        <KpiCard icon={HiOutlineExclamationCircle} label="Overdue"       value={fmt(overdueTickets)} color="red" />
      </div>

      {/* By Status + By Priority */}
      <div className="grid md:grid-cols-2 gap-4">
        {byStatus.length > 0 && (
          <Section title="Tickets by Status">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ label, count }) => `${label}: ${count}`}
                  labelLine={false}
                >
                  {byStatus.map((r, i) => (
                    <Cell key={i} fill={statusColorMap[String(r.label).toLowerCase()] || STATUS_COLOR_FALLBACK} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          </Section>
        )}

        {byPri.length > 0 && (
          <Section title="Tickets by Priority">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byPri} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Tickets" radius={[6, 6, 0, 0]}>
                  {byPri.map((r, i) => (
                    <Cell key={i} fill={priorityColorMap[String(r.label).toLowerCase()] || PRIORITY_COLOR_FALLBACK} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>
        )}
      </div>

      {/* Monthly Trend */}
      {trend.length > 0 && (
        <Section title="Monthly Ticket Trend (Created vs Closed)">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={AREA_CREATED} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={AREA_CREATED} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gClosed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={AREA_CLOSED} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={AREA_CLOSED} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="created" name="Created" stroke={AREA_CREATED} fill="url(#gCreated)" strokeWidth={2} />
              <Area type="monotone" dataKey="closed"  name="Closed"  stroke={AREA_CLOSED}  fill="url(#gClosed)"  strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* By Team */}
      {byTeam.length > 0 && (
        <Section title="Tickets by Team">
          <ResponsiveContainer width="100%" height={Math.max(200, byTeam.length * 36)}>
            <BarChart data={byTeam} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count"   name="Total"   fill={TEAM_COLOR}         radius={[0, 6, 6, 0]} />
              <Bar dataKey="pending" name="Pending" fill={TEAM_PENDING_COLOR} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Agent Stats */}
      {agents.length > 0 && (
        <Section title="Employee Performance">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Employee</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Open</th>
                  <th className="px-4 py-2.5 text-right">Closed</th>
                  <th className="px-4 py-2.5 text-right">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.map((a, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {a.agent || a.name || a.label || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(a.total ?? a.count)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmt(a.open)}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">{fmt(a.closed)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{fmt(a.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Project Stats */}
      {projects.length > 0 && (
        <Section title="Tickets by Project">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Project</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Open</th>
                  <th className="px-4 py-2.5 text-right">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {projects.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {p.project || p.name || p.label || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{fmt(p.total ?? p.count)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmt(p.open)}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">{fmt(p.closed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {byStatus.length === 0 && byPri.length === 0 && agents.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineTicket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No report data available</p>
          <p className="text-sm text-gray-400 mt-1">Create some operations tickets to see reports here</p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center pb-2">
        Generated {new Date().toLocaleString()} · data from UAT environment
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Normalise /by-team rows { teamManagerId, teamName, total, pending }
// into { label, count, pending } for the chart / CSV export.
// ---------------------------------------------------------------------------
function normaliseTeams(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(r => ({
    teamManagerId: r.teamManagerId ?? null,
    label:   r.teamName ?? r.label ?? '—',
    count:   Number(r.total ?? r.count ?? 0),
    pending: Number(r.pending ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Normalise various API response shapes into { label, count } arrays
// ---------------------------------------------------------------------------
function normaliseArray(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(item => {
    // Already normalised
    if (item.label !== undefined) return item;
    // Pick the first string-ish key as label
    const keys = Object.keys(item);
    const labelKey = keys.find(k => ['status','priority','agent','project','name','month','label'].includes(k)) || keys[0];
    const countKey = keys.find(k => ['count','total','value','tickets'].includes(k)) || keys.find(k => k !== labelKey) || 'count';
    return { ...item, label: item[labelKey] ?? '—', count: Number(item[countKey] ?? 0) };
  });
}
