/**
 * DeletedTickets.jsx
 * Admin-only recycle bin for soft-deleted helpdesk tickets (migration 067).
 * A ticket "deleted" here is never gone — it's just hidden from every normal
 * view until an admin restores it. Mirrors the admin-only backend gate on
 * GET /helpdesk/tickets/deleted and POST /helpdesk/tickets/:id/restore.
 */
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { fetchHdOptions, selectHdOptions } from '../../store/helpdeskSlice';
import { getDeletedTicketsApi, restoreTicketApi } from '../../api/helpdesk/helpdesk.api';
import { HiOutlineArrowLeft, HiOutlineRefresh, HiOutlineTrash } from 'react-icons/hi';

const fmtLabel = (s) =>
  (s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export default function DeletedTickets() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const hdOptions = useSelector(selectHdOptions);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  // Same admin-configurable color source TicketList/HdReports use, so a
  // status/priority chip here looks identical to everywhere else.
  const statusColorMap = Object.fromEntries((hdOptions.status || []).map(o => [o.name.toLowerCase(), o.color]).filter(([, c]) => c));
  const priorityColorMap = Object.fromEntries((hdOptions.priority || []).map(o => [o.name.toLowerCase(), o.color]).filter(([, c]) => c));
  const statusStyle = (s) => {
    const c = statusColorMap[String(s ?? '').toLowerCase()];
    return c ? { backgroundColor: `${c}1A`, color: c } : { backgroundColor: '#f3f4f6', color: '#374151' };
  };
  const priorityStyle = (p) => {
    const c = priorityColorMap[String(p ?? '').toLowerCase()];
    return c ? { backgroundColor: `${c}1A`, color: c, borderColor: `${c}4D` } : { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDeletedTicketsApi({ pageSize: 200 });
      setTickets(res.data?.data?.tickets || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load deleted tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hdOptions.status?.length) dispatch(fetchHdOptions());
    load();
  }, [dispatch, hdOptions.status?.length, load]);

  const handleRestore = async (ticket) => {
    const id = ticket._id || ticket.id;
    setRestoringId(id);
    try {
      await restoreTicketApi(id);
      toast.success(`${ticket.reqNumber} restored`);
      setTickets((prev) => prev.filter((t) => (t._id || t.id) !== id));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to restore ticket');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="bg-[#f5f5f5] min-h-full">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/helpdesk/tickets')}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <HiOutlineArrowLeft className="w-4 h-4" />
          </button>
          <HiOutlineTrash className="w-4 h-4 text-gray-500" />
          <h1 className="text-sm font-semibold">Deleted Tickets</h1>
          <span className="text-[11px] text-gray-400">
            Soft-deleted only — nothing here is permanently gone until restored or purged.
          </span>
          <button
            type="button"
            onClick={load}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-[11px] font-medium"
          >
            <HiOutlineRefresh className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-medium">Req #</th>
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium">Requester</th>
                <th className="text-left px-3 py-2 font-medium">Priority</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Deleted At</th>
                <th className="text-right px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && tickets.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No deleted tickets.</td></tr>
              )}
              {!loading && tickets.map((t) => {
                const id = t._id || t.id;
                return (
                  <tr key={id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-700">{t.reqNumber}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-xs truncate">{t.title}</td>
                    <td className="px-3 py-2 text-gray-600">{t.requesterUser?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded-full border text-[10px] font-medium" style={priorityStyle(t.priority)}>
                        {fmtLabel(t.priority)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={statusStyle(t.status)}>
                        {fmtLabel(t.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{fmtDateTime(t.deleted_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={restoringId === id}
                        onClick={() => handleRestore(t)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] disabled:opacity-50 text-[11px] font-medium"
                      >
                        <HiOutlineRefresh className="w-3.5 h-3.5" />
                        {restoringId === id ? 'Restoring…' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
