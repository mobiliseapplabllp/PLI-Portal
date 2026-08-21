import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar, HiOutlineUserGroup, HiOutlineSwitchHorizontal, HiOutlineGift,
  HiOutlineChartBar, HiOutlineRefresh, HiOutlineArrowRight, HiOutlineExclamation,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getRosterDashboardApi } from '../../api/roster.api';

const fmtSat = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });

const fmtShort = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
  });

function ActionCard({ icon: Icon, title, hint, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card text-left hover:border-primary-300 hover:shadow-md transition group w-full"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-800">{title}</p>
            {badge > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{badge}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        </div>
        <HiOutlineArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary-500 shrink-0 mt-1" />
      </div>
    </button>
  );
}

export default function RosterDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRosterDashboardApi();
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load roster dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!data) return null;

  const { me, team, canManage, saturdayDate, pendingSwaps } = data;
  const upcoming = me?.upcoming;
  const notApplicable = me?.rosterApplicable === false;

  return (
    <div>
      <PageHeader
        title="Rostering"
        subtitle={`Alternate-Saturday planning · next Saturday is ${fmtSat(saturdayDate)}`}
        actions={
          <button className="btn-secondary flex items-center gap-1" onClick={load}>
            <HiOutlineRefresh className="w-4 h-4" /> Refresh
          </button>
        }
      />

      {/* My Saturday */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card md:col-span-2">
          <div className="text-xs uppercase text-gray-400 font-semibold mb-2">My upcoming Saturday</div>
          {notApplicable ? (
            <p className="text-sm text-gray-500">
              Saturday rostering is not applicable to you. Contact HR if that looks wrong.
            </p>
          ) : upcoming ? (
            <>
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block px-4 py-1.5 rounded-lg text-sm font-bold ${
                    upcoming.finalStatus === 'working' ? 'bg-emerald-600 text-white' : 'bg-gray-500 text-white'
                  }`}
                >
                  {upcoming.finalStatus === 'working' ? 'WORKING' : 'OFF'}
                </span>
                <span className="text-gray-700 font-medium">{fmtSat(upcoming.week.saturdayDate)}</span>
              </div>
              {upcoming.plannedStatus !== upcoming.finalStatus && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <HiOutlineExclamation className="w-3.5 h-3.5" />
                  Changed as per company work requirement
                  {upcoming.changeReason ? ` — ${upcoming.changeReason}` : ''}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">
              Your roster for the upcoming Saturday hasn’t been published yet.
            </p>
          )}

          {!!me?.history?.length && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-2">Recent Saturdays</p>
              <div className="flex flex-wrap gap-2">
                {me.history.slice(0, 6).map((h) => (
                  <span
                    key={h._id || h.id}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      h.finalStatus === 'working' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {fmtShort(h.week?.saturdayDate)} · {h.finalStatus === 'working' ? 'W' : 'Off'}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <StatCard
          title="Comp-Off Balance"
          value={me?.compOffBalance ?? 0}
          subtitle={`Worked ${me?.stats?.workedCount ?? 0} of last ${me?.stats?.recentSaturdays ?? 0} Saturdays`}
          color="purple"
          icon={HiOutlineGift}
        />
      </div>

      {/* Team picture — roster managers only */}
      {canManage && team && (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {team.label} · my team
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Rostered" value={team.total} icon={HiOutlineUserGroup} color="primary" />
            <StatCard title="Working" value={team.working} color="green" />
            <StatCard title="Off" value={team.off} color="yellow" />
            <StatCard
              title={team.unpublished > 0 ? 'Awaiting Publish' : 'Published'}
              value={team.unpublished > 0 ? team.unpublished : team.published}
              color={team.unpublished > 0 ? 'red' : 'green'}
              subtitle={team.changed > 0 ? `${team.changed} changed after publish` : undefined}
            />
          </div>

          {team.unpublished > 0 && (
            <div className="card mb-6 bg-amber-50 border-amber-200 flex items-center justify-between gap-4">
              <p className="text-sm text-amber-800">
                <strong>{team.unpublished}</strong> roster entr{team.unpublished === 1 ? 'y is' : 'ies are'} still in
                draft for {fmtSat(saturdayDate)}. Employees are only notified once you publish.
              </p>
              <button className="btn-primary shrink-0" onClick={() => navigate('/roster/board')}>
                Open Roster Board
              </button>
            </div>
          )}
        </>
      )}

      {/* Quick actions */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick actions</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ActionCard
          icon={HiOutlineCalendar}
          title="My Saturdays"
          hint="Your status, history and swaps"
          onClick={() => navigate('/roster/my')}
        />
        {canManage && (
          <>
            <ActionCard
              icon={HiOutlineUserGroup}
              title="Saturday Roster"
              hint="Plan, change and publish"
              badge={team?.unpublished}
              onClick={() => navigate('/roster/board')}
            />
            <ActionCard
              icon={HiOutlineSwitchHorizontal}
              title="Swaps & Comp-Offs"
              hint="Approve requests, track comp-offs"
              badge={pendingSwaps}
              onClick={() => navigate('/roster/swaps')}
            />
            <ActionCard
              icon={HiOutlineChartBar}
              title="Coverage"
              hint="Headcount and fairness"
              onClick={() => navigate('/roster/coverage')}
            />
          </>
        )}
        {!canManage && pendingSwaps > 0 && (
          <ActionCard
            icon={HiOutlineSwitchHorizontal}
            title="Swap Requests"
            hint="A colleague is waiting on you"
            badge={pendingSwaps}
            onClick={() => navigate('/roster/my')}
          />
        )}
      </div>
    </div>
  );
}
