import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getMilestonesApi } from '../../api/pm/milestones.api';
import { getProjectByIdApi } from '../../api/pm/projects.api';
import { HiOutlineArrowLeft, HiOutlineTable } from 'react-icons/hi';

const STATUS_COLORS = {
  not_started: '#9ca3af',
  in_progress: '#3b82f6',
  completed: '#10b981',
  delayed: '#ef4444',
  on_hold: '#f59e0b',
  cancelled: '#d1d5db',
};

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function GanttView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const chartRef = useRef(null);

  useEffect(() => {
    Promise.all([getProjectByIdApi(id), getMilestonesApi(id)])
      .then(([pRes, mRes]) => {
        setProject(pRes.data.data);
        setMilestones(mRes.data.data || []);
      })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading Gantt chart...</div>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Determine chart date range
  const datesWithData = milestones.filter(m => m.startDate || m.endDate);
  if (datesWithData.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gantt Chart</h1>
            <p className="text-sm text-gray-500">{project?.name}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          No milestones with dates to display. Add start/end dates to milestones first.
        </div>
      </div>
    );
  }

  const allDates = milestones.flatMap(m => [m.startDate, m.endDate].filter(Boolean)).map(d => new Date(d));
  let chartStart = new Date(Math.min(...allDates));
  let chartEnd = new Date(Math.max(...allDates));
  // Add padding
  chartStart = addDays(chartStart, -3);
  chartEnd = addDays(chartEnd, 7);

  const totalDays = daysBetween(chartStart, chartEnd) + 1;
  const DAY_WIDTH = 28; // px per day
  const ROW_HEIGHT = 52;
  const LABEL_WIDTH = 200;
  const chartWidth = totalDays * DAY_WIDTH;

  // Build month headers
  const monthHeaders = [];
  let d = new Date(chartStart);
  while (d <= chartEnd) {
    const m = d.getMonth();
    const y = d.getFullYear();
    const monthStart = Math.max(0, daysBetween(chartStart, new Date(y, m, 1)));
    const monthEnd = Math.min(totalDays - 1, daysBetween(chartStart, new Date(y, m + 1, 0)));
    if (monthStart <= monthEnd) {
      const key = `${y}-${m}`;
      if (!monthHeaders.find(h => h.key === key)) {
        monthHeaders.push({ key, label: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }), start: monthStart, end: monthEnd });
      }
    }
    d.setMonth(d.getMonth() + 1);
  }

  // Build day headers (every 7 days)
  const weekMarkers = [];
  for (let i = 0; i < totalDays; i += 7) {
    const date = addDays(chartStart, i);
    weekMarkers.push({ offset: i, label: formatDateLabel(date) });
  }

  const todayOffset = daysBetween(chartStart, today);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/pm/projects/${id}/milestones`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Gantt Chart</h1>
          <p className="text-sm text-gray-500">{project?.name}</p>
        </div>
        <button
          onClick={() => navigate(`/pm/projects/${id}/milestones`)}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          <HiOutlineTable className="w-4 h-4" /> Table View
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl border border-gray-200 px-5 py-3">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
            {status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-0.5 h-4 bg-red-500 flex-shrink-0" />
          Today
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto" ref={chartRef}>
          <div style={{ minWidth: LABEL_WIDTH + chartWidth + 32 }}>

            {/* Header row */}
            <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
              <div style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }} className="px-4 py-2 text-xs font-semibold text-gray-600 border-r border-gray-200 flex-shrink-0">
                Milestone
              </div>
              <div className="relative overflow-hidden flex-1">
                {/* Month headers */}
                <div className="flex h-6 border-b border-gray-100">
                  {monthHeaders.map(mh => (
                    <div
                      key={mh.key}
                      style={{ width: (mh.end - mh.start + 1) * DAY_WIDTH, minWidth: (mh.end - mh.start + 1) * DAY_WIDTH }}
                      className="border-r border-gray-200 px-2 text-xs font-semibold text-gray-700 flex items-center overflow-hidden flex-shrink-0"
                    >
                      {mh.label}
                    </div>
                  ))}
                </div>
                {/* Week markers */}
                <div className="flex h-5 relative">
                  <div style={{ width: chartWidth, position: 'relative' }}>
                    {weekMarkers.map(wm => (
                      <div
                        key={wm.offset}
                        style={{ position: 'absolute', left: wm.offset * DAY_WIDTH, top: 0 }}
                        className="text-[10px] text-gray-400 px-0.5 border-r border-gray-100 h-full flex items-center"
                      >
                        {wm.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Milestone rows */}
            {milestones.map((m, rowIdx) => {
              const today2 = new Date().toISOString().slice(0, 10);
              const isDelayed = m.endDate && m.endDate < today2 && m.status !== 'completed';
              const color = isDelayed ? STATUS_COLORS.delayed : STATUS_COLORS[m.status] || STATUS_COLORS.not_started;

              const barStart = m.startDate ? Math.max(0, daysBetween(chartStart, new Date(m.startDate))) : null;
              const barEnd = m.endDate ? Math.min(totalDays - 1, daysBetween(chartStart, new Date(m.endDate))) : barStart;
              const barWidth = barStart !== null ? Math.max(1, (barEnd - barStart + 1)) * DAY_WIDTH : 0;

              return (
                <div key={m._id || m.id} className={`flex border-b border-gray-50 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`} style={{ height: ROW_HEIGHT }}>
                  {/* Label */}
                  <div style={{ width: LABEL_WIDTH, minWidth: LABEL_WIDTH }} className="px-4 border-r border-gray-200 flex-shrink-0 flex flex-col justify-center">
                    <p className="text-xs font-medium text-gray-800 truncate">{m.name}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{m.accountableUser?.name || '—'}</p>
                  </div>

                  {/* Bar area */}
                  <div className="relative flex-1" style={{ width: chartWidth }}>
                    {/* Today line */}
                    {todayOffset >= 0 && todayOffset <= totalDays && (
                      <div
                        style={{ position: 'absolute', left: todayOffset * DAY_WIDTH, top: 0, bottom: 0, width: 2, backgroundColor: '#ef4444', zIndex: 5, opacity: 0.7 }}
                      />
                    )}

                    {/* Grid lines */}
                    {weekMarkers.map(wm => (
                      <div key={wm.offset} style={{ position: 'absolute', left: wm.offset * DAY_WIDTH, top: 0, bottom: 0, width: 1, backgroundColor: '#f3f4f6' }} />
                    ))}

                    {/* Milestone bar */}
                    {barStart !== null && (
                      <div
                        style={{
                          position: 'absolute',
                          left: barStart * DAY_WIDTH,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: barWidth,
                          height: 24,
                          backgroundColor: color,
                          borderRadius: 4,
                          cursor: 'pointer',
                          zIndex: 2,
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 6,
                          overflow: 'hidden',
                        }}
                        onMouseEnter={(e) => setTooltip({ m, x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {/* Progress fill */}
                        <div
                          style={{
                            position: 'absolute',
                            left: 0, top: 0, bottom: 0,
                            width: `${m.completionPercentage || 0}%`,
                            backgroundColor: 'rgba(0,0,0,0.15)',
                            borderRadius: 4,
                          }}
                        />
                        {barWidth > 60 && (
                          <span style={{ fontSize: 10, color: 'white', fontWeight: 600, position: 'relative', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: barWidth - 12 }}>
                            {m.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10, zIndex: 100 }}
            className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none max-w-xs"
          >
            <p className="font-semibold">{tooltip.m.name}</p>
            <p className="mt-0.5 text-gray-300 capitalize">{tooltip.m.status?.replace(/_/g, ' ')}</p>
            <p className="text-gray-300">Progress: {tooltip.m.completionPercentage || 0}%</p>
            {tooltip.m.startDate && <p className="text-gray-300">Start: {new Date(tooltip.m.startDate).toLocaleDateString('en-IN')}</p>}
            {tooltip.m.endDate && <p className="text-gray-300">Due: {new Date(tooltip.m.endDate).toLocaleDateString('en-IN')}</p>}
            {tooltip.m.accountableUser && <p className="text-gray-300">By: {tooltip.m.accountableUser.name}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
