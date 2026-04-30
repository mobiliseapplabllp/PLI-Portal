import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineCheckCircle,
  HiOutlinePencilAlt,
  HiOutlineExclamation,
  HiOutlineClipboardList,
  HiOutlineRefresh,
} from 'react-icons/hi';
import { getKpiPlansApi } from '../../api/kpiPlan.api';
import { getCurrentFinancialYear, MONTHS, QUARTER_MONTHS } from '../../utils/constants';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

export default function HrAdminDashboard() {
  const navigate = useNavigate();
  const [fy, setFy] = useState(getCurrentFinancialYear());
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPlans();
  }, [fy]);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getKpiPlansApi({ financialYear: fy, limit: 200 });
      setPlans(res.data.data?.plans || res.data.data || []);
    } catch {
      setError('Failed to load KPI plans.');
    } finally {
      setLoading(false);
    }
  };

  const published = plans.filter((p) => p.isPublished).length;
  const drafts = plans.filter((p) => !p.isPublished).length;
  const totalMonths = 12;
  const coveredMonths = new Set(plans.filter((p) => p.isPublished).map((p) => p.month)).size;
  const missingMonths = totalMonths - coveredMonths;

  // Build coverage grid: months × scopes
  const getCellStatus = (month) => {
    const monthPlans = plans.filter((p) => p.month === month);
    if (monthPlans.some((p) => p.isPublished)) return 'published';
    if (monthPlans.length > 0) return 'draft';
    return 'missing';
  };

  const cellColor = {
    published: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-100 text-amber-700 border-amber-200',
    missing: 'bg-red-50 text-red-400 border-red-200',
  };

  const cellLabel = {
    published: '✓',
    draft: '~',
    missing: '—',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-violet-700 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">KPI Administration</h1>
            <p className="text-violet-200 mt-1">Manage KPIs for all teams and departments</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="bg-white/20 text-white border border-white/30 rounded-lg px-3 py-1.5 text-sm"
            >
              {['2024-25', '2025-26', '2026-27'].map((y) => (
                <option key={y} value={y} className="text-gray-800">{y}</option>
              ))}
            </select>
            <button onClick={fetchPlans} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              <HiOutlineRefresh className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Plans Published"
          value={published}
          icon={HiOutlineCheckCircle}
          color="green"
          subtitle="This financial year"
        />
        <StatCard
          title="Plans in Draft"
          value={drafts}
          icon={HiOutlinePencilAlt}
          color="yellow"
          subtitle="Not yet published"
        />
        <StatCard
          title="Months Without Plan"
          value={missingMonths}
          icon={HiOutlineExclamation}
          color="red"
          subtitle="Out of 12 months"
          onClick={() => navigate('/hr-admin/kpi-plans')}
          clickable
        />
        <StatCard
          title="Total KPI Items"
          value={plans.reduce((s, p) => s + (p.items?.length || 0), 0)}
          icon={HiOutlineClipboardList}
          color="blue"
          subtitle="Across all plans"
        />
      </div>

      {/* Coverage Grid */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Plan Coverage — {fy}</h2>
          <button
            onClick={() => navigate('/hr-admin/kpi-plans')}
            className="btn-primary text-xs px-3 py-1.5"
          >
            + Create KPI
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : error ? (
          <div className="text-center py-8 text-red-500">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 text-gray-500 font-medium border border-gray-200 w-24">Quarter</th>
                  {MONTHS.map((m) => (
                    <th key={m.value} className="px-2 py-2 text-center text-gray-500 font-medium border border-gray-200 min-w-[60px]">
                      {m.label.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {QUARTERS.map((q) => (
                  <tr key={q}>
                    <td className="px-3 py-2 font-semibold text-gray-600 border border-gray-200 bg-gray-50">{q}</td>
                    {MONTHS.map((m) => {
                      const qMonths = QUARTER_MONTHS[q];
                      if (!qMonths.includes(m.value)) {
                        return <td key={m.value} className="border border-gray-100 bg-gray-50" />;
                      }
                      const status = getCellStatus(m.value);
                      return (
                        <td key={m.value} className="border border-gray-200 p-1 text-center">
                          <button
                            onClick={() => navigate('/hr-admin/kpi-plans')}
                            className={`w-full h-8 rounded text-xs font-semibold border transition-all hover:opacity-80 ${cellColor[status]}`}
                            title={`${m.label}: ${status}`}
                          >
                            {cellLabel[status]}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200 inline-block" /> Published</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200 inline-block" /> Draft</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Missing</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
