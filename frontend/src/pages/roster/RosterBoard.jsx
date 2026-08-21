import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar, HiOutlineDownload, HiOutlineMail, HiOutlineRefresh,
  HiOutlineCheckCircle, HiOutlineExclamation,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TableSkeleton from '../../components/common/TableSkeleton';
import EmptyState from '../../components/common/EmptyState';
import {
  listRosterWeeksApi, createRosterWeekApi, getRosterWeekApi,
  publishRosterWeekApi, exportRosterWeekApi, updateRosterEntryApi,
} from '../../api/roster.api';
import { getDepartmentsApi } from '../../api/departments.api';
import { getUsersApi } from '../../api/users.api';
import { downloadBlob } from '../../utils/formatters';

const ADMIN_ROLES = ['admin', 'hr_admin'];

const fmtSat = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

// Upcoming Saturdays (this week's + next 5) for the week picker
const upcomingSaturdays = () => {
  const out = [];
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  for (let i = 0; i < 6; i += 1) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 7);
  }
  return out;
};

const StatusToggle = ({ value, onChange, disabled }) => (
  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
    {['working', 'off'].map((s) => (
      <button
        key={s}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && value !== s && onChange(s)}
        className={`px-3 py-1 text-xs font-semibold transition ${
          value === s
            ? s === 'working'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-500 text-white'
            : 'bg-white text-gray-500 hover:bg-gray-50'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {s === 'working' ? 'Working' : 'Off'}
      </button>
    ))}
  </div>
);

const HistoryChips = ({ history }) => {
  if (!history?.length) return <span className="text-xs text-gray-400 italic">No history</span>;
  return (
    <div className="flex gap-1">
      {history.map((h) => (
        <span
          key={h.saturdayDate}
          title={`${fmtSat(h.saturdayDate)} — ${h.status === 'working' ? 'Working' : 'Off'}`}
          className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
            h.status === 'working' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'
          }`}
        >
          {h.status === 'working' ? 'W' : 'O'}
        </span>
      ))}
    </div>
  );
};

export default function RosterBoard() {
  const user = useSelector((s) => s.auth.user);
  const isAdmin = ADMIN_ROLES.includes(user?.role);

  const saturdays = useMemo(upcomingSaturdays, []);
  const [selectedDate, setSelectedDate] = useState(saturdays[0]);
  const [pastWeeks, setPastWeeks] = useState([]);
  const [data, setData] = useState(null); // { week, entries, stats }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Admin filters
  const [departments, setDepartments] = useState([]);
  const [managers, setManagers] = useState([]);
  const [deptFilter, setDeptFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');

  // Post-publish change modal
  const [changeModal, setChangeModal] = useState(null); // { entry, newStatus }
  const [changeReason, setChangeReason] = useState('');
  const [publishConfirm, setPublishConfirm] = useState(false);

  const load = useCallback(async (date, dept = deptFilter, mgr = managerFilter) => {
    setLoading(true);
    try {
      const res = await createRosterWeekApi(date); // get-or-create + auto-generate for my scope
      const weekId = res.data.data.week._id || res.data.data.week.id;
      const detail = await getRosterWeekApi(weekId, {
        ...(dept ? { departmentId: dept } : {}),
        ...(mgr ? { managerId: mgr } : {}),
      });
      setData(detail.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load roster');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [deptFilter, managerFilter]);

  useEffect(() => { load(selectedDate); /* eslint-disable-next-line */ }, [selectedDate, deptFilter, managerFilter]);

  useEffect(() => {
    listRosterWeeksApi({ limit: 12 })
      .then((res) => setPastWeeks(res.data.data || []))
      .catch(() => {});
    if (isAdmin) {
      getDepartmentsApi({ isActive: 'true' }).then((res) => setDepartments(res.data.data || [])).catch(() => {});
      getUsersApi({ isActive: 'true', limit: 300 }).then((res) => {
        const users = res.data?.data?.users || res.data?.data || [];
        setManagers(users.filter((u) => ['manager', 'senior_manager', 'sales_director'].includes(u.role)));
      }).catch(() => {});
    }
    // eslint-disable-next-line
  }, []);

  const handleStatusChange = async (entry, newStatus) => {
    if (entry.isPublished) {
      setChangeModal({ entry, newStatus });
      setChangeReason('');
      return;
    }
    setSaving(true);
    try {
      await updateRosterEntryApi(entry._id || entry.id, newStatus);
      await load(selectedDate);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmChange = async () => {
    if (!changeReason.trim()) {
      toast.error('A reason is required for changing a published roster');
      return;
    }
    setSaving(true);
    try {
      await updateRosterEntryApi(changeModal.entry._id || changeModal.entry.id, changeModal.newStatus, changeReason.trim());
      toast.success('Roster changed — employee has been emailed');
      setChangeModal(null);
      await load(selectedDate);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to change entry');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      const res = await publishRosterWeekApi(data.week._id || data.week.id);
      toast.success(res.data.message || 'Roster published');
      setPublishConfirm(false);
      await load(selectedDate);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportRosterWeekApi(data.week._id || data.week.id);
      downloadBlob(new Blob([res.data]), `saturday-roster-${data.week.saturdayDate}.xlsx`);
    } catch {
      toast.error('Export failed');
    }
  };

  const unpublished = data?.entries?.filter((e) => !e.isPublished).length || 0;
  const stats = data?.stats;

  return (
    <div>
      <PageHeader
        title="Saturday Roster"
        subtitle={isAdmin ? 'All teams — alternate Saturday working' : 'Your team — alternate Saturday working'}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-1" onClick={() => load(selectedDate)}>
              <HiOutlineRefresh className="w-4 h-4" /> Refresh
            </button>
            {data?.week && (
              <button className="btn-secondary flex items-center gap-1" onClick={handleExport}>
                <HiOutlineDownload className="w-4 h-4" /> Excel
              </button>
            )}
            {unpublished > 0 && (
              <button className="btn-primary flex items-center gap-1" disabled={saving} onClick={() => setPublishConfirm(true)}>
                <HiOutlineMail className="w-4 h-4" /> Publish & Email ({unpublished})
              </button>
            )}
          </div>
        }
      />

      {/* Week picker + filters */}
      <div className="card mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label-text">Saturday</label>
          <select className="input-field w-56" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}>
            {saturdays.map((d, i) => (
              <option key={d} value={d}>
                {fmtSat(d)}{i === 0 ? ' (upcoming)' : ''}
              </option>
            ))}
            {pastWeeks
              .filter((w) => !saturdays.includes(String(w.saturdayDate).slice(0, 10)))
              .map((w) => (
                <option key={w._id || w.id} value={String(w.saturdayDate).slice(0, 10)}>
                  {fmtSat(w.saturdayDate)} (past)
                </option>
              ))}
          </select>
        </div>
        {isAdmin && (
          <>
            <div>
              <label className="label-text">Department</label>
              <select className="input-field w-44" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-text">Manager</label>
              <select className="input-field w-52" value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}>
                <option value="">All Managers</option>
                {managers.map((m) => (
                  <option key={m._id || m.id} value={m._id || m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {stats && (
          <div className="flex gap-3 ml-auto text-sm">
            <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">{stats.working} Working</span>
            <span className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 font-semibold">{stats.off} Off</span>
            <span className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-semibold">{stats.published}/{stats.total} Published</span>
            {stats.changed > 0 && (
              <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-semibold">{stats.changed} Changed</span>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={8} columns={6} />
      ) : !data || data.entries.length === 0 ? (
        <div className="card">
          <EmptyState message="No roster-applicable team members found for this Saturday" icon={HiOutlineCalendar} />
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">Last Saturdays</th>
                <th className="px-4 py-3">{data.week.label || fmtSat(data.week.saturdayDate)} — Planned</th>
                <th className="px-4 py-3">Final (as per work requirement)</th>
                <th className="px-4 py-3">Change Details</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.entries.map((e) => {
                const changed = e.isPublished && e.plannedStatus !== e.finalStatus;
                return (
                  <tr key={e._id || e.id} className={changed ? 'bg-amber-50/60' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{e.employee?.name}</div>
                      <div className="text-xs text-gray-400">
                        {e.employee?.employeeCode}
                        {e.employee?.department?.name ? ` · ${e.employee.department.name}` : ''}
                        {isAdmin && e.employee?.manager?.name ? ` · Mgr: ${e.employee.manager.name}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <HistoryChips history={e.history} />
                      {e.lastWorked && (
                        <div className="text-[11px] text-gray-400 mt-1">Last worked: {fmtSat(e.lastWorked)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {e.isPublished ? (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          e.plannedStatus === 'working' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {e.plannedStatus === 'working' ? 'Working' : 'Off'}
                        </span>
                      ) : (
                        <StatusToggle value={e.plannedStatus} disabled={saving} onChange={(s) => handleStatusChange(e, s)} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusToggle value={e.finalStatus} disabled={saving} onChange={(s) => handleStatusChange(e, s)} />
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      {changed ? (
                        <div className="text-xs">
                          <div className="text-amber-700 flex items-center gap-1">
                            <HiOutlineExclamation className="w-3.5 h-3.5" /> Changed
                            {e.changedBy?.name ? ` by ${e.changedBy.name}` : ''}
                          </div>
                          {e.changeReason && <div className="text-gray-500 mt-0.5 truncate" title={e.changeReason}>{e.changeReason}</div>}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.isPublished ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                          <HiOutlineCheckCircle className="w-4 h-4" /> Published
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Draft</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Publish confirm */}
      <ConfirmDialog
        open={publishConfirm}
        title="Publish Saturday Roster"
        message={`Publish ${unpublished} roster entr${unpublished === 1 ? 'y' : 'ies'} for ${data?.week ? fmtSat(data.week.saturdayDate) : ''}? Every employee will receive an email with their Working/Off status. After publishing, changes require a reason and notify the employee.`}
        confirmText="Publish & Send Emails"
        loading={saving}
        onConfirm={handlePublish}
        onCancel={() => setPublishConfirm(false)}
      />

      {/* Post-publish change modal */}
      <Modal
        open={!!changeModal}
        onClose={() => setChangeModal(null)}
        title="Change Published Roster"
        size="md"
      >
        {changeModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Change <strong>{changeModal.entry.employee?.name}</strong> from{' '}
              <strong>{changeModal.entry.finalStatus === 'working' ? 'Working' : 'Off'}</strong> to{' '}
              <strong>{changeModal.newStatus === 'working' ? 'Working' : 'Off'}</strong> for{' '}
              {data?.week ? fmtSat(data.week.saturdayDate) : 'this Saturday'}?
            </p>
            {changeModal.entry.finalStatus === 'off' && changeModal.newStatus === 'working' && (
              <p className="text-xs bg-emerald-50 text-emerald-700 rounded-lg p-2.5">
                ✓ A compensatory off will be credited to the employee automatically.
              </p>
            )}
            <div>
              <label className="label-text">Reason (as per company work requirement) *</label>
              <textarea
                className="input-field"
                rows={2}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="e.g. Client release scheduled this Saturday"
              />
            </div>
            <p className="text-xs text-gray-400">The employee will be notified of this change by email.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setChangeModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleConfirmChange}>
                {saving ? 'Saving…' : 'Confirm Change'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
