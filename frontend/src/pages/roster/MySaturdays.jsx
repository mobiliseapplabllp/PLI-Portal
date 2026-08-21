import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  HiOutlineCalendar, HiOutlineSwitchHorizontal, HiOutlineGift, HiOutlineCheck, HiOutlineX,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import {
  getMyRosterApi, listSwapsApi, createSwapApi, acceptSwapApi, cancelSwapApi,
} from '../../api/roster.api';
import { getUsersApi } from '../../api/users.api';

const fmtSat = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });

const SWAP_LABELS = {
  pending_peer: ['Awaiting colleague', 'bg-yellow-100 text-yellow-700'],
  pending_manager: ['Awaiting manager', 'bg-blue-100 text-blue-700'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Rejected', 'bg-red-100 text-red-700'],
  cancelled: ['Cancelled', 'bg-gray-100 text-gray-500'],
};

export default function MySaturdays() {
  const user = useSelector((s) => s.auth.user);
  const [data, setData] = useState(null);
  const [swaps, setSwaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [swapModal, setSwapModal] = useState(false);
  const [colleagues, setColleagues] = useState([]);
  const [swapForm, setSwapForm] = useState({ targetEmployeeId: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, sw] = await Promise.all([getMyRosterApi(), listSwapsApi({ limit: 20 })]);
      setData(mine.data.data);
      setSwaps(sw.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load your roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openSwapModal = async () => {
    setSwapModal(true);
    if (!colleagues.length) {
      try {
        const res = await getUsersApi({ isActive: 'true', limit: 300 });
        const users = res.data?.data?.users || res.data?.data || [];
        setColleagues(users.filter((u) => (u._id || u.id) !== (user?._id || user?.id)));
      } catch { /* dropdown stays empty */ }
    }
  };

  const handleCreateSwap = async () => {
    if (!swapForm.targetEmployeeId) { toast.error('Select a colleague to swap with'); return; }
    setBusy(true);
    try {
      const weekId = data.upcoming.week._id || data.upcoming.week.id;
      await createSwapApi(weekId, swapForm.targetEmployeeId, swapForm.reason || undefined);
      toast.success('Swap request sent to your colleague');
      setSwapModal(false);
      setSwapForm({ targetEmployeeId: '', reason: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to create swap request');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (id) => {
    setBusy(true);
    try {
      await acceptSwapApi(id);
      toast.success('Accepted — sent to manager for approval');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally { setBusy(false); }
  };

  const handleCancel = async (id) => {
    setBusy(true);
    try {
      await cancelSwapApi(id);
      toast.success('Swap cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingSpinner size="lg" />;

  if (data && data.rosterApplicable === false) {
    return (
      <div>
        <PageHeader title="My Saturdays" />
        <div className="card bg-amber-50 border-amber-200 text-amber-800 text-sm">
          Saturday rostering is not applicable to you. Contact HR if you believe this is incorrect.
        </div>
      </div>
    );
  }

  const myId = user?._id || user?.id;
  const upcoming = data?.upcoming;

  return (
    <div>
      <PageHeader title="My Saturdays" subtitle="Your alternate-Saturday roster, history and comp-offs" />

      {/* Upcoming Saturday */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <div className="card md:col-span-2 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-gray-400 font-semibold mb-1">Upcoming Saturday</div>
            {upcoming ? (
              <>
                <div className="text-lg font-semibold text-gray-800">{fmtSat(upcoming.week.saturdayDate)}</div>
                <div className={`mt-2 inline-block px-4 py-1.5 rounded-lg text-sm font-bold ${
                  upcoming.finalStatus === 'working' ? 'bg-emerald-600 text-white' : 'bg-gray-500 text-white'
                }`}>
                  {upcoming.finalStatus === 'working' ? 'WORKING' : 'OFF'}
                </div>
                {upcoming.plannedStatus !== upcoming.finalStatus && (
                  <div className="text-xs text-amber-600 mt-2">
                    Changed as per company work requirement{upcoming.changeReason ? ` — ${upcoming.changeReason}` : ''}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-400 mt-1">Your roster for the upcoming Saturday is not published yet.</div>
            )}
          </div>
          {upcoming && (
            <button className="btn-secondary flex items-center gap-1" onClick={openSwapModal}>
              <HiOutlineSwitchHorizontal className="w-4 h-4" /> Request Swap
            </button>
          )}
        </div>
        <div className="card">
          <div className="text-xs uppercase text-gray-400 font-semibold mb-1 flex items-center gap-1">
            <HiOutlineGift className="w-4 h-4" /> Comp-Off Balance
          </div>
          <div className="text-3xl font-bold text-gray-800">{data?.compOffBalance ?? 0}</div>
          <div className="text-xs text-gray-400 mt-1">
            Worked {data?.stats?.workedCount ?? 0} of your last {data?.stats?.recentSaturdays ?? 0} Saturdays
          </div>
        </div>
      </div>

      {/* Swap requests involving me */}
      {swaps.length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-700 mb-3">Swap Requests</h3>
          <div className="divide-y divide-gray-100">
            {swaps.map((s) => {
              const [label, cls] = SWAP_LABELS[s.status] || ['—', 'bg-gray-100 text-gray-500'];
              const iAmTarget = String(s.targetId) === String(myId);
              const iAmRequester = String(s.requesterId) === String(myId);
              return (
                <div key={s._id || s.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-medium">{s.requester?.name}</span>
                    <span className="text-gray-400"> ⇄ </span>
                    <span className="font-medium">{s.target?.name}</span>
                    <span className="text-gray-400"> · {fmtSat(s.week?.saturdayDate)}</span>
                    {s.reason && <div className="text-xs text-gray-400">{s.reason}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
                    {iAmTarget && s.status === 'pending_peer' && (
                      <button className="btn-primary !px-2.5 !py-1 text-xs flex items-center gap-1" disabled={busy} onClick={() => handleAccept(s._id || s.id)}>
                        <HiOutlineCheck className="w-3.5 h-3.5" /> Accept
                      </button>
                    )}
                    {iAmRequester && ['pending_peer', 'pending_manager'].includes(s.status) && (
                      <button className="btn-secondary !px-2.5 !py-1 text-xs flex items-center gap-1" disabled={busy} onClick={() => handleCancel(s._id || s.id)}>
                        <HiOutlineX className="w-3.5 h-3.5" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      <div className="card">
        <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-1">
          <HiOutlineCalendar className="w-4 h-4" /> My Saturday History
        </h3>
        {!data?.history?.length ? (
          <p className="text-sm text-gray-400 italic">No published Saturdays yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400">
                  <th className="py-2 pr-4">Saturday</th>
                  <th className="py-2 pr-4">Planned</th>
                  <th className="py-2 pr-4">Final</th>
                  <th className="py-2">Change Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.history.map((h) => (
                  <tr key={h._id || h.id}>
                    <td className="py-2 pr-4 font-medium text-gray-700">{fmtSat(h.week?.saturdayDate)}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        h.plannedStatus === 'working' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}>{h.plannedStatus === 'working' ? 'Working' : 'Off'}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        h.finalStatus === 'working' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}>{h.finalStatus === 'working' ? 'Working' : 'Off'}</span>
                    </td>
                    <td className="py-2 text-xs text-gray-500">{h.changeReason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Swap request modal */}
      <Modal open={swapModal} onClose={() => setSwapModal(false)} title="Request Saturday Swap" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            You are <strong>{upcoming?.finalStatus === 'working' ? 'Working' : 'Off'}</strong> on{' '}
            <strong>{upcoming ? fmtSat(upcoming.week.saturdayDate) : ''}</strong>. Pick a colleague with the opposite
            status — they must accept, then your manager approves.
          </p>
          <div>
            <label className="label-text">Colleague *</label>
            <select
              className="input-field"
              value={swapForm.targetEmployeeId}
              onChange={(e) => setSwapForm((f) => ({ ...f, targetEmployeeId: e.target.value }))}
            >
              <option value="">— Select colleague —</option>
              {colleagues.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>
                  {c.name} ({c.employeeCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Reason (optional)</label>
            <textarea
              className="input-field"
              rows={2}
              value={swapForm.reason}
              onChange={(e) => setSwapForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Family function this Saturday"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSwapModal(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy} onClick={handleCreateSwap}>
              {busy ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
