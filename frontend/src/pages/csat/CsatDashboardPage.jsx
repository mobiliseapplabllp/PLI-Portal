import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePaperAirplane, HiOutlineChartBar, HiOutlineOfficeBuilding,
  HiOutlineClock, HiOutlineUsers, HiOutlineCheckCircle, HiOutlineArrowRight,
} from 'react-icons/hi';
import { getDashboardApi } from '../../api/csat.api';

function CsatRing({ percent }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const valid = typeof percent === 'number' && !isNaN(percent);
  const filled = valid ? (percent / 100) * circ : 0;
  const color = !valid ? '#D1FAE5' : percent >= 75 ? '#059669' : percent >= 50 ? '#D97706' : '#DC2626';
  const textColor = !valid ? '#6B7280' : percent >= 75 ? '#065F46' : percent >= 50 ? '#92400E' : '#991B1B';

  return (
    <div className="flex flex-col items-center">
      <svg width="132" height="132" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r={r} fill="none" stroke="#F0FDF4" strokeWidth="12" />
        <circle
          cx="66" cy="66" r={r} fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 66 66)"
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
        <text x="66" y="60" textAnchor="middle" fontSize="26" fontWeight="700" fill={valid ? '#111827' : '#9CA3AF'}>
          {valid ? `${percent}%` : '—'}
        </text>
        <text x="66" y="80" textAnchor="middle" fontSize="11" fill="#6B7280">
          CSAT Score
        </text>
      </svg>
      <p className="text-xs font-medium mt-1" style={{ color: textColor }}>
        {!valid ? 'No data yet' : percent >= 75 ? 'Excellent' : percent >= 50 ? 'Needs improvement' : 'Below target'}
      </p>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, accent }) {
  const styles = {
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-600',   val: 'text-blue-700' },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-600',  val: 'text-amber-700' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', val: 'text-violet-700' },
    slate:  { bg: 'bg-slate-50',  text: 'text-slate-500',  val: 'text-slate-700' },
  };
  const s = styles[accent] || styles.slate;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-start gap-4 hover:shadow-sm transition-shadow">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
        <Icon className={`w-5 h-5 ${s.text}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${s.val}`}>
          {value !== null && value !== undefined ? value : '—'}
        </p>
        <p className="text-sm font-medium text-gray-700 leading-snug">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ActionCard({ to, icon: Icon, label, desc, color }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-emerald-300 hover:shadow-sm transition-all text-left w-full group"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <HiOutlineArrowRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
    </button>
  );
}

function SkeletonRing() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-32 h-32 rounded-full bg-gray-100 animate-pulse" />
      <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}

export default function CsatDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardApi()
      .then((res) => setStats(res.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-8 max-w-6xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Client Surveys</h1>
        <p className="text-sm text-gray-500 mt-1">CSAT overview — satisfaction scores and response rates</p>
      </div>

      {/* Hero section: CSAT ring + KPI cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-center">
        {/* CSAT Ring */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center lg:col-span-1 hover:shadow-sm transition-shadow min-h-[180px]">
          {loading ? <SkeletonRing /> : <CsatRing percent={stats?.overallCsatPercent} />}
        </div>

        {/* KPI cards 3-col */}
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
            ))
          ) : (
            <>
              <KpiCard
                label="Response Rate"
                value={stats?.overallResponseRate !== undefined ? `${stats.overallResponseRate}%` : '—'}
                sub={`${stats?.totalSubmitted || 0} of ${stats?.totalRecipients || 0} submitted`}
                icon={HiOutlineChartBar}
                accent="blue"
              />
              <KpiCard
                label="Active Dispatches"
                value={stats?.totalDispatches}
                sub="Sent & currently open"
                icon={HiOutlineUsers}
                accent="violet"
              />
              <KpiCard
                label="Pending Scheduled"
                value={stats?.pendingScheduled}
                sub="Queued for future send"
                icon={HiOutlineClock}
                accent="amber"
              />
            </>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ActionCard
            to="/csat/send"
            icon={HiOutlinePaperAirplane}
            label="Send Survey"
            desc="Dispatch a published survey to clients"
            color="bg-emerald-50 text-emerald-600"
          />
          <ActionCard
            to="/csat/responses"
            icon={HiOutlineChartBar}
            label="View Responses"
            desc="Analytics, CSAT scores, and exports"
            color="bg-blue-50 text-blue-600"
          />
          <ActionCard
            to="/csat/client-organisations"
            icon={HiOutlineOfficeBuilding}
            label="Client Organisations"
            desc="Manage client orgs and employees"
            color="bg-violet-50 text-violet-600"
          />
        </div>
      </div>

      {/* Empty state */}
      {!loading && stats?.totalDispatches === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
            <HiOutlineCheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-emerald-800">No surveys sent yet</p>
          <p className="text-xs text-emerald-600">
            Build a survey, add client employees, then send your first dispatch.
          </p>
        </div>
      )}
    </div>
  );
}
