import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineSwitchHorizontal, HiOutlineGift, HiOutlineRefresh } from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { listSwapsApi, decideSwapApi, listCompOffsApi, availCompOffApi } from '../../api/roster.api';
import { formatDate } from '../../utils/formatters';

const fmtSat = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

const SWAP_LABELS = {
  pending_peer: ['Awaiting colleague', 'bg-yellow-100 text-yellow-700'],
  pending_manager: ['Awaiting your approval', 'bg-blue-100 text-blue-700'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-700'],
  rejected: ['Rejected', 'bg-red-100 text-red-700'],
  cancelled: ['Cancelled', 'bg-gray-100 text-gray-500'],
};

export default function SwapApprovals() {
  const [tab, setTab] = useState('swaps');
  const [swaps, setSwaps] = useState([]);
  const [compOffs, setCompOffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [decideModal, setDecideModal] = useState(null); // { swap, action }
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sw, co] = await Promise.all([listSwapsApi({ limit: 100 }), listCompOffsApi({ limit: 200 })]);
      setSwaps(sw.data.data || []);
      setCompOffs(co.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDecide = async () => {
    setBusy(true);
    try {
      await decideSwapApi(decideModal.swap._id || decideModal.swap.id, decideModal.action, comment || undefined);
      toast.success(`Swap ${decideModal.action}d`);
      setDecideModal(null);
      setComment('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAvail = async (id) => {
    setBusy(true);
    try {
      await availCompOffApi(id);
      toast.success('Comp-off marked as availed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = swaps.filter((s) => s.status === 'pending_manager').length;

  return (
    <div>
      <PageHeader
        title="Swaps & Comp-Offs"
        subtitle="Approve Saturday swaps and manage your team's compensatory offs"
        actions={
          <button className="btn-secondary flex items-center gap-1" onClick={load}>
            <HiOutlineRefresh className="w-4 h-4" /> Refresh
          </button>
        }
      />

      <div className="flex gap-2 mb-4">
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'swaps' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          onClick={() => setTab('swaps')}
        >
          <HiOutlineSwitchHorizontal className="inline w-4 h-4 mr-1" />
          Swap Requests{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}
        </button>
        <button
          className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'compoffs' ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          onClick={() => setTab('compoffs')}
        >
          <HiOutlineGift className="inline w-4 h-4 mr-1" />
          Comp-Offs
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : tab === 'swaps' ? (
        <div className="card p-0 overflow-x-auto">
          {!swaps.length ? (
            <div className="p-6"><EmptyState message="No swap requests" icon={HiOutlineSwitchHorizontal} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3">Saturday</th>
                  <th className="px-4 py-3">Swap</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {swaps.map((s) => {
                  const [label, cls] = SWAP_LABELS[s.status] || ['—', 'bg-gray-100 text-gray-500'];
                  return (
                    <tr key={s._id || s.id}>
                      <td className="px-4 py-3 font-medium text-gray-700">{fmtSat(s.week?.saturdayDate)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{s.requester?.name}</span>
                        <span className="text-xs text-gray-400"> ({s.requesterEntry?.finalStatus})</span>
                        <span className="text-gray-400 mx-1">⇄</span>
                        <span className="font-medium">{s.target?.name}</span>
                        <span className="text-xs text-gray-400"> ({s.targetEntry?.finalStatus})</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[220px] truncate" title={s.reason || ''}>
                        {s.reason || '—'}
                        {s.decisionComment && <div className="text-gray-400">Decision: {s.decisionComment}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {s.status === 'pending_manager' ? (
                          <div className="inline-flex gap-2">
                            <button className="btn-primary !px-3 !py-1 text-xs" disabled={busy}
                              onClick={() => { setDecideModal({ swap: s, action: 'approve' }); setComment(''); }}>
                              Approve
                            </button>
                            <button className="btn-danger !px-3 !py-1 text-xs" disabled={busy}
                              onClick={() => { setDecideModal({ swap: s, action: 'reject' }); setComment(''); }}>
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          {!compOffs.length ? (
            <div className="p-6"><EmptyState message="No comp-offs yet" icon={HiOutlineGift} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Earned For</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compOffs.map((c) => (
                  <tr key={c._id || c.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-700">{c.employee?.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{c.employee?.employeeCode}</span>
                    </td>
                    <td className="px-4 py-3">{fmtSat(c.earnedDate)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[260px] truncate" title={c.reason || ''}>
                      {c.reason || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        c.status === 'earned' ? 'bg-emerald-100 text-emerald-700'
                          : c.status === 'availed' ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.status === 'availed' ? `Availed ${c.availedDate ? formatDate(c.availedDate) : ''}` : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.status === 'earned' ? (
                        <button className="btn-secondary !px-3 !py-1 text-xs" disabled={busy} onClick={() => handleAvail(c._id || c.id)}>
                          Mark Availed
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Decision modal */}
      <Modal
        open={!!decideModal}
        onClose={() => setDecideModal(null)}
        title={decideModal?.action === 'approve' ? 'Approve Swap' : 'Reject Swap'}
        size="md"
      >
        {decideModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {decideModal.action === 'approve' ? 'Approve' : 'Reject'} the Saturday swap between{' '}
              <strong>{decideModal.swap.requester?.name}</strong> and <strong>{decideModal.swap.target?.name}</strong>{' '}
              for {fmtSat(decideModal.swap.week?.saturdayDate)}?
              {decideModal.action === 'approve' && ' Their Working/Off statuses will be exchanged and both will be emailed.'}
            </p>
            <div>
              <label className="label-text">Comment (optional)</label>
              <textarea className="input-field" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDecideModal(null)}>Cancel</button>
              <button
                className={decideModal.action === 'approve' ? 'btn-primary' : 'btn-danger'}
                disabled={busy}
                onClick={handleDecide}
              >
                {busy ? 'Saving…' : decideModal.action === 'approve' ? 'Approve Swap' : 'Reject Swap'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
