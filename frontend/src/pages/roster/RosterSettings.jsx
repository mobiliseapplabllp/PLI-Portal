import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  HiOutlineCog, HiOutlineMail, HiOutlineCalendar, HiOutlineShieldCheck,
  HiOutlineTrash, HiOutlinePlus, HiOutlineUserGroup, HiOutlineRefresh,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import {
  getRosterSettingsApi, updateRosterSettingsApi,
  listHolidaysApi, createHolidayApi, deleteHolidayApi,
  listLeavesApi, createLeaveApi, deleteLeaveApi,
} from '../../api/roster.api';
import { getUsersApi } from '../../api/users.api';
import { formatDate } from '../../utils/formatters';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ADMIN_ROLES = ['admin', 'hr_admin'];

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${
        checked ? 'bg-emerald-600' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function Row({ icon: Icon, title, hint, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-0">
      <div className="flex gap-3 min-w-0">
        {Icon && <Icon className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800">{title}</p>
          {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

export default function RosterSettings() {
  const user = useSelector((s) => s.auth.user);
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const [tab, setTab] = useState('schedule');
  const [settings, setSettings] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [holidayForm, setHolidayForm] = useState({ holidayDate: '', name: '' });
  const [leaveForm, setLeaveForm] = useState({ employeeId: '', fromDate: '', toDate: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h, l] = await Promise.all([
        getRosterSettingsApi(),
        listHolidaysApi(),
        listLeavesApi(),
      ]);
      setSettings(s.data.data);
      setHolidays(h.data.data || []);
      setLeaves(l.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load roster settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getUsersApi({ isActive: 'true', limit: 300 })
      .then((res) => setEmployees(res.data?.data?.users || res.data?.data || []))
      .catch(() => {});
  }, []);

  const patch = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateRosterSettingsApi(settings);
      setSettings(res.data.data);
      toast.success(res.data.message || 'Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const addHoliday = async () => {
    if (!holidayForm.holidayDate || !holidayForm.name.trim()) return toast.error('Date and name are required');
    try {
      await createHolidayApi(holidayForm.holidayDate, holidayForm.name.trim());
      toast.success('Holiday added');
      setHolidayForm({ holidayDate: '', name: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to add holiday');
    }
  };

  const addLeave = async () => {
    if (!leaveForm.employeeId || !leaveForm.fromDate || !leaveForm.toDate) {
      return toast.error('Employee and both dates are required');
    }
    try {
      await createLeaveApi(leaveForm);
      toast.success('Leave recorded');
      setLeaveForm({ employeeId: '', fromDate: '', toDate: '', reason: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to record leave');
    }
  };

  const removeHoliday = async (id) => {
    try { await deleteHolidayApi(id); toast.success('Holiday removed'); load(); }
    catch (err) { toast.error(err.response?.data?.error?.message || 'Failed'); }
  };

  const removeLeave = async (id) => {
    try { await deleteLeaveApi(id); toast.success('Leave removed'); load(); }
    catch (err) { toast.error(err.response?.data?.error?.message || 'Failed'); }
  };

  if (loading || !settings) return <LoadingSpinner size="lg" />;

  const TABS = [
    { key: 'schedule', label: 'Schedule & Rules', icon: HiOutlineCog },
    { key: 'holidays', label: `Holidays (${holidays.length})`, icon: HiOutlineCalendar },
    { key: 'leave', label: `Leave (${leaves.length})`, icon: HiOutlineUserGroup },
  ];

  return (
    <div>
      <PageHeader
        title="Roster Settings"
        subtitle="Mail schedule, working rules, holidays and leave"
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-1" onClick={load}>
              <HiOutlineRefresh className="w-4 h-4" /> Refresh
            </button>
            {tab === 'schedule' && isAdmin && (
              <button className="btn-primary" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            )}
          </div>
        }
      />

      {!isAdmin && (
        <div className="card mb-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          You can view these settings and record leave for your team. Only admin or HR can change the
          schedule and working rules.
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'schedule' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <HiOutlineMail className="w-4 h-4" /> Email schedule
            </h3>
            <p className="text-xs text-gray-400 mb-2">All times are IST. Changes take effect immediately.</p>

            <Row title="Weekly digest" hint="Employees get their status; managers get their team table">
              <Toggle checked={settings.digestEnabled} disabled={!isAdmin} onChange={(v) => patch('digestEnabled', v)} />
            </Row>
            <Row title="Digest day & time">
              <select className="input-field !w-32" disabled={!isAdmin || !settings.digestEnabled}
                value={settings.digestDay} onChange={(e) => patch('digestDay', Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <input type="time" className="input-field !w-28" disabled={!isAdmin || !settings.digestEnabled}
                value={settings.digestTime} onChange={(e) => patch('digestTime', e.target.value)} />
            </Row>

            <Row title="Working-tomorrow reminder" hint="Sent only to those rostered Working">
              <Toggle checked={settings.reminderEnabled} disabled={!isAdmin} onChange={(v) => patch('reminderEnabled', v)} />
            </Row>
            <Row title="Reminder day & time">
              <select className="input-field !w-32" disabled={!isAdmin || !settings.reminderEnabled}
                value={settings.reminderDay} onChange={(e) => patch('reminderDay', Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <input type="time" className="input-field !w-28" disabled={!isAdmin || !settings.reminderEnabled}
                value={settings.reminderTime} onChange={(e) => patch('reminderTime', e.target.value)} />
            </Row>
          </div>

          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <HiOutlineShieldCheck className="w-4 h-4" /> Working rules
            </h3>
            <p className="text-xs text-gray-400 mb-2">How the roster is generated and guarded.</p>

            <Row
              title="5th Saturday is all-hands"
              hint="When a month has five Saturdays, everyone works the fifth"
            >
              <Toggle checked={settings.fifthSaturdayWorking} disabled={!isAdmin} onChange={(v) => patch('fifthSaturdayWorking', v)} />
            </Row>

            <Row title="Auto-create upcoming weeks" hint="Drafts future Saturdays daily at 06:00 IST">
              <Toggle checked={settings.autoCreateEnabled} disabled={!isAdmin} onChange={(v) => patch('autoCreateEnabled', v)} />
            </Row>
            <Row title="Weeks ahead to prepare">
              <input type="number" min={1} max={12} className="input-field !w-20"
                disabled={!isAdmin || !settings.autoCreateEnabled}
                value={settings.autoCreateWeeksAhead}
                onChange={(e) => patch('autoCreateWeeksAhead', Number(e.target.value))} />
            </Row>

            <Row
              title="Minimum coverage"
              hint="Publishing is blocked below this share of the team Working. 0 disables the check."
            >
              <div className="flex items-center gap-1">
                <input type="number" min={0} max={100} className="input-field !w-20" disabled={!isAdmin}
                  value={settings.minCoveragePercent}
                  onChange={(e) => patch('minCoveragePercent', Number(e.target.value))} />
                <span className="text-sm text-gray-400">%</span>
              </div>
            </Row>
          </div>
        </div>
      )}

      {tab === 'holidays' && (
        <div className="grid lg:grid-cols-3 gap-4">
          {isAdmin && (
            <div className="card lg:col-span-1 h-fit">
              <h3 className="font-semibold text-gray-700 mb-3">Add a holiday</h3>
              <div className="space-y-3">
                <div>
                  <label className="label-text">Date</label>
                  <input type="date" className="input-field" value={holidayForm.holidayDate}
                    onChange={(e) => setHolidayForm((f) => ({ ...f, holidayDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">Name</label>
                  <input className="input-field" placeholder="e.g. Diwali" value={holidayForm.name}
                    onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <button className="btn-primary w-full flex items-center justify-center gap-1" onClick={addHoliday}>
                  <HiOutlinePlus className="w-4 h-4" /> Add Holiday
                </button>
                <p className="text-xs text-gray-400">
                  A Saturday falling on a holiday is an off-day for everyone, and does not count against
                  anyone's alternation.
                </p>
              </div>
            </div>
          )}

          <div className={`card p-0 ${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            {!holidays.length ? (
              <div className="p-6"><EmptyState message="No holidays configured" icon={HiOutlineCalendar} /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Holiday</th>
                    <th className="px-4 py-3">Falls on</th>
                    {isAdmin && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {holidays.map((h) => {
                    const d = new Date(`${String(h.holidayDate).slice(0, 10)}T00:00:00`);
                    const isSat = d.getDay() === 6;
                    return (
                      <tr key={h._id || h.id} className={isSat ? 'bg-violet-50/50' : ''}>
                        <td className="px-4 py-3 font-medium text-gray-700">{formatDate(h.holidayDate)}</td>
                        <td className="px-4 py-3">{h.name}</td>
                        <td className="px-4 py-3">
                          {DAYS[d.getDay()]}
                          {isSat && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">Roster Saturday</span>}
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <button className="text-red-500 hover:text-red-700" onClick={() => removeHoliday(h._id || h.id)}>
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-1 h-fit">
            <h3 className="font-semibold text-gray-700 mb-3">Record leave</h3>
            <div className="space-y-3">
              <div>
                <label className="label-text">Employee</label>
                <select className="input-field" value={leaveForm.employeeId}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, employeeId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {employees.map((u) => (
                    <option key={u._id || u.id} value={u._id || u.id}>{u.name} ({u.employeeCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label-text">From</label>
                  <input type="date" className="input-field" value={leaveForm.fromDate}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, fromDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label-text">To</label>
                  <input type="date" className="input-field" value={leaveForm.toDate}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, toDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label-text">Reason (optional)</label>
                <input className="input-field" placeholder="e.g. Annual leave" value={leaveForm.reason}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} />
              </div>
              <button className="btn-primary w-full flex items-center justify-center gap-1" onClick={addLeave}>
                <HiOutlinePlus className="w-4 h-4" /> Record Leave
              </button>
              <p className="text-xs text-gray-400">
                Anyone on leave over a Saturday is rostered Off automatically, and keeps their place in the
                alternation — being away won't cost them their next Saturday off.
              </p>
            </div>
          </div>

          <div className="card p-0 lg:col-span-2">
            {!leaves.length ? (
              <div className="p-6"><EmptyState message="No leave recorded" icon={HiOutlineUserGroup} /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaves.map((l) => (
                    <tr key={l._id || l.id}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-700">{l.employee?.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{l.employee?.employeeCode}</span>
                      </td>
                      <td className="px-4 py-3">{formatDate(l.fromDate)}</td>
                      <td className="px-4 py-3">{formatDate(l.toDate)}</td>
                      <td className="px-4 py-3 text-gray-500">{l.reason || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-red-500 hover:text-red-700" onClick={() => removeLeave(l._id || l.id)}>
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
