import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineChartBar, HiOutlineRefresh } from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getRosterCoverageApi } from '../../api/roster.api';

const fmtSat = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

const upcomingSaturdays = () => {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  // 2 past + current + 4 future Saturdays
  d.setDate(d.getDate() - 14);
  for (let i = 0; i < 7; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return out;
};

const GroupBars = ({ title, groups }) => {
  const entries = Object.entries(groups || {});
  if (!entries.length) return null;
  return (
    <div className="card">
      <h3 className="font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2.5">
        {entries.map(([name, g]) => {
          const total = (g.working || 0) + (g.off || 0);
          const pct = total ? Math.round(((g.working || 0) / total) * 100) : 0;
          return (
            <div key={name}>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span className="font-medium text-gray-700">{name}</span>
                <span>{g.working || 0} working / {g.off || 0} off</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function RosterCoverage() {
  const saturdays = useMemo(upcomingSaturdays, []);
  const [date, setDate] = useState(saturdays[2]); // current/upcoming Saturday
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d) => {
    setLoading(true);
    try {
      const res = await getRosterCoverageApi({ date: d });
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load coverage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  return (
    <div>
      <PageHeader
        title="Roster Coverage"
        subtitle="Saturday headcount, department coverage and fairness"
        actions={
          <button className="btn-secondary flex items-center gap-1" onClick={() => load(date)}>
            <HiOutlineRefresh className="w-4 h-4" /> Refresh
          </button>
        }
      />

      <div className="card mb-4 flex items-end gap-4">
        <div>
          <label className="label-text">Saturday</label>
          <select className="input-field w-56" value={date} onChange={(e) => setDate(e.target.value)}>
            {saturdays.map((d) => (
              <option key={d} value={d}>{fmtSat(d)}</option>
            ))}
          </select>
        </div>
        {data && !data.week && (
          <p className="text-sm text-amber-600 pb-2.5">No roster has been created for this Saturday yet.</p>
        )}
      </div>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Rostered" value={data.stats.total} icon={HiOutlineChartBar} color="primary" />
            <StatCard title="Working" value={data.stats.working} color="green" subtitle={fmtSat(data.saturdayDate)} />
            <StatCard title="Off" value={data.stats.off} color="yellow" />
            <StatCard title="Published" value={data.stats.published} color="purple" subtitle={`of ${data.stats.total}`} />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <GroupBars title="Coverage by Department" groups={data.byDepartment} />
            <GroupBars title="Coverage by Manager" groups={data.byManager} />
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-1">Fairness — last 8 Saturdays</h3>
            <p className="text-xs text-gray-400 mb-3">
              Saturdays worked vs off per employee (published rosters only). Large imbalances suggest the alternation drifted.
            </p>
            {!data.fairness?.length ? (
              <p className="text-sm text-gray-400 italic">No published roster history in the last 8 weeks.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-400">
                      <th className="py-2 pr-4">Employee</th>
                      <th className="py-2 pr-4 text-center">Worked</th>
                      <th className="py-2 pr-4 text-center">Off</th>
                      <th className="py-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.fairness.map((f) => {
                      const total = f.worked + f.off;
                      const skewed = total >= 3 && (f.worked === 0 || f.off === 0 || Math.abs(f.worked - f.off) > 2);
                      return (
                        <tr key={f.employeeId} className={skewed ? 'bg-amber-50/70' : ''}>
                          <td className="py-2 pr-4">
                            <span className="font-medium text-gray-700">{f.name}</span>
                            <span className="text-xs text-gray-400 ml-2">{f.employeeCode}</span>
                          </td>
                          <td className="py-2 pr-4 text-center font-semibold text-emerald-600">{f.worked}</td>
                          <td className="py-2 pr-4 text-center text-gray-500">{f.off}</td>
                          <td className="py-2">
                            <div className="flex h-2 w-40 rounded-full overflow-hidden bg-gray-100">
                              <div className="bg-emerald-500" style={{ width: `${total ? (f.worked / total) * 100 : 0}%` }} />
                            </div>
                            {skewed && <span className="text-[11px] text-amber-600">Imbalanced</span>}
                          </td>
                        </tr>
                      );
                    })}
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
