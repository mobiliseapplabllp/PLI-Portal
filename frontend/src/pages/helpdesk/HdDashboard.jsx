/**
 * HdDashboard.jsx
 * 6-tab Helpdesk Dashboard for PLI Portal.
 * Tabs: Dashboard | Scheduler | Team Availability | Tasks | Reminders | Announcements
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  HiOutlineTicket,
  HiOutlineFolderOpen,
  HiOutlineClock,
  HiOutlineExclamation,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineArrowRight,
  HiOutlinePlus,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineBell,
  HiOutlineX,
  HiOutlineSpeakerphone,
  HiOutlineClipboardList,
  HiOutlineUsers,
  HiOutlineLocationMarker,
  HiOutlineFilter,
  HiOutlineExclamationCircle,
  HiOutlineDocumentText,
  HiOutlineTrash,
} from 'react-icons/hi';
import {
  getDashboardStatsApi,
  getByStatusApi,
  getByPriorityApi,
  getByGroupApi,
  getMonthlyTrendApi,
} from '../../api/helpdesk/hdDashboard.api';
import { getTicketsApi } from '../../api/helpdesk/tickets.api';
import {
  getAnnouncementsApi,
  createAnnouncementApi,
  deleteAnnouncementApi,
} from '../../api/helpdesk/announcements.api';
import api from '../../api/axios';
import { getUsersApi } from '../../api/users.api';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'scheduler',     label: 'Scheduler' },
  { id: 'availability',  label: 'Team Availability' },
  { id: 'tasks',         label: 'Tasks' },
  { id: 'reminders',     label: 'Reminders' },
  { id: 'announcements', label: 'Announcements' },
];

const ADMIN_ROLES = ['admin', 'manager', 'senior_manager'];

const STATUS_COLORS = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  pending:     'bg-purple-100 text-purple-700',
  resolved:    'bg-emerald-100 text-emerald-700',
  closed:      'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-blue-100 text-blue-700',
  low:      'bg-emerald-100 text-emerald-700',
};

const PRIORITY_BORDER = {
  Critical: '#ef4444',
  High:     '#f59e0b',
  Medium:   '#3b82f6',
  Low:      '#22c55e',
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-amber-500', 'bg-rose-500', 'bg-teal-500',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateShort = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : `${dt.getDate()}/${dt.getMonth() + 1}`;
};

const pad = (n) => String(n).padStart(2, '0');

const extractData = (res) => res?.data?.data ?? res?.data ?? res ?? null;

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, loading }) {
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
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}><Icon className="w-6 h-6" /></div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? 0}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function CssBarChart({ title, data, colorFn }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map(({ label, count }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-gray-600 w-28 flex-shrink-0 capitalize">{String(label).replace(/_/g, ' ')}</span>
            <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-5 rounded-full transition-all ${colorFn(label)}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-700 w-6 text-right">{count}</span>
          </div>
        ))}
        {data.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
      </div>
    </div>
  );
}

/** Scrollable table box with up/down arrow controls — mirrors original Dashboard.jsx */
function ScrollableStatBox({ title, children }) {
  const scrollRef = useRef(null);
  const [canUp, setCanUp]     = useState(false);
  const [canDown, setCanDown] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanUp(el.scrollTop > 0);
    setCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  };

  useEffect(() => { checkScroll(); }, [children]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ top: dir * 60, behavior: 'smooth' });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col" style={{ height: '200px' }}>
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => scroll(-1)}
            disabled={!canUp}
            className={`p-0.5 rounded transition-colors ${canUp ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-300 cursor-default'}`}
          >
            <HiOutlineChevronUp className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-gray-400 font-medium px-0.5">SCROLL</span>
          <button
            onClick={() => scroll(1)}
            disabled={!canDown}
            className={`p-0.5 rounded transition-colors ${canDown ? 'text-gray-500 hover:bg-gray-100' : 'text-gray-300 cursor-default'}`}
          >
            <HiOutlineChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ scrollbarWidth: 'thin' }}
      >
        {children}
      </div>
    </div>
  );
}

/** Half-donut SVG gauge — mirrors original Dashboard.jsx */
function GaugeChart({ title, value, total, color, onClick }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <h3 className="font-medium text-xs mb-2">{title}</h3>
      <div className="relative h-16">
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
          <path
            d="M 10 45 A 40 40 0 0 1 90 45"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${pct * 1.26} 126`}
          />
        </svg>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <span className="text-xl font-bold">{value}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab 1: Dashboard ─────────────────────────────────────────────────────────

function DashboardTab() {
  const navigate = useNavigate();
  const { user } = useSelector(s => s.auth);

  // Existing stats
  const [loading, setLoading]       = useState(true);
  const [stats, setStats]           = useState(null);
  const [byStatus, setByStatus]     = useState([]);
  const [byPriority, setByPriority] = useState([]);
  const [byGroup, setByGroup]       = useState([]);
  const [trend, setTrend]           = useState([]);
  const [tickets, setTickets]       = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  // New dashboard widgets
  const [agentStats, setAgentStats]     = useState([]);
  const [teamData, setTeamData]         = useState([]);
  const [projectStats, setProjectStats] = useState([]);
  const [myStats, setMyStats]           = useState({ open: 0, total: 0 });
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [slaStats, setSlaStats]         = useState({ breached: 0, total: 0 });
  const [weeklyTrend, setWeeklyTrend]   = useState([]);
  const [newLoading, setNewLoading]     = useState(true);

  useEffect(() => {
    let alive = true;

    // Existing API calls
    (async () => {
      setLoading(true);
      try {
        const [sRes, stRes, prRes, grRes, trRes] = await Promise.allSettled([
          getDashboardStatsApi(),
          getByStatusApi(),
          getByPriorityApi(),
          getByGroupApi(),
          getMonthlyTrendApi(),
        ]);
        if (!alive) return;

        if (sRes.status  === 'fulfilled') setStats(extractData(sRes.value));
        if (stRes.status === 'fulfilled') {
          const raw = extractData(stRes.value);
          setByStatus(Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([label, count]) => ({ label, count })));
        }
        if (prRes.status === 'fulfilled') {
          const raw = extractData(prRes.value);
          setByPriority(Array.isArray(raw) ? raw : Object.entries(raw || {}).map(([label, count]) => ({ label, count })));
        }
        if (grRes.status === 'fulfilled') {
          const raw = extractData(grRes.value);
          setByGroup(Array.isArray(raw) ? raw : []);
        }
        if (trRes.status === 'fulfilled') {
          const raw = extractData(trRes.value);
          setTrend(Array.isArray(raw) ? raw : []);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // Recent tickets
    (async () => {
      setTicketsLoading(true);
      try {
        const res  = await getTicketsApi({ pageSize: 10, sort: '-created_at' });
        const data = extractData(res);
        if (alive) setTickets(data?.tickets ?? []);
      } catch {
        if (alive) setTickets([]);
      } finally {
        if (alive) setTicketsLoading(false);
      }
    })();

    // New widget API calls
    (async () => {
      setNewLoading(true);
      try {
        const [agentRes, teamRes, projRes, myRes, unassRes, slaRes, weekRes] = await Promise.allSettled([
          api.get('/helpdesk/dashboard/agent-stats'),
          api.get('/helpdesk/dashboard/raised-by-team'),
          api.get('/helpdesk/dashboard/project-stats'),
          api.get('/helpdesk/dashboard/my-stats'),
          api.get('/helpdesk/dashboard/unassigned-count'),
          api.get('/helpdesk/dashboard/sla-stats'),
          api.get('/helpdesk/dashboard/weekly-trend'),
        ]);
        if (!alive) return;

        if (agentRes.status === 'fulfilled') {
          const d = extractData(agentRes.value);
          setAgentStats(Array.isArray(d) ? d : []);
        }
        if (teamRes.status === 'fulfilled') {
          const d = extractData(teamRes.value);
          setTeamData(Array.isArray(d) ? d : []);
        }
        if (projRes.status === 'fulfilled') {
          const d = extractData(projRes.value);
          setProjectStats(Array.isArray(d) ? d : []);
        }
        if (myRes.status === 'fulfilled') {
          const d = extractData(myRes.value);
          if (d) setMyStats({ open: d.open ?? 0, total: d.total ?? 0, agentName: d.agentName });
        }
        if (unassRes.status === 'fulfilled') {
          const d = extractData(unassRes.value);
          setUnassignedCount(typeof d === 'number' ? d : (d?.count ?? 0));
        }
        if (slaRes.status === 'fulfilled') {
          const d = extractData(slaRes.value);
          if (d) setSlaStats({ breached: d.breached ?? d.violated ?? 0, total: d.total ?? 0 });
        }
        if (weekRes.status === 'fulfilled') {
          const d = extractData(weekRes.value);
          if (Array.isArray(d)) {
            setWeeklyTrend(d.map(t => ({
              label: t.date ? fmtDateShort(t.date) : '',
              received:  Number(t.created ?? t.received ?? 0),
              completed: Number(t.closed  ?? t.completed ?? 0),
            })));
          }
        }
      } finally {
        if (alive) setNewLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  // Fallback 7-day skeleton when API returns nothing
  const last7Days = weeklyTrend.length > 0 ? weeklyTrend : Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, received: 0, completed: 0 };
  });

  const statusBarColor = (s) => ({
    open: 'bg-blue-500', in_progress: 'bg-amber-500',
    pending: 'bg-purple-500', resolved: 'bg-emerald-500', closed: 'bg-gray-400',
  }[String(s).toLowerCase()] || 'bg-gray-400');

  const priorityBarColor = (p) => ({
    critical: 'bg-red-500', high: 'bg-orange-500',
    medium: 'bg-blue-500', low: 'bg-emerald-500',
  }[String(p).toLowerCase()] || 'bg-gray-400');

  const statusData = byStatus.length ? byStatus : [
    { label: 'open',        count: stats?.byStatus?.open        ?? 0 },
    { label: 'in_progress', count: stats?.byStatus?.in_progress ?? 0 },
    { label: 'pending',     count: stats?.byStatus?.pending     ?? 0 },
    { label: 'resolved',    count: stats?.byStatus?.resolved    ?? 0 },
    { label: 'closed',      count: stats?.byStatus?.closed      ?? 0 },
  ];

  const priorityData = byPriority.length ? byPriority : [
    { label: 'critical', count: stats?.byPriority?.critical ?? 0 },
    { label: 'high',     count: stats?.byPriority?.high     ?? 0 },
    { label: 'medium',   count: stats?.byPriority?.medium   ?? 0 },
    { label: 'low',      count: stats?.byPriority?.low      ?? 0 },
  ];

  const totalTickets = stats?.total ?? 0;
  const isEmpty = !loading && !newLoading && totalTickets === 0 && agentStats.length === 0;

  // Quick Stats derived values
  const quickTotal      = stats?.total ?? 0;
  const quickPending    = stats?.tasks?.pending ?? 0;
  const quickResolved   = stats?.byStatus?.resolved ?? 0;
  const quickAssignees  = agentStats.length;

  // Priority pie chart data (matches original colors)
  const priorityPieData = priorityData.map(d => {
    const lbl   = String(d.label ?? d.priority ?? '').toLowerCase();
    const color = lbl === 'low' ? '#4caf50' : lbl === 'medium' ? '#607d8b' : lbl === 'high' ? '#ff9800' : '#f44336';
    return { priority: d.label ?? d.priority, count: d.count, color };
  });

  return (
    <div className="space-y-6">
      {/* ── Dashboard header with filter buttons ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <HiOutlineDocumentText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">Helpdesk Dashboard</h1>
            <p className="text-[11px] text-slate-500">Overview of requests and metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
            <HiOutlineLocationMarker className="w-4 h-4" /> All Sites
          </button>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
            <HiOutlineUsers className="w-4 h-4" /> All Groups
          </button>
          <button
            onClick={() => navigate('/helpdesk/tickets/new')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium shadow-md shadow-indigo-500/25 transition-all"
          >
            <HiOutlinePlus className="w-4 h-4" /> New Request
          </button>
        </div>
      </div>

      {/* ── Global empty state ── */}
      {isEmpty ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HiOutlineTicket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No tickets yet. Create the first one.</h3>
          <p className="text-gray-400 mb-6 text-sm">Once tickets are created, dashboard analytics will appear here.</p>
          <button
            onClick={() => navigate('/helpdesk/tickets/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" /> New Request
          </button>
        </div>
      ) : (
        <>
          {/* ── Row 1: Scrollable stat boxes ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ScrollableStatBox title="Agent Statistics">
              {newLoading ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1.5 font-medium">Agent Name</th>
                      <th className="text-right py-1.5 font-medium">Total</th>
                      <th className="text-right py-1.5 font-medium">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.map((a, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5">
                          <button
                            onClick={() => navigate(
                              a.name === 'Unassigned'
                                ? '/helpdesk/tickets?assigneeId=unassigned'
                                : `/helpdesk/tickets?technician=${encodeURIComponent(a.name)}`
                            )}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {a.name}
                          </button>
                        </td>
                        <td className="text-right py-1.5 text-gray-700">{a.total}</td>
                        <td className="text-right py-1.5 font-medium text-amber-600">{a.pending}</td>
                      </tr>
                    ))}
                    {agentStats.length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-300 text-xs">No agent data</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </ScrollableStatBox>

            <ScrollableStatBox title="Raised by Team">
              {newLoading ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1.5 font-medium">Team</th>
                      <th className="text-right py-1.5 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamData.map((t, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-700">{t.team ?? t.name ?? '—'}</td>
                        <td className="text-right py-1.5 font-semibold text-gray-900">{t.count ?? 0}</td>
                      </tr>
                    ))}
                    {teamData.length === 0 && (
                      <tr><td colSpan={2} className="py-4 text-center text-gray-300 text-xs">No team data</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </ScrollableStatBox>

            <ScrollableStatBox title="Projects (Total / Pending)">
              {newLoading ? (
                <div className="flex items-center justify-center h-24">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left py-1.5 font-medium">Project</th>
                      <th className="text-right py-1.5 font-medium">Total</th>
                      <th className="text-right py-1.5 font-medium">Pending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectStats.map((p, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 truncate max-w-[130px] text-gray-700" title={p.name}>{p.name ?? '—'}</td>
                        <td className="text-right py-1.5 text-gray-700">{p.total ?? 0}</td>
                        <td className="text-right py-1.5 font-medium text-amber-600">{p.pending ?? 0}</td>
                      </tr>
                    ))}
                    {projectStats.length === 0 && (
                      <tr><td colSpan={3} className="py-4 text-center text-gray-300 text-xs">No project data</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </ScrollableStatBox>
          </div>

          {/* ── Row 2: Gauge charts + Priority pie ── */}
          <div className="grid grid-cols-4 gap-4">
            <GaugeChart
              title="SLA Violated"
              value={slaStats.breached}
              total={Math.max(slaStats.total, 1)}
              color="#f44336"
            />
            <GaugeChart
              title="Open Point (Self only)"
              value={myStats.open}
              total={Math.max(myStats.total, 1)}
              color="#2196f3"
              onClick={() => navigate(`/helpdesk/tickets?technician=${encodeURIComponent(myStats.agentName ?? user?.name ?? '')}`)}
            />
            <GaugeChart
              title="Unassigned"
              value={unassignedCount}
              total={Math.max(totalTickets, 1)}
              color="#607d8b"
              onClick={() => navigate('/helpdesk/tickets?assigneeId=unassigned')}
            />
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-xs mb-2">Priority</h3>
              <ResponsiveContainer width="100%" height={100}>
                <PieChart>
                  <Pie data={priorityPieData} cx="50%" cy="50%" outerRadius={40} dataKey="count">
                    {priorityPieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 text-[10px] mt-2">
                {priorityPieData.map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: item.color }} />
                    <span>{item.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 3: Weekly Bar Chart + Quick Stats ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-xs mb-3">Requests Last Week</h3>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={last7Days}>
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar dataKey="received"  name="Received"  fill="#4caf50" />
                  <Bar dataKey="completed" name="Completed" fill="#2196f3" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-xs mb-3">Quick Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xl font-bold text-blue-600">{quickTotal}</p>
                  <p className="text-sm text-gray-600">Total Request</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xl font-bold text-yellow-600">{quickPending}</p>
                  <p className="text-sm text-gray-600">Pending Task</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-xl font-bold text-green-600">{quickResolved}</p>
                  <p className="text-sm text-gray-600">Resolved</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <p className="text-xl font-bold text-purple-600">{quickAssignees}</p>
                  <p className="text-sm text-gray-600">Active Tech</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 4: Existing stat cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label="Total Tickets"  value={stats?.total}                  icon={HiOutlineTicket}      color="bg-blue-100 text-blue-600"      loading={loading} />
            <StatCard label="Open"           value={stats?.byStatus?.open}         icon={HiOutlineFolderOpen}  color="bg-sky-100 text-sky-600"        loading={loading} />
            <StatCard label="In Progress"    value={stats?.byStatus?.in_progress}  icon={HiOutlineClock}       color="bg-amber-100 text-amber-600"    loading={loading} />
            <StatCard label="SLA Breached"   value={stats?.slaBreached}            icon={HiOutlineExclamation} color="bg-red-100 text-red-600"        loading={loading} />
            <StatCard label="Resolved"       value={stats?.byStatus?.resolved}     icon={HiOutlineCheckCircle} color="bg-emerald-100 text-emerald-600" loading={loading} />
            <StatCard label="Closed"         value={stats?.byStatus?.closed}       icon={HiOutlineXCircle}     color="bg-gray-100 text-gray-600"      loading={loading} />
          </div>

          {/* ── Row 5: Status + Priority charts ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {loading
              ? <div className="bg-white rounded-xl border border-gray-200 p-5"><Spinner /></div>
              : <CssBarChart title="Tickets by Status"   data={statusData}   colorFn={statusBarColor}   />
            }
            {loading
              ? <div className="bg-white rounded-xl border border-gray-200 p-5"><Spinner /></div>
              : <CssBarChart title="Tickets by Priority" data={priorityData} colorFn={priorityBarColor} />
            }
          </div>

          {/* ── Row 6: Group table + Monthly trend ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Tickets by Group</h3>
              </div>
              {loading ? <Spinner /> : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3 text-left">Group</th>
                      <th className="px-5 py-3 text-right">Tickets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {byGroup.length === 0
                      ? <tr><td colSpan={2} className="px-5 py-6 text-center text-gray-400 text-sm">No group data</td></tr>
                      : byGroup.map((g, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-5 py-3 text-gray-800">{g.group?.name ?? g.label ?? g.name ?? '—'}</td>
                            <td className="px-5 py-3 text-right font-semibold text-gray-900">{g.count ?? 0}</td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Monthly Trend</h3>
              {loading ? <Spinner /> : trend.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No trend data</p>
              ) : (() => {
                const trendMax = Math.max(...trend.map(t => Math.max(t.created ?? t.count ?? 0, t.closed ?? 0)), 1);
                return (
                  <div className="space-y-3">
                    {trend.slice(-8).map((t, i) => {
                      const created = t.created ?? t.count ?? 0;
                      const closed  = t.closed  ?? 0;
                      const label   = t.month   ?? t.date ?? t.label ?? `M${i + 1}`;
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span className="capitalize">{String(label).slice(0, 7)}</span>
                            <span className="font-medium text-gray-700">+{created} / -{closed}</span>
                          </div>
                          <div className="flex gap-1">
                            <div className="h-3 rounded-full bg-blue-400" style={{ width: `${(created / trendMax) * 50}%`, minWidth: created > 0 ? '4px' : '0' }} />
                            <div className="h-3 rounded-full bg-emerald-400" style={{ width: `${(closed / trendMax) * 50}%`, minWidth: closed > 0 ? '4px' : '0' }} />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-400 inline-block" /> Created</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" /> Closed</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Row 7: Recent tickets ── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Tickets</h2>
              <button
                onClick={() => navigate('/helpdesk/tickets')}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                View All <HiOutlineArrowRight className="w-3 h-3" />
              </button>
            </div>
            {ticketsLoading ? <Spinner /> : tickets.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No tickets yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3 text-left">REQ #</th>
                      <th className="px-5 py-3 text-left">Title</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-left">Priority</th>
                      <th className="px-5 py-3 text-left">Assignee</th>
                      <th className="px-5 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tickets.slice(0, 10).map(t => (
                      <tr
                        key={t.id}
                        onClick={() => navigate(`/helpdesk/tickets/${t.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3 text-xs font-mono text-gray-500">{t.reqNumber ?? t.ticket_number ?? `#${t.id}`}</td>
                        <td className="px-5 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title ?? t.subject}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-700'}`}>
                            {String(t.status ?? '').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${PRIORITY_COLORS[String(t.priority ?? '').toLowerCase()] || 'bg-gray-100 text-gray-700'}`}>
                            {t.priority}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{t.assignee?.name ?? t.assigned_to?.name ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(t.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab 2: Scheduler ─────────────────────────────────────────────────────────

function SchedulerTab() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [ticketsByDay, setTicketsByDay] = useState({});
  const [loading, setLoading]           = useState(true);
  const [selectedDay, setSelectedDay]   = useState(null);

  const year        = currentDate.getFullYear();
  const month       = currentDate.getMonth();
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const today  = new Date();
  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  const dayKey  = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res  = await getTicketsApi({ pageSize: 500 });
        const data = extractData(res);
        const list = data?.tickets ?? [];
        const map  = {};
        for (const t of list) {
          const raw = t.due_date ?? t.dueDate;
          if (!raw) continue;
          const dt = new Date(raw);
          if (isNaN(dt.getTime())) continue;
          const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
          if (!map[key]) map[key] = [];
          map[key].push(t);
        }
        if (alive) setTicketsByDay(map);
      } catch {
        if (alive) setTicketsByDay({});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const prioColor = (p) =>
    PRIORITY_BORDER[p] ??
    PRIORITY_BORDER[Object.keys(PRIORITY_BORDER).find(k => k.toLowerCase() === String(p ?? '').toLowerCase())] ??
    '#94a3b8';

  const statusBadge = (s) =>
    `px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[String(s ?? '').toLowerCase()] || 'bg-gray-100 text-gray-700'}`;

  const panelLabel = () => {
    if (!selectedDay) return '';
    const [y, m, d] = selectedDay.split('-').map(Number);
    return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
  };
  const selectedList = (selectedDay && ticketsByDay[selectedDay]) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentDate(new Date(year, month - 1))}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date(year, month + 1))}
            className="p-1 hover:bg-gray-200 rounded"
          >
            <HiOutlineChevronRight className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold">{MONTH_NAMES[month]} {year}</h2>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="ml-2 px-3 py-1 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {loading ? 'Loading tickets…' : 'Tickets on their due date — click a day for details'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7">
          {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(d => (
            <div key={d} className="p-3 text-center text-sm font-medium bg-gray-50 border-b">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const list      = day ? (ticketsByDay[dayKey(day)] || []) : [];
            const todayCell = isToday(day);
            return (
              <div
                key={idx}
                onClick={() => day && setSelectedDay(dayKey(day))}
                className={`min-h-[100px] p-2 border-b border-r align-top ${day ? 'cursor-pointer hover:bg-gray-50' : ''} ${todayCell ? 'bg-blue-50' : ''}`}
              >
                {day && (
                  <>
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm ${todayCell ? 'bg-[#2196f3] text-white' : ''}`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map(t => (
                        <div
                          key={t.id}
                          title={`${t.reqNumber ?? t.ticket_number ?? '#' + t.id} · ${t.title ?? t.subject}`}
                          className="truncate text-[10px] pl-1.5 pr-1 py-0.5 rounded bg-gray-50 text-gray-700 border-l-2"
                          style={{ borderColor: prioColor(t.priority) }}
                        >
                          {t.reqNumber ?? t.ticket_number ?? `#${t.id}`} · {t.title ?? t.subject}
                        </div>
                      ))}
                      {list.length > 3 && (
                        <div className="text-[9px] text-gray-500 pl-1.5">+{list.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        {Object.entries(PRIORITY_BORDER).map(([p, c]) => (
          <span key={p} className="flex items-center gap-1">
            <span className="w-3 h-1.5 rounded" style={{ backgroundColor: c }} />
            {p}
          </span>
        ))}
      </div>

      {selectedDay && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedDay(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Tickets due · {panelLabel()}</h3>
              <button onClick={() => setSelectedDay(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <HiOutlineX className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-2 overflow-y-auto">
              {selectedList.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No tickets due on this day.</p>
              ) : selectedList.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedDay(null); navigate(`/helpdesk/tickets/${t.id}`); }}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-blue-600 font-mono text-xs font-semibold">
                      {t.reqNumber ?? t.ticket_number ?? `#${t.id}`}
                    </span>
                    <span className={statusBadge(t.status)}>{String(t.status ?? '').replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-sm text-gray-900 font-medium truncate">{t.title ?? t.subject}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: prioColor(t.priority) + '22', color: prioColor(t.priority) }}
                    >
                      {t.priority}
                    </span>
                    <span className="text-[11px] text-gray-500">{t.assignee?.name ?? t.assigned_to?.name ?? 'Unassigned'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: Team Availability (NEW) ──────────────────────────────────────────

function AvailabilityTab() {
  const { user: currentUser } = useSelector(s => s.auth);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  // localAvailability: Map of userId (string) → boolean (true = available)
  const [localAvailability, setLocalAvailability] = useState(new Map());

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res  = await getUsersApi({ pageSize: 50 });
        const data = extractData(res);
        const list = Array.isArray(data) ? data : (data?.users ?? data?.data ?? []);
        if (alive) {
          setUsers(list);
          // Default all users to available
          const map = new Map();
          list.forEach(u => map.set(String(u.id), true));
          setLocalAvailability(map);
        }
      } catch {
        if (alive) setUsers([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const toggleAvailability = (userId) => {
    setLocalAvailability(prev => {
      const next = new Map(prev);
      next.set(String(userId), !prev.get(String(userId)));
      return next;
    });
  };

  const isAvailable = (userId) => localAvailability.get(String(userId)) !== false;
  const isMe = (userId) => String(userId) === String(currentUser?.id);

  const initials = (name) => {
    if (!name) return '?';
    const parts = String(name).split(' ').filter(Boolean);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : String(name).slice(0, 2).toUpperCase();
  };

  const avatarColor = (id) => AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
          <HiOutlineUsers className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Team Availability</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length} team member{users.length !== 1 ? 's' : ''} — toggle availability below
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 flex items-center gap-2">
        <HiOutlineExclamation className="w-4 h-4 flex-shrink-0" />
        Availability is tracked locally in this session only. No API persistence yet.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3 text-left">Member</th>
              <th className="px-5 py-3 text-left">Role</th>
              <th className="px-5 py-3 text-left">Group / Department</th>
              <th className="px-5 py-3 text-left">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-gray-400">No team members found</td>
              </tr>
            ) : users.map(u => {
              const available = isAvailable(u.id);
              const mine      = isMe(u.id);
              return (
                <tr
                  key={u.id}
                  className={`transition-colors ${mine ? 'border-l-4 border-l-blue-500 bg-blue-50/30 hover:bg-blue-50/50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${avatarColor(u.id)}`}>
                        {initials(u.name ?? u.full_name)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {u.name ?? u.full_name ?? '—'}
                          {mine && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">You</span>}
                        </p>
                        <p className="text-xs text-gray-400">{u.email ?? ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">
                      {String(u.role ?? '').replace(/_/g, ' ') || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 text-sm">
                    {u.group?.name ?? u.department ?? u.group_name ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleAvailability(u.id)}
                      title="Availability is tracked locally"
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        available
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {available ? 'Available' : 'Unavailable'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 4: Tasks ─────────────────────────────────────────────────────────────

function TasksTab() {
  const { user }                              = useSelector(s => s.auth);
  const [tasks, setTasks]                     = useState([]);
  const [showAddForm, setShowAddForm]         = useState(false);
  const [newTask, setNewTask]                 = useState({ title: '', module: 'General', priority: 'High' });
  const [loading, setLoading]                 = useState(true);

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try {
      const res  = await api.get('/helpdesk/tasks');
      const data = extractData(res);
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    try {
      await api.post('/helpdesk/tasks', { ...newTask, createdBy: user?.name || 'User' });
      setNewTask({ title: '', module: 'General', priority: 'High' });
      setShowAddForm(false);
      loadTasks();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    try {
      await api.put(`/helpdesk/tickets/tasks/${id}`, { status: currentStatus === 'completed' ? 'pending' : 'completed' });
      loadTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDeleteTask = async (id) => {
    try {
      await api.delete(`/helpdesk/tickets/tasks/${id}`);
      loadTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="p-4">
      <div className="bg-white rounded-lg border">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <h2 className="font-medium">All Tasks</h2>
            <HiOutlineFilter className="w-4 h-4 text-gray-400 ml-2" />
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded text-sm"
          >
            <HiOutlinePlus className="w-4 h-4" /> Quick Add
          </button>
        </div>

        {showAddForm && (
          <div className="p-4 border-b bg-gray-50">
            <form onSubmit={handleAddTask} className="flex gap-3">
              <input
                type="text"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="Task title"
                className="flex-1 px-3 py-2 border rounded text-sm"
                autoFocus
              />
              <select
                value={newTask.module}
                onChange={(e) => setNewTask({ ...newTask, module: e.target.value })}
                className="px-3 py-2 border rounded text-sm"
              >
                <option>General</option>
                <option>Request</option>
              </select>
              <select
                value={newTask.priority}
                onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="px-3 py-2 border rounded text-sm"
              >
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <button type="submit" className="px-4 py-2 bg-[#2196f3] text-white rounded text-sm">Add</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
            </form>
          </div>
        )}

        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-8 p-3"><input type="checkbox" /></th>
              <th className="w-8 p-3"></th>
              <th className="text-left p-3">Tasks</th>
              <th className="text-left p-3">Module</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-gray-500">No tasks. Click &quot;Quick Add&quot; to create one.</td>
              </tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id} className="border-t hover:bg-gray-50">
                  <td className="p-3"><input type="checkbox" /></td>
                  <td className="p-3">
                    <div className="w-8 h-8 bg-yellow-100 rounded flex items-center justify-center">
                      <HiOutlineDocumentText className="w-4 h-4 text-yellow-600" />
                    </div>
                  </td>
                  <td className="p-3">
                    <p className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>{task.title}</p>
                    <p className="text-xs text-gray-500">
                      Status: <span className="text-blue-600">{task.status}</span> | Priority:{' '}
                      <span className={task.priority === 'High' ? 'text-red-600' : 'text-gray-600'}>{task.priority}</span>
                    </p>
                  </td>
                  <td className="p-3">{task.module || 'General'}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleStatus(task.id, task.status)}
                        className="text-blue-500 hover:underline text-xs"
                      >
                        {task.status === 'completed' ? 'Reopen' : 'Complete'}
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 5: Reminders ─────────────────────────────────────────────────────────

function RemindersTab() {
  const navigate                              = useNavigate();
  const [reminders, setReminders]             = useState([]);
  const [smart, setSmart]                     = useState([]);
  const [showAddForm, setShowAddForm]         = useState(false);
  const [newReminder, setNewReminder]         = useState({ title: '', reminderDatetime: '' });
  const [loading, setLoading]                 = useState(true);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [remRes, smRes] = await Promise.allSettled([
        api.get('/helpdesk/reminders'),
        api.get('/helpdesk/reminders/smart'),
      ]);
      const rem = remRes.status === 'fulfilled' ? (extractData(remRes.value) ?? []) : [];
      const sm  = smRes.status  === 'fulfilled' ? (extractData(smRes.value)  ?? []) : [];
      setReminders(Array.isArray(rem) ? rem : []);
      setSmart(Array.isArray(sm) ? sm : []);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReminder = async (e) => {
    e.preventDefault();
    if (!newReminder.title.trim() || !newReminder.reminderDatetime) return;
    try {
      await api.post('/helpdesk/reminders', { title: newReminder.title, reminder_datetime: newReminder.reminderDatetime });
      setNewReminder({ title: '', reminderDatetime: '' });
      setShowAddForm(false);
      loadAll();
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
  };

  const handleDeleteReminder = async (id) => {
    try {
      await api.delete(`/helpdesk/reminders/${id}`);
      loadAll();
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    }
  };

  const handleDismissSmart = async (key) => {
    setSmart(prev => prev.filter(s => s.key !== key));
    try {
      await api.patch(`/helpdesk/reminders/smart/${key}/dismiss`);
    } catch (err) {
      console.error('Failed to dismiss reminder:', err);
      loadAll();
    }
  };

  const fmtDateTime = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleString();
  };

  if (loading) return <Spinner />;

  const isEmpty = smart.length === 0 && reminders.length === 0;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Reminders</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded text-sm"
        >
          <HiOutlinePlus className="w-4 h-4" /> Add Reminder
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-lg border p-4 mb-4">
          <form onSubmit={handleAddReminder} className="space-y-3">
            <input
              type="text"
              value={newReminder.title}
              onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
              placeholder="Reminder title"
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <input
              type="datetime-local"
              value={newReminder.reminderDatetime}
              onChange={(e) => setNewReminder({ ...newReminder, reminderDatetime: e.target.value })}
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-[#2196f3] text-white rounded text-sm">Add</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isEmpty ? (
        <div className="bg-white rounded-lg border p-12 text-center">
          <HiOutlineBell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No reminders — overdue or newly-assigned tickets will appear here automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {smart.map((s) => {
            const overdue = s.type === 'overdue';
            return (
              <div
                key={s.key}
                className={`rounded-lg border p-4 flex items-center justify-between ${overdue ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}
              >
                <button
                  onClick={() => navigate(`/helpdesk/tickets/${s.id}`)}
                  className="flex items-center gap-3 text-left min-w-0 flex-1"
                >
                  <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${overdue ? 'bg-red-100' : 'bg-blue-100'}`}>
                    {overdue
                      ? <HiOutlineClock className="w-5 h-5 text-red-600" />
                      : <HiOutlineBell className="w-5 h-5 text-blue-600" />
                    }
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{overdue ? 'Overdue: ' : 'Assigned: '}{s.ticket_id} · {s.subject}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {overdue ? `Due ${fmtDateTime(s.due_date)} — missed` : 'New ticket assigned to you'} · {s.priority} · {s.requester_name || '—'}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => handleDismissSmart(s.key)}
                  title="Dismiss"
                  className="shrink-0 ml-2 p-2 hover:bg-white/60 rounded text-gray-400 hover:text-gray-700"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          {reminders.map((reminder) => (
            <div key={reminder.id} className="bg-white rounded-lg border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <HiOutlineBell className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-medium">{reminder.title}</p>
                  <p className="text-sm text-gray-500">{fmtDateTime(reminder.reminder_datetime)}</p>
                </div>
              </div>
              <button
                onClick={() => handleDeleteReminder(reminder.id)}
                title="Remove"
                className="p-2 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
              >
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 6: Announcements ─────────────────────────────────────────────────────

function AnnouncementsTab() {
  const { user }    = useSelector(s => s.auth);
  const canManage   = ADMIN_ROLES.includes(user?.role);

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [form, setForm] = useState({ title: '', body: '', expiresAt: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await getAnnouncementsApi();
      const data = extractData(res);
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { toast.error('Title and body are required'); return; }
    setSubmitting(true);
    try {
      await createAnnouncementApi({
        title: form.title.trim(),
        body:  form.body.trim(),
        ...(form.expiresAt ? { expires_at: form.expiresAt } : {}),
      });
      toast.success('Announcement posted');
      setForm({ title: '', body: '', expiresAt: '' });
      setShowForm(false);
      load();
    } catch {
      toast.error('Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await deleteAnnouncementApi(id);
      toast.success('Announcement deleted');
      load();
    } catch {
      toast.error('Failed to delete announcement');
    }
  };

  const now     = new Date();
  const active  = announcements.filter(a => !a.expires_at || new Date(a.expires_at) >= now);
  const expired = announcements.filter(a =>  a.expires_at && new Date(a.expires_at) <  now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Announcements</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '…' : `${active.length} active · ${expired.length} expired`}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(s => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" /> New Announcement
          </button>
        )}
      </div>

      {canManage && showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">New Announcement</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Announcement title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body <span className="text-red-500">*</span></label>
              <textarea
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Announcement details…"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expires At <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? 'Posting…' : 'Post'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm({ title: '', body: '', expiresAt: '' }); }}
                className="px-5 py-2 border border-gray-300 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? <Spinner /> : (
        <>
          {active.length === 0 && expired.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <HiOutlineSpeakerphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No announcements yet.</p>
              {canManage && (
                <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-blue-600 hover:underline">
                  Create the first announcement
                </button>
              )}
            </div>
          ) : (
            <>
              {active.length > 0 && (
                <div className="space-y-3">
                  {active.map(a => <AnnouncementCard key={a.id} ann={a} canManage={canManage} onDelete={handleDelete} />)}
                </div>
              )}
              {expired.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mt-6 mb-2">Expired</h3>
                  <div className="space-y-3 opacity-60">
                    {expired.map(a => <AnnouncementCard key={a.id} ann={a} canManage={canManage} onDelete={handleDelete} expired />)}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AnnouncementCard({ ann, canManage, onDelete, expired = false }) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${expired ? 'border-gray-200' : 'border-blue-100 shadow-sm'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <HiOutlineSpeakerphone className={`w-4 h-4 flex-shrink-0 ${expired ? 'text-gray-400' : 'text-blue-500'}`} />
            <h4 className="font-semibold text-gray-900 truncate">{ann.title}</h4>
            {expired && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-medium">Expired</span>}
          </div>
          <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{ann.body ?? ann.content}</p>
          <div className="flex gap-4 mt-3 text-xs text-gray-400">
            <span>Posted {fmtDate(ann.created_at)}</span>
            {ann.expires_at && <span>Expires {fmtDate(ann.expires_at)}</span>}
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => onDelete(ann.id)}
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete announcement"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function HdDashboard() {
  const navigate                            = useNavigate();
  const [activeTab, setActiveTab]           = useState('dashboard');
  const [loadedTabs, setLoadedTabs]         = useState(new Set(['dashboard']));

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setLoadedTabs(prev => new Set([...prev, tabId]));
  };

  return (
    <div className="h-full flex flex-col text-[13px]">
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-4 py-2.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-indigo-600 border-indigo-600 bg-indigo-50/60'
                  : 'text-slate-600 border-transparent hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto bg-[#f5f5f5] p-6">
        <div className={activeTab === 'dashboard'    ? '' : 'hidden'}>{loadedTabs.has('dashboard')    && <DashboardTab />}</div>
        <div className={activeTab === 'scheduler'    ? '' : 'hidden'}>{loadedTabs.has('scheduler')    && <SchedulerTab />}</div>
        <div className={activeTab === 'availability' ? '' : 'hidden'}>{loadedTabs.has('availability') && <AvailabilityTab />}</div>
        <div className={activeTab === 'tasks'        ? '' : 'hidden'}>{loadedTabs.has('tasks')        && <TasksTab />}</div>
        <div className={activeTab === 'reminders'    ? '' : 'hidden'}>{loadedTabs.has('reminders')    && <RemindersTab />}</div>
        <div className={activeTab === 'announcements'? '' : 'hidden'}>{loadedTabs.has('announcements')&& <AnnouncementsTab />}</div>
      </div>
    </div>
  );
}
