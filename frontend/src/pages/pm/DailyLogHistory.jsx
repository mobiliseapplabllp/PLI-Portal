import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getDailyLogsApi } from '../../api/pm/dailyLogs.api';
import { getProjectByIdApi } from '../../api/pm/projects.api';
import { HiOutlineArrowLeft, HiOutlinePlus, HiOutlineChevronDown, HiOutlineChevronUp } from 'react-icons/hi';

const STATUS_COLORS = {
  on_track: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-yellow-100 text-yellow-700',
  delayed: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};

export default function DailyLogHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [expanded, setExpanded] = useState({});

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const [pRes, lRes] = await Promise.all([
        getProjectByIdApi(id),
        getDailyLogsApi(id, { page: p, limit: 20 }),
      ]);
      setProject(pRes.data.data);
      setLogs(lRes.data?.data || []);
      setPagination(lRes.data?.pagination || null);
    } catch { toast.error('Failed to load logs'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(page); }, [id, page]);

  const toggle = (logId) => setExpanded(p => ({ ...p, [logId]: !p[logId] }));

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/pm/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Daily Log History</h1>
          <p className="text-sm text-gray-500">{project?.name}</p>
        </div>
        <button
          onClick={() => navigate(`/pm/projects/${id}/daily-log`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          <HiOutlinePlus className="w-4 h-4" /> Update Today's Log
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 font-medium">No daily logs yet</p>
          <button onClick={() => navigate(`/pm/projects/${id}/daily-log`)} className="mt-3 text-sm text-emerald-600 hover:underline">
            Submit today's first log
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggle(log.id)}
                className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {new Date(log.reportDate).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    {log.reportDate === today && <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Today</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {log.generatedBy === 'auto' ? 'Auto-generated' : `By ${log.createdBy?.name || 'Unknown'}`}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[log.overallStatus] || 'bg-gray-100'}`}>
                  {log.overallStatus?.replace(/_/g, ' ')}
                </span>
                <div className="ml-auto">
                  {expanded[log.id] ? <HiOutlineChevronUp className="w-4 h-4 text-gray-400" /> : <HiOutlineChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expanded[log.id] && (
                <div className="px-5 pb-5 border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    ['Completed Today', log.completedTasks, 'text-emerald-600'],
                    ['Ongoing Tasks', log.ongoingTasks, 'text-blue-600'],
                    ['Blockers / Issues', log.blockers, 'text-red-600'],
                    ['Upcoming Work', log.upcomingWork, 'text-orange-600'],
                    ['Notes', log.notes, 'text-gray-600'],
                  ].filter(([, val]) => val).map(([label, val, color]) => (
                    <div key={label}>
                      <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${color}`}>{label}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
              <span className="text-sm text-gray-500">Page {page} of {pagination.pages}</span>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
