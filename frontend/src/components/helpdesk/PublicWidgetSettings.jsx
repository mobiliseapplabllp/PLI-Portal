/**
 * PublicWidgetSettings — Operations settings › Public widget.
 *
 * Works on the COMMON PM project list (the same projects tickets use). For each
 * project you can enable the public support-form widget, copy its token,
 * regenerate it, or disable it. Nothing here creates or edits projects.
 */
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineClipboard, HiOutlineRefresh, HiOutlineSearch } from 'react-icons/hi';
import {
  listWidgetSettingsApi, enableWidgetApi, regenerateWidgetTokenApi, disableWidgetApi,
} from '../../api/helpdesk/widgetSettings.api';

const errMsg = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || fallback;

export default function PublicWidgetSettings() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [query,   setQuery]   = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const load = () => {
    setLoading(true);
    listWidgetSettingsApi()
      .then((res) => setRows(Array.isArray(res.data?.data) ? res.data.data : []))
      .catch((err) => toast.error(errMsg(err, 'Failed to load projects')))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      (showClosed || !r.isClosed || r.widgetEnabled) &&
      (!q || String(r.name).toLowerCase().includes(q) || String(r.clientName || '').toLowerCase().includes(q)),
    );
  }, [rows, query, showClosed]);

  const run = async (id, fn, okText) => {
    setBusyId(id);
    try {
      const res = await fn(id);
      const updated = res.data?.data;
      if (updated) setRows((prev) => prev.map((r) => (String(r._id ?? r.id) === String(updated._id ?? updated.id) ? updated : r)));
      toast.success(okText);
    } catch (err) {
      toast.error(errMsg(err, 'Action failed'));
    } finally {
      setBusyId(null);
    }
  };

  const copyToken = (token, id) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedId(id); toast.success('Token copied');
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast.error('Copy failed'));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Public widget</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Let outside customers raise tickets against a project through the embeddable support form.
          Projects come from Project Management; enable the widget per project and share its token.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <HiOutlineSearch className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project or client…"
            className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed projects
        </label>
        <button onClick={load} className="ml-auto text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <HiOutlineRefresh className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm bg-white rounded-lg border border-gray-200">
          No projects match.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2.5 text-left">Project</th>
                <th className="px-4 py-2.5 text-left">Widget</th>
                <th className="px-4 py-2.5 text-left">Token</th>
                <th className="px-4 py-2.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.map((p) => {
                const id = p._id ?? p.id;
                const busy = busyId === id;
                return (
                  <tr key={id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[p.clientName, p.managerName ? `PM: ${p.managerName}` : '', p.isClosed ? p.status : ''].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      {p.widgetEnabled
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Enabled</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Off</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.widgetEnabled && p.publicToken
                        ? <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-700">{p.publicToken.slice(0, 18)}…</code>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3 flex-wrap">
                        {!p.widgetEnabled && (
                          <button disabled={busy} onClick={() => run(id, enableWidgetApi, 'Widget enabled')}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40">
                            Enable
                          </button>
                        )}
                        {p.widgetEnabled && (
                          <>
                            <button onClick={() => copyToken(p.publicToken, id)}
                              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800 font-medium">
                              <HiOutlineClipboard className="w-3.5 h-3.5" />
                              {copiedId === id ? 'Copied!' : 'Copy token'}
                            </button>
                            <button disabled={busy}
                              onClick={() => { if (window.confirm('Regenerate token? Existing widget URLs stop working immediately.')) run(id, regenerateWidgetTokenApi, 'Token regenerated'); }}
                              className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium disabled:opacity-40">
                              <HiOutlineRefresh className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                              Regenerate
                            </button>
                            <button disabled={busy}
                              onClick={() => { if (window.confirm('Disable the widget for this project? Customers can no longer submit through it.')) run(id, disableWidgetApi, 'Widget disabled'); }}
                              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-40">
                              Disable
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
