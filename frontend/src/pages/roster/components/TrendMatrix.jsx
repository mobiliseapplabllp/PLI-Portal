import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineDownload, HiOutlineRefresh, HiOutlineSearch, HiOutlineExclamation,
} from 'react-icons/hi';
import TableSkeleton from '../../../components/common/TableSkeleton';
import EmptyState from '../../../components/common/EmptyState';
import { getRosterTrendApi, exportRosterTrendApi } from '../../../api/roster.api';
import { getDepartmentsApi } from '../../../api/departments.api';
import { downloadBlob } from '../../../utils/formatters';

const fmtCol = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/**
 * One matrix cell.
 *  green  = worked      · blank = off
 *  amber ring = changed after publish   · dotted = still draft
 *  hatched dash = no roster entry for that Saturday
 */
function Cell({ cell, isFifth, onClick }) {
  if (!cell.status) {
    return (
      <td className="px-1 py-1 text-center">
        <span className="inline-block w-7 h-7 rounded-md bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_3px,#eef2f7_3px,#eef2f7_6px)]" title="No roster entry" />
      </td>
    );
  }

  const working = cell.status === 'working';
  const title = [
    working ? 'Working' : 'Off',
    isFifth ? '5th Saturday — all hands' : null,
    cell.changed ? `Changed after publish${cell.changeReason ? `: ${cell.changeReason}` : ''}` : null,
    cell.published ? null : 'Draft — not yet published',
  ].filter(Boolean).join(' · ');

  return (
    <td className="px-1 py-1 text-center">
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold transition
          hover:ring-2 hover:ring-primary-300
          ${working ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300'}
          ${cell.changed ? 'ring-2 ring-amber-400' : ''}
          ${cell.published ? '' : 'border-2 border-dotted border-slate-400 opacity-70'}`}
      >
        {working ? 'W' : ''}
      </button>
    </td>
  );
}

/** Saturday trend matrix — rendered as a tab inside the Saturday Roster page. */
export default function TrendMatrix({ onOpenWeek }) {
  const navigate = useNavigate();
  const [range, setRange] = useState('recent');
  const [deptFilter, setDeptFilter] = useState('');
  const [search, setSearch] = useState('');
  const [onlyImbalanced, setOnlyImbalanced] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRosterTrendApi({ range, ...(deptFilter ? { departmentId: deptFilter } : {}) });
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load Saturday trend');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range, deptFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getDepartmentsApi({ isActive: 'true' })
      .then((res) => setDepartments(res.data.data || []))
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (onlyImbalanced && r.breaks === 0) return false;
      if (!q) return true;
      return (
        r.employee.name.toLowerCase().includes(q) ||
        (r.employee.employeeCode || '').toLowerCase().includes(q)
      );
    });
  }, [data, search, onlyImbalanced]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportRosterTrendApi({ range, ...(deptFilter ? { departmentId: deptFilter } : {}) });
      downloadBlob(new Blob([res.data]), `saturday-trend-${data?.from}-to-${data?.to}.xlsx`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Controls */}
      <div className="card mb-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="label-text">Period</label>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            {[
              { key: 'recent', label: 'Last 12 Saturdays' },
              { key: 'fy', label: 'Full financial year' },
            ].map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`px-3 py-2 text-sm font-medium transition ${
                  range === r.key ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label-text">Department</label>
          <select className="input-field w-44" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <label className="label-text">Search</label>
          <div className="relative">
            <HiOutlineSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="input-field pl-9"
              placeholder="Name or employee code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 pb-2.5 cursor-pointer">
          <input type="checkbox" className="rounded" checked={onlyImbalanced} onChange={(e) => setOnlyImbalanced(e.target.checked)} />
          Only alternation breaks
        </label>

        <div className="flex gap-2 ml-auto pb-1">
          <button className="btn-secondary flex items-center gap-1" onClick={load}>
            <HiOutlineRefresh className="w-4 h-4" /> Refresh
          </button>
          <button className="btn-secondary flex items-center gap-1" disabled={exporting || !data} onClick={handleExport}>
            <HiOutlineDownload className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Excel'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-500 inline-block" /> Working</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-100 inline-block" /> Off</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-500 ring-2 ring-amber-400 inline-block" /> Changed after publish</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded border-2 border-dotted border-slate-400 inline-block" /> Draft</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_3px,#eef2f7_3px,#eef2f7_6px)] inline-block" /> No entry</span>
        <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">5th</span> All-hands Saturday</span>
      </div>

      {loading ? (
        <TableSkeleton rows={10} columns={8} />
      ) : !data || !rows.length ? (
        <div className="card"><EmptyState message="No roster data for this period" icon={HiOutlineExclamation} /></div>
      ) : (
        <>
          <div className="card p-0 overflow-auto max-h-[70vh]">
            <table className="text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-4 py-2 text-left text-xs uppercase text-gray-500 min-w-[220px]">
                    Resource
                  </th>
                  {data.columns.map((c) => (
                    <th
                      key={c.date}
                      className={`sticky top-0 z-20 border-b border-gray-200 px-1 py-2 text-center text-[11px] font-semibold whitespace-nowrap
                        ${c.isFifthSaturday ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-500'}`}
                      title={c.isFifthSaturday ? '5th Saturday — everyone works' : c.label}
                    >
                      {fmtCol(c.date)}
                      {c.isFifthSaturday && <div className="text-[9px] font-bold">5th</div>}
                      {!c.exists && <div className="text-[9px] text-gray-300">—</div>}
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-gray-50 border-b border-l border-gray-200 px-2 py-2 text-center text-[11px] uppercase text-gray-500">W</th>
                  <th className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 px-2 py-2 text-center text-[11px] uppercase text-gray-500">Off</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee._id} className="hover:bg-primary-50/30">
                    <td className="sticky left-0 z-10 bg-white hover:bg-primary-50/30 border-b border-r border-gray-100 px-4 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate">{r.employee.name}</div>
                          <div className="text-[11px] text-gray-400 truncate">
                            {r.employee.employeeCode}
                            {r.employee.department?.name ? ` · ${r.employee.department.name}` : ''}
                          </div>
                        </div>
                        {r.breaks > 0 && (
                          <span
                            title={`${r.breaks} Saturday${r.breaks === 1 ? '' : 's'} repeated the previous status — alternation broken`}
                            className="ml-auto shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                          >
                            ⚠ {r.breaks}
                          </span>
                        )}
                      </div>
                    </td>
                    {r.cells.map((cell, i) => (
                      <Cell
                        key={cell.date}
                        cell={cell}
                        isFifth={data.columns[i].isFifthSaturday}
                        onClick={() => (onOpenWeek ? onOpenWeek(cell.date) : navigate('/roster/board'))}
                      />
                    ))}
                    <td className="border-b border-l border-gray-100 px-2 py-1.5 text-center font-semibold text-emerald-600">{r.worked}</td>
                    <td className="border-b border-gray-100 px-2 py-1.5 text-center text-gray-500">{r.off}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-gray-50 border-t border-r border-gray-200 px-4 py-2 text-xs font-semibold uppercase text-gray-500">
                    Working headcount
                  </td>
                  {data.columns.map((c) => (
                    <td key={c.date} className={`border-t border-gray-200 px-1 py-2 text-center text-xs font-bold ${c.isFifthSaturday ? 'bg-violet-50 text-violet-700' : 'text-gray-600'}`}>
                      {c.exists ? c.workingCount : '—'}
                    </td>
                  ))}
                  <td className="border-t border-l border-gray-200" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Showing {rows.length} of {data.totals.employees} rostered employees across {data.totals.saturdays} Saturdays
            ({data.totals.fifthSaturdays} all-hands 5th Saturday{data.totals.fifthSaturdays === 1 ? '' : 's'}).
            {data.totals.imbalanced > 0 && ` ${data.totals.imbalanced} employee${data.totals.imbalanced === 1 ? '' : 's'} broke the alternation pattern.`}
          </p>
        </>
      )}
    </div>
  );
}
