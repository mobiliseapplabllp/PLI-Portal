import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { upsertTodayLogApi, getDailyLogsApi } from '../../api/pm/dailyLogs.api';
import { getProjectByIdApi } from '../../api/pm/projects.api';
import { HiOutlineArrowLeft, HiOutlineClock, HiOutlineClipboardList } from 'react-icons/hi';

const STATUS_OPTIONS = ['on_track', 'at_risk', 'delayed', 'completed'];
const STATUS_COLORS = {
  on_track: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-yellow-100 text-yellow-700',
  delayed: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
};

const EMPTY_FORM = { overallStatus: 'on_track', completedTasks: '', ongoingTasks: '', blockers: '', upcomingWork: '', notes: '' };

export default function DailyLogForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [todayExists, setTodayExists] = useState(false);

  useEffect(() => {
    getProjectByIdApi(id).then(r => setProject(r.data.data)).catch(() => {});
    // Check if today's log exists
    const today = new Date().toISOString().slice(0, 10);
    getDailyLogsApi(id, { limit: 5 }).then(r => {
      const logs = r.data?.data || [];
      const todayLog = logs.find(l => l.reportDate === today);
      if (todayLog) {
        setForm({
          overallStatus: todayLog.overallStatus || 'on_track',
          completedTasks: todayLog.completedTasks || '',
          ongoingTasks: todayLog.ongoingTasks || '',
          blockers: todayLog.blockers || '',
          upcomingWork: todayLog.upcomingWork || '',
          notes: todayLog.notes || '',
        });
        setTodayExists(true);
      }
    }).catch(() => {});
  }, [id]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await upsertTodayLogApi(id, form);
      toast.success(todayExists ? "Today's log updated" : "Today's log submitted");
      navigate(`/pm/projects/${id}/daily-logs`);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save log');
    } finally { setSaving(false); }
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const inputClass = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const areaClass = `${inputClass} resize-none`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/pm/projects/${id}`)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Status Report</h1>
          <p className="text-sm text-gray-500">{project?.name} · {today}</p>
        </div>
      </div>

      {todayExists && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          <HiOutlineClock className="w-4 h-4 flex-shrink-0" />
          Today's log already exists — you are editing it.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Overall Status *</label>
          <div className="flex gap-3 flex-wrap">
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => set('overallStatus', s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border-2 transition-all capitalize
                  ${form.overallStatus === s
                    ? `${STATUS_COLORS[s]} border-current`
                    : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'}`}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <HiOutlineClipboardList className="inline w-4 h-4 mr-1 text-emerald-600" />
            Completed Today
          </label>
          <textarea value={form.completedTasks} onChange={e => set('completedTasks', e.target.value)} rows={3} className={areaClass} placeholder="What was accomplished today?" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ongoing Tasks</label>
          <textarea value={form.ongoingTasks} onChange={e => set('ongoingTasks', e.target.value)} rows={3} className={areaClass} placeholder="What is currently in progress?" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="text-red-500 mr-1">⚠</span>Blockers / Issues / Risks
          </label>
          <textarea value={form.blockers} onChange={e => set('blockers', e.target.value)} rows={3} className={areaClass} placeholder="Any blockers, issues, or risks to report?" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Upcoming Work</label>
          <textarea value={form.upcomingWork} onChange={e => set('upcomingWork', e.target.value)} rows={3} className={areaClass} placeholder="What is planned for the next session?" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={areaClass} placeholder="Any other remarks..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(`/pm/projects/${id}`)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : todayExists ? 'Update Log' : 'Submit Log'}
          </button>
        </div>
      </form>
    </div>
  );
}
