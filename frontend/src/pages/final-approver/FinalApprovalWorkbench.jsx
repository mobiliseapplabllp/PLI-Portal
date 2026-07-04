import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  HiOutlineArrowLeft,
  HiOutlineRefresh,
  HiOutlineCheckCircle,
  HiOutlineLockClosed,
  HiOutlineExclamation,
  HiOutlineX,
  HiOutlineSearch,
  HiOutlineUserGroup,
  HiOutlineEye,
} from 'react-icons/hi';
import {
  getDeptQuarterlyStatusApi,
  initQuarterlyApprovalApi,
  getQuarterlyApprovalApi,
  submitQuarterlyApprovalApi,
} from '../../api/finalApprover.api';
import { getUsersApi, getTeamApi } from '../../api/users.api';
import { getAssignmentByIdApi } from '../../api/kpiAssignments.api';
import { getCurrentFinancialYear, MONTHS, QUARTER_MONTHS, KPI_HEAD_LABELS } from '../../utils/constants';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const monthName = (m) => MONTHS.find((x) => x.value === Number(m))?.label?.slice(0, 3) || m;

const HEAD_ORDER = ['Performance', 'CustomerCentric', 'CoreValues', 'Trainings'];

// Row colour based on calculatedQuarterlyActual
const rowBg = (val) => {
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  if (v > 0) return 'bg-green-50 border-l-4 border-green-400';
  if (v === 0) return 'bg-amber-50 border-l-4 border-amber-400';
  return 'bg-red-50 border-l-4 border-red-400';
};

const fmt = (v, decimals = 4) =>
  v != null && !isNaN(parseFloat(v)) ? parseFloat(v).toFixed(decimals) : '—';

// ── KPI Drill-Down Modal ─────────────────────────────────────────────────────

const STATUS_CHIP = {
  Exceeds: 'bg-emerald-100 text-emerald-700',
  Meets:   'bg-sky-100 text-sky-700',
  Below:   'bg-rose-100 text-rose-700',
};

function KpiDrillDownModal({ assignmentId, empName, monthLabel, onClose }) {
  const [loading, setLoading]   = useState(true);
  const [detail, setDetail]     = useState(null);
  const [items,  setItems]      = useState([]);
  const [error,  setError]      = useState(null);

  useEffect(() => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    getAssignmentByIdApi(assignmentId)
      .then((r) => {
        const payload = r.data.data; // { assignment, items }
        setDetail(payload.assignment || payload);
        setItems(payload.items || []);
      })
      .catch(() => setError('Could not load KPI details'))
      .finally(() => setLoading(false));
  }, [assignmentId]);

  const totalWt = items.reduce((s, i) => s + (Number(i.weightage) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <HiOutlineEye className="w-5 h-5 text-indigo-600" />
              {empName} — {monthLabel} KPI Detail
            </h2>
            {detail && (
              <p className="text-xs text-gray-500 mt-0.5">
                {detail.financialYear} · Weightage: {detail.totalWeightage}%
                {detail.status && <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">{detail.status?.replace(/_/g, ' ')}</span>}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-0">
          {loading && <div className="flex justify-center py-16"><LoadingSpinner /></div>}
          {error && <p className="text-center text-red-500 py-8">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="text-center text-gray-400 py-8">No KPI items found for this month.</p>
          )}
          {!loading && !error && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide border-b border-gray-200 sticky top-0">
                    <th className="px-3 py-3 text-center w-10">#</th>
                    <th className="px-3 py-3 text-left">KPI Title</th>
                    <th className="px-3 py-3 text-center w-14">Wt%</th>
                    <th className="px-3 py-3 text-center w-28">Employee Rating</th>
                    <th className="px-3 py-3 text-left">Employee Comment</th>
                    <th className="px-3 py-3 text-center w-28">Manager Rating</th>
                    <th className="px-3 py-3 text-left">Manager Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const mgrStatus  = item.managerStatus;
                    const empStatus  = item.employeeStatus;
                    const mgrChip    = STATUS_CHIP[mgrStatus] || 'bg-gray-100 text-gray-600';
                    const empChip    = STATUS_CHIP[empStatus] || 'bg-gray-100 text-gray-600';
                    return (
                      <tr key={item._id || item.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td className="px-3 py-3 text-center text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900 text-sm">{item.title}</div>
                          {item.kpiHead && <div className="text-xs text-indigo-500 mt-0.5">{item.kpiHead}</div>}
                          {item.description && <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</div>}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-xs text-gray-600">{item.weightage}%</td>
                        <td className="px-3 py-3 text-center">
                          {empStatus ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${empChip}`}>{empStatus}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600 max-w-[200px]">
                          <span className="line-clamp-3">{item.employeeComment || <span className="text-gray-300">—</span>}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {mgrStatus ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${mgrChip}`}>{mgrStatus}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3 text-sm text-gray-600 max-w-[200px]">
                          <span className="line-clamp-3">{item.managerComment || <span className="text-gray-300">—</span>}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200">
                    <td colSpan={2} className="px-3 py-2.5 text-xs font-bold text-gray-600 uppercase">Total</td>
                    <td className="px-3 py-2.5 text-center font-mono font-bold text-gray-800">{totalWt.toFixed(2)}%</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── List view ────────────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',      label: 'All' },
  { key: 'ready',    label: 'Ready for Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'pending',  label: 'Pending' },
];

function WorkbenchList() {
  const navigate = useNavigate();
  const [fy, setFy]               = useState(getCurrentFinancialYear());
  const [quarter, setQuarter]     = useState('Q1');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeFilter, setActiveFilter]     = useState('all');
  const [search, setSearch]                 = useState('');
  const [filterManager, setFilterManager]   = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [sortBy, setSortBy]                 = useState('name');
  const [managers, setManagers]             = useState([]);
  const [teamMemberIds, setTeamMemberIds]   = useState(null); // null = no manager selected, Set = filtered

  // Per-employee FA override state: { [empId]: { score: string, comment: string, submitting: bool, error: string } }
  const [faState, setFaState] = useState({});

  // Drill-down: { assignmentId, empName, monthLabel } | null
  const [drillDown, setDrillDown] = useState(null);

  // Load managers once on mount — separate reliable API call (role='manager')
  useEffect(() => {
    getUsersApi({ role: 'manager', isActive: 'true', limit: 200 })
      .then((r) => setManagers(r.data.data || []))
      .catch(() => setManagers([]));
  }, []);

  useEffect(() => { fetchData(); }, [fy, quarter]);

  // When manager selected → fetch their team members to get reliable IDs
  useEffect(() => {
    if (!filterManager) { setTeamMemberIds(null); setFilterEmployee(''); return; }
    getTeamApi(filterManager)
      .then((r) => {
        const members = r.data.data || [];
        // renameIdsForClient renames id → _id; support both
        const ids = new Set(members.map((m) => m._id || m.id).filter(Boolean));
        // Also include the manager themselves
        ids.add(filterManager);
        setTeamMemberIds(ids);
        setFilterEmployee('');
      })
      .catch(() => { setTeamMemberIds(new Set()); setFilterEmployee(''); });
  }, [filterManager]);

  const fetchData = async () => {
    setLoading(true);
    setFaState({});
    setSearch('');
    setFilterManager('');
    setFilterEmployee('');
    setTeamMemberIds(null);
    try {
      const res = await getDeptQuarterlyStatusApi({ financialYear: fy, quarter });
      const d = res.data.data;
      setData(d);
      // Pre-fill FA score from sum of monthly earned weightages (M1+M2+M3)
      const initial = {};
      (d.employees || []).forEach((e) => {
        const id = e.employee?._id || e.employee?.id || e._id || e.id;
        const mt = e.monthTotals || {};
        const months = Object.keys(mt);
        const calcEarned = months.reduce((s, m) => s + parseFloat(mt[m]?.earned || 0), 0);
        initial[id] = {
          score:      (calcEarned > 0 || e.quarterlyApproval) ? String(Math.round(calcEarned)) : '',
          comment:    '',
          submitting: false,
          error:      null,
        };
      });
      setFaState(initial);
    } catch { /* handled by empty state */ }
    finally { setLoading(false); }
  };

  const setEmpField = (empId, field, value) =>
    setFaState((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));

  const handleApprove = async (emp) => {
    const empId = emp.employee?._id || emp.employee?.id || emp._id || emp.id;
    const st    = faState[empId] || {};
    // Calc earned = sum of monthly earned weightages
    const mt = emp.monthTotals || {};
    const calcEarned = Object.keys(mt).reduce((s, m) => s + parseFloat(mt[m]?.earned || 0), 0);
    const faEarned   = parseFloat(st.score);
    const scoreChanged = !isNaN(faEarned) && Math.abs(faEarned - calcEarned) > 0.001;

    if (!st.score) { setEmpField(empId, 'error', 'FA Final Score is required'); return; }
    if (scoreChanged && !st.comment?.trim()) { setEmpField(empId, 'error', 'Comment required when score differs from calculated'); return; }

    setEmpField(empId, 'submitting', true);
    setEmpField(empId, 'error', null);
    try {
      // Init the approval record (creates/refreshes items) then submit
      const initRes = await initQuarterlyApprovalApi(empId, fy, quarter);
      const approvalId = initRes.data.data?.id;
      await submitQuarterlyApprovalApi(approvalId, {
        overrideEarned:  faEarned,          // raw weightage sum (M1+M2+M3)
        overrideComment: st.comment?.trim() || undefined,
      });
      await fetchData();
    } catch (e) {
      setEmpField(empId, 'error', e.response?.data?.error?.message || 'Submission failed');
      setEmpField(empId, 'submitting', false);
    }
  };

  const allEmployees = data?.employees || [];
  const qMonths      = QUARTER_MONTHS[quarter] || [];

  // Quarterly possible is the same for all employees (same KPI template)
  const quarterlyPossible = (() => {
    // Find first employee that has monthTotals populated
    const emp = allEmployees.find((e) => Object.keys(e.monthTotals || {}).length > 0);
    const mt = emp?.monthTotals || {};
    const total = Object.keys(mt).reduce((s, m) => s + parseFloat(mt[m]?.possible || 0), 0);
    return total > 0 ? Math.round(total).toString() : null;
  })();

  const readyCount    = allEmployees.filter((e) => e.allMonthsReviewed && e.quarterlyApproval?.status !== 'approved').length;
  const approvedCount = allEmployees.filter((e) => e.quarterlyApproval?.status === 'approved').length;

  const pendingCount = allEmployees.filter((e) => !e.allMonthsReviewed).length;

  // All managers from API — getUsersApi renames id → _id via renameIdsForClient
  const activeManagerOptions = useMemo(() => {
    return [...managers].sort((a, b) => a.name.localeCompare(b.name));
  }, [managers]);

  // Cascaded employee list — uses teamMemberIds fetched from getTeamApi (reliable)
  const employeeOptions = useMemo(() => {
    const getEmpId = (e) => e.employee?._id || e.employee?.id || e._id || e.id;
    if (!teamMemberIds) {
      // No manager selected — show all employees
      return allEmployees
        .map((e) => ({ id: getEmpId(e), name: e.employee?.name || e.name }))
        .filter((e) => e.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    // Manager selected — show only team members (teamMemberIds includes manager themselves)
    return allEmployees
      .filter((e) => teamMemberIds.has(getEmpId(e)))
      .map((e) => ({ id: getEmpId(e), name: e.employee?.name || e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, teamMemberIds]);

  const employees = useMemo(() => {
    let list = [...allEmployees];

    // Status tab filter
    if (activeFilter === 'ready')    list = list.filter((e) => e.allMonthsReviewed && e.quarterlyApproval?.status !== 'approved');
    if (activeFilter === 'approved') list = list.filter((e) => e.quarterlyApproval?.status === 'approved');
    if (activeFilter === 'pending')  list = list.filter((e) => !e.allMonthsReviewed);

    // Search by name
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => {
        const name = (e.employee?.name || e.name || '').toLowerCase();
        const code = (e.employee?.employeeCode || e.employeeCode || '').toLowerCase();
        return name.includes(q) || code.includes(q);
      });
    }

    // Manager/Team filter — uses teamMemberIds from getTeamApi (reliable, not DB managerId field)
    if (teamMemberIds) {
      list = list.filter((e) => {
        const empId = e.employee?._id || e.employee?.id || e._id || e.id;
        return teamMemberIds.has(empId);
      });
    }

    // Individual employee filter (cascades from manager selection)
    if (filterEmployee) {
      list = list.filter((e) => {
        const empId = e.employee?._id || e.employee?.id || e._id || e.id;
        return empId === filterEmployee;
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === 'name') {
        return (a.employee?.name || a.name || '').localeCompare(b.employee?.name || b.name || '');
      }
      if (sortBy === 'score_desc' || sortBy === 'score_asc') {
        const getMt = (e) => e.monthTotals || {};
        const getEarned = (e) => Object.keys(getMt(e)).reduce((s, m) => s + parseFloat(getMt(e)[m]?.earned || 0), 0);
        const diff = getEarned(b) - getEarned(a);
        return sortBy === 'score_desc' ? diff : -diff;
      }
      if (sortBy === 'status') {
        const rank = (e) => e.quarterlyApproval?.status === 'approved' ? 0 : e.allMonthsReviewed ? 1 : 2;
        return rank(a) - rank(b);
      }
      return 0;
    });

    return list;
  }, [allEmployees, activeFilter, search, teamMemberIds, filterEmployee, sortBy]);

  const TAB_COUNTS = {
    all:      allEmployees.length,
    ready:    readyCount,
    approved: approvedCount,
    pending:  pendingCount,
  };
  const TAB_STYLES = {
    all:      { active: 'border-gray-700 text-gray-800',     badge: 'bg-gray-100 text-gray-700' },
    ready:    { active: 'border-emerald-600 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    approved: { active: 'border-blue-600 text-blue-700',      badge: 'bg-blue-100 text-blue-700' },
    pending:  { active: 'border-amber-500 text-amber-700',    badge: 'bg-amber-100 text-amber-700' },
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Workbench</h1>
          <p className="text-sm text-gray-400 mt-0.5">Quarterly KPI review &amp; final approval</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={fy} onChange={(e) => setFy(e.target.value)} className="input-field text-sm w-28">
            {['2024-25', '2025-26', '2026-27'].map((y) => <option key={y}>{y}</option>)}
          </select>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className="input-field text-sm w-20">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <option key={q}>{q}</option>)}
          </select>
          <button onClick={fetchData} title="Refresh" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <HiOutlineRefresh className="h-5 w-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* ── Quarter completion banner ── */}
      {data && data.totalEmployees > 0 && (
        <div className={`px-4 py-2.5 rounded-lg border text-sm flex items-center justify-between ${
          data.isQuarterComplete
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <div className="flex items-center gap-2">
            {data.isQuarterComplete
              ? <><HiOutlineCheckCircle className="w-4 h-4 shrink-0" /><span>All <strong>{data.totalEmployees}</strong> employees approved — {quarter} {fy} complete ✓</span></>
              : <><HiOutlineExclamation className="w-4 h-4 shrink-0" /><span><strong>{data.approvedCount}</strong> of <strong>{data.totalEmployees}</strong> approved · <strong>{data.pendingCount}</strong> remaining</span></>
            }
          </div>
          {!data.isQuarterComplete && (
            <div className="w-32 bg-blue-200 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((data.approvedCount / data.totalEmployees) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {/* ── Filter bar ── */}
      {!loading && (
        <div className="card p-3 space-y-3">
          {/* Status tabs */}
          <div className="flex gap-1 border-b border-gray-100 pb-3">
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.key;
              const s = TAB_STYLES[tab.key];
              return (
                <button key={tab.key} onClick={() => setActiveFilter(tab.key)}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-3 transition-colors flex items-center gap-1.5 ${
                    isActive ? s.active : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                  }`}>
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActive ? s.badge : 'bg-gray-100 text-gray-400'}`}>
                    {TAB_COUNTS[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-3 flex-wrap">

            {/* Search by name */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Search</label>
              <div className="relative">
                <HiOutlineSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or code…"
                  className="pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-400 w-40"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <HiOutlineX className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <span className="text-gray-300 text-lg hidden sm:block">›</span>

            {/* Manager / Team dropdown — fetched from API by role='manager' */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap flex items-center gap-1">
                <HiOutlineUserGroup className="w-3.5 h-3.5" /> Manager / Team
              </label>
              <select
                value={filterManager}
                onChange={(e) => { setFilterManager(e.target.value); setFilterEmployee(''); }}
                className="input-field text-sm py-1.5 w-48"
              >
                <option value="">— All Managers —</option>
                {activeManagerOptions.map((m) => (
                  <option key={m._id} value={m._id}>{m.name}</option>
                ))}
              </select>
            </div>

            <span className="text-gray-300 text-lg hidden sm:block">›</span>

            {/* Employee dropdown — cascades from manager selection */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Employee</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="input-field text-sm py-1.5 w-52"
              >
                <option value="">
                  {filterManager
                    ? `— All in team (${employeeOptions.length}) —`
                    : '— All Employees —'}
                </option>
                {employeeOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>

            <span className="text-gray-300 text-lg hidden sm:block">›</span>

            {/* Sort by */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Sort By</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="input-field text-sm py-1.5 w-36">
                <option value="name">Name (A–Z)</option>
                <option value="score_desc">Score (High–Low)</option>
                <option value="score_asc">Score (Low–High)</option>
                <option value="status">Status</option>
              </select>
            </div>

            {/* Result count + clear */}
            <div className="ml-auto flex items-center gap-3">
              {(search || filterManager || filterEmployee) && (
                <button
                  onClick={() => { setSearch(''); setFilterManager(''); setFilterEmployee(''); }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 whitespace-nowrap"
                >
                  <HiOutlineX className="w-3 h-3" /> Clear filters
                </button>
              )}
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {employees.length} of {allEmployees.length} employees
              </span>
            </div>

          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {activeFilter === 'ready'
            ? 'No employees ready for quarterly review yet — all 3 months must be manager-reviewed first.'
            : activeFilter === 'approved' ? 'No approvals submitted for this quarter yet.'
            : 'No employees with KPI assignments for this quarter.'}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {/* Row 1: fixed cols span both rows; Q1 group spans month cols only */}
                <tr className="border-b border-gray-100">
                  <th rowSpan={2} className="text-left px-4 py-3 sticky left-0 bg-gray-50 z-10 border-b border-gray-200">#</th>
                  <th rowSpan={2} className="text-left px-4 py-3 sticky left-8 bg-gray-50 z-10 min-w-[160px] border-b border-gray-200">Employee</th>
                  <th rowSpan={2} className="text-center px-2 py-3 w-14 border-b border-gray-200 bg-gray-50">
                  </th>
                  <th colSpan={qMonths.length} className="text-center px-3 py-1.5 bg-indigo-50 border-b-2 border-indigo-300">
                    <span className="font-bold text-indigo-700 tracking-widest">{quarter}</span>
                    {quarterlyPossible && (
                      <span className="ml-1 font-semibold normal-case text-indigo-600 text-[12px]">({quarterlyPossible})</span>
                    )}
                  </th>
                  <th rowSpan={2} className="text-center px-3 py-3 min-w-[110px] bg-blue-50 text-blue-700 border-b border-gray-200">
                    Calc. Quarterly<br /><span className="normal-case font-normal text-blue-400">System</span>
                  </th>
                  <th rowSpan={2} className="text-center px-3 py-3 min-w-[120px] bg-cyan-50 text-cyan-700 border-b border-gray-200">
                    FA Final Score<br /><span className="normal-case font-normal text-cyan-400">Your decision</span>
                  </th>
                  <th rowSpan={2} className="text-center px-3 py-3 min-w-[200px] border-b border-gray-200">Comment</th>
                  <th rowSpan={2} className="text-center px-3 py-3 min-w-[140px] border-b border-gray-200">Action</th>
                </tr>
                {/* Row 2: month names only */}
                <tr className="border-b border-gray-200">
                  {qMonths.map((m) => (
                    <th key={m} className="text-center px-3 py-2 min-w-[110px] bg-indigo-50/40">
                      {monthName(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              {employees.map((emp, idx) => {
                  const empId      = emp.employee?._id || emp.employee?.id || emp._id || emp.id;
                  const empName    = emp.employee?.name || emp.name;
                  const empCode    = emp.employee?.employeeCode || emp.employeeCode;
                  const isApproved = emp.quarterlyApproval?.status === 'approved';
                  const mt           = emp.monthTotals || {};
                  // Calc Quarterly possible = sum of monthly possible (8.31 × 3 = 24.93) — same for all employees
                  const calcPossible = Object.keys(mt).reduce((s, m) => s + parseFloat(mt[m]?.possible || 0), 0);
                  // Earned sum — used to pre-fill FA Final Score
                  const calcEarned   = Object.keys(mt).reduce((s, m) => s + parseFloat(mt[m]?.earned || 0), 0);
                  const faScore         = parseFloat(emp.quarterlyApproval?.quarterlyScore ?? 0);
                  const st              = faState[empId] || {};
                  const inputEarned     = parseFloat(st.score);
                  const roundedCalc     = Math.round(calcEarned);
                  const roundedInput    = !isNaN(inputEarned) ? Math.round(inputEarned) : NaN;
                  const scoreChanged    = !isNaN(roundedInput) && roundedInput !== roundedCalc;

                  const rowBgClass = isApproved ? 'bg-emerald-50/40' : emp.allMonthsReviewed ? 'bg-amber-50/20' : '';

                  const quarterlyEarnedPct = (() => {
                    const roundedPossible = Math.round(calcPossible);
                    if (roundedPossible <= 0) return null;
                    const earnedRaw = isApproved
                      ? faScore
                      : (!isNaN(inputEarned) ? inputEarned : calcEarned);
                    if (earnedRaw == null || isNaN(earnedRaw)) return null;
                    const roundedEarned = Math.round(earnedRaw);
                    return Math.round((roundedEarned / roundedPossible) * 100);
                  })();

                  return (
                    <tbody key={empId} className={`border-b border-gray-200 ${rowBgClass}`}>
                      {/* ── Row 1: EARNED (bold, larger) ── */}
                      <tr className="align-middle">
                        {/* # — rowspan 2 */}
                        <td rowSpan={2} className="px-4 text-xs text-gray-400 sticky left-0 bg-inherit text-center">{idx + 1}</td>

                        {/* Employee — rowspan 2 */}
                        <td rowSpan={2} className="px-4 py-2 sticky left-8 bg-inherit">
                          <button
                            onClick={() => navigate(`/final-approver/workbench/${empId}/${fy}/${quarter}`)}
                            className="text-left hover:underline"
                          >
                            <div className="font-semibold text-gray-900 text-sm">{empName}</div>
                            <div className="text-xs text-gray-400">{empCode}</div>
                          </button>
                        </td>

                        {/* Row label — Earn */}
                        <td className="px-2 pt-2 pb-0.5 text-center">
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-green-100 text-green-700">
                            Earn
                          </span>
                        </td>


                        {/* M1/M2/M3 — EARNED (row 1: bold + bigger, clickable drill-down) */}
                        {qMonths.map((m) => {
                          const monthData    = emp.monthTotals?.[m];
                          const earned       = monthData?.earned ?? null;
                          const ev           = parseFloat(earned);
                          const assignmentId = emp.assignmentIds?.[m];
                          const hasData      = earned != null;
                          return (
                            <td key={m} className="px-3 pt-2 pb-0.5 text-center">
                              {hasData && assignmentId ? (
                                <button
                                  type="button"
                                  title={`View ${empName} KPI details for ${monthName(m)}`}
                                  onClick={() => setDrillDown({ assignmentId, empName, monthLabel: `${monthName(m)} ${fy}` })}
                                  className={`text-base font-extrabold font-mono underline decoration-dotted underline-offset-2 cursor-pointer hover:opacity-75 transition-opacity ${
                                    ev > 0 ? 'text-green-600' : ev < 0 ? 'text-red-600' : 'text-amber-600'
                                  }`}
                                >
                                  {fmt(earned, 2)}
                                </button>
                              ) : (
                                <span className={`text-base font-extrabold font-mono ${
                                  hasData ? (ev > 0 ? 'text-green-600' : ev < 0 ? 'text-red-600' : 'text-amber-600') : 'text-gray-300'
                                }`}>
                                  {hasData ? fmt(earned, 2) : '—'}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {/* Calc. Quarterly earned — rowspan 2 */}
                        <td rowSpan={2} className="px-3 text-center bg-blue-50/50">
                          {calcPossible > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1">
                                <span className="text-base font-extrabold font-mono text-blue-800">
                                  {Math.round(calcEarned)}
                                </span>
                                <HiOutlineLockClosed className="w-3 h-3 text-gray-300" />
                              </div>
                              {(() => {
                                const roundedEarned   = Math.round(calcEarned);
                                const roundedPossible = Math.round(calcPossible);
                                const pct = roundedPossible > 0 ? (roundedEarned / roundedPossible) * 100 : 0;
                                return (
                                  <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                                    pct >= 100 ? 'bg-green-100 text-green-700'
                                    : pct >= 70 ? 'bg-blue-100 text-blue-700'
                                    : 'bg-amber-100 text-amber-700'
                                  }`}>{Math.round(pct)}%</span>
                                );
                              })()}
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>

                        {/* FA Final Score — rowspan 2 */}
                        {/* FA Final Score + Quarterly Earned % below */}
                        <td rowSpan={2} className="px-3 text-center bg-cyan-50/40">
                          {isApproved ? (
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-base font-extrabold font-mono text-emerald-700">{Math.round(faScore)}</span>
                              {quarterlyEarnedPct != null && (
                                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                                  quarterlyEarnedPct >= 100 ? 'bg-green-100 text-green-700' : quarterlyEarnedPct >= 70 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>{quarterlyEarnedPct}%</span>
                              )}
                            </div>
                          ) : emp.allMonthsReviewed ? (
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number" step="1" min="0"
                                value={st.score || ''}
                                onChange={(e) => setEmpField(empId, 'score', e.target.value)}
                                className={`w-24 text-center text-base font-extrabold font-mono border-2 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 ${
                                  scoreChanged
                                    ? 'border-amber-400 ring-amber-200 bg-amber-50'
                                    : 'border-cyan-400 ring-cyan-200 bg-cyan-50'
                                }`}
                                placeholder="0"
                              />
                              {quarterlyEarnedPct != null && (
                                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
                                  quarterlyEarnedPct >= 100 ? 'bg-green-100 text-green-700' : quarterlyEarnedPct >= 70 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>{quarterlyEarnedPct}%</span>
                              )}
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>

                        {/* Comment — rowspan 2 */}
                        <td rowSpan={2} className="px-3 py-2">
                          {isApproved ? (
                            <span className="text-xs text-gray-400 italic">—</span>
                          ) : emp.allMonthsReviewed ? (
                            <div>
                              <input
                                type="text"
                                value={st.comment || ''}
                                onChange={(e) => setEmpField(empId, 'comment', e.target.value)}
                                placeholder={scoreChanged ? 'Required — score overridden' : 'Optional comment'}
                                className={`w-full text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 ${
                                  scoreChanged && !st.comment?.trim()
                                    ? 'border-red-400 ring-red-200 bg-red-50'
                                    : 'border-gray-200 focus:ring-cyan-400'
                                }`}
                              />
                              {st.error && <p className="text-xs text-red-500 mt-0.5">{st.error}</p>}
                            </div>
                          ) : <span className="text-xs text-gray-400">—</span>}
                        </td>

                        {/* Action — rowspan 2 */}
                        <td rowSpan={2} className="px-3 py-2 text-center">
                          {isApproved ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                                <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600" />
                              </div>
                              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Approved</span>
                            </div>
                          ) : emp.allMonthsReviewed ? (
                            <button
                              onClick={() => handleApprove(emp)}
                              disabled={st.submitting}
                              title="Approve & Submit"
                              className="group inline-flex flex-col items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <div className="w-9 h-9 rounded-lg bg-emerald-600 group-hover:bg-emerald-700 group-active:scale-95 flex items-center justify-center transition-all duration-150 shadow-sm group-hover:shadow-md">
                                {st.submitting
                                  ? <LoadingSpinner size="sm" />
                                  : <HiOutlineCheckCircle className="w-5 h-5 text-white" />}
                              </div>
                              <span className="text-[10px] font-semibold text-emerald-600 group-hover:text-emerald-700 uppercase tracking-wide transition-colors">Submit</span>
                            </button>
                          ) : (
                            <div className="inline-flex flex-col items-center gap-1">
                              <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-gray-400">{emp.readyCount}/{qMonths.length}</span>
                              </div>
                              <span className="text-[10px] text-gray-400 uppercase tracking-wide">Pending</span>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* ── Row 2: POSSIBLE (smaller, muted) ── */}
                      <tr className="align-middle border-t border-gray-100">
                        {/* Row label — Max */}
                        <td className="px-2 pb-2 pt-0.5 text-center">
                          <span className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-gray-100 text-gray-400">
                            Max
                          </span>
                        </td>
                        {qMonths.map((m) => {
                          const monthData = emp.monthTotals?.[m];
                          const possible  = monthData?.possible ?? null;
                          return (
                            <td key={m} className="px-3 pb-2 pt-0.5 text-center">
                              <span className="text-xs text-gray-400 font-mono">
                                {possible != null ? fmt(possible, 2) + '%' : '—'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  );
                })}
            </table>
          </div>
        </div>
      )}

      {/* KPI Drill-down modal */}
      {drillDown && (
        <KpiDrillDownModal
          assignmentId={drillDown.assignmentId}
          empName={drillDown.empName}
          monthLabel={drillDown.monthLabel}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

// ── Detail view (workbench for one employee) ─────────────────────────────────
function WorkbenchDetail({ employeeId, fy, quarter }) {
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approval, setApproval]   = useState(null);
  const [activeHead, setActiveHead] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]         = useState(null);
  const [submitError, setSubmitError] = useState(null);

  // Consolidated FA override — single score + comment (not per-KPI)
  const [overrideScore, setOverrideScore]     = useState('');
  const [overrideComment, setOverrideComment] = useState('');

  const qMonths = QUARTER_MONTHS[quarter] || [];

  useEffect(() => { initialise(); }, [employeeId, fy, quarter]);

  const initialise = async () => {
    setLoading(true);
    setError(null);
    try {
      const initRes  = await initQuarterlyApprovalApi(employeeId, fy, quarter);
      const approvalId = initRes.data.data?.id;
      const fullRes  = await getQuarterlyApprovalApi(approvalId);
      const a = fullRes.data.data;
      setApproval(a);

      // Pre-fill override score from existing quarterlyScore (or calculated)
      const base = a.quarterlyScore ?? a.calculatedQuarterlyScore ?? '';
      setOverrideScore(base !== '' ? parseFloat(base).toFixed(2) : '');
      setOverrideComment('');

      const heads = HEAD_ORDER.filter((h) => (a.items || []).some((i) => i.kpiHead === h));
      setActiveHead(heads[0] || null);
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Failed to load approval data.');
    } finally {
      setLoading(false);
    }
  };

  const heads = useMemo(() => {
    if (!approval?.items) return [];
    return HEAD_ORDER.filter((h) => approval.items.some((i) => i.kpiHead === h));
  }, [approval]);

  const activeItems = useMemo(() => {
    if (!approval?.items) return [];
    return approval.items.filter((i) => i.kpiHead === activeHead);
  }, [approval, activeHead]);

  const calculatedScore = parseFloat(approval?.calculatedQuarterlyScore);
  const overrideVal     = parseFloat(overrideScore);
  const scoreChanged    = !isNaN(overrideVal) && !isNaN(calculatedScore) && Math.abs(overrideVal - calculatedScore) > 0.001;
  const needsComment    = scoreChanged && !overrideComment.trim();
  const canSubmit       = overrideScore !== '' && !needsComment;

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitQuarterlyApprovalApi(approval.id, {
        overrideScore:   parseFloat(overrideScore),
        overrideComment: overrideComment.trim() || undefined,
      });
      setShowConfirm(false);
      navigate('/final-approver/workbench');
    } catch (e) {
      setSubmitError(e.response?.data?.error?.message || 'Failed to submit approval');
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (error)   return <div className="text-center py-16 text-red-500">{error}</div>;
  if (!approval) return null;

  const isApproved = approval.status === 'approved';
  const employee   = approval.employee;
  const finalScore = isApproved ? parseFloat(approval.quarterlyScore) : null;

  return (
    <div className="space-y-5 pb-48">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/final-approver/workbench')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <HiOutlineArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {employee?.name} — {quarter} {fy}
          </h1>
          <p className="text-sm text-gray-500">
            {qMonths.map(monthName).join(' / ')} · {employee?.department?.name}
          </p>
        </div>
        {isApproved && (
          <span className="ml-auto px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-semibold flex items-center gap-1">
            <HiOutlineCheckCircle className="h-4 w-4" /> Approved
          </span>
        )}
      </div>

      {/* Multipliers info */}
      {approval.scoringConfig && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500 flex gap-4">
          <span className="font-medium text-gray-700">Multipliers used:</span>
          <span className="text-amber-700">Below = {approval.scoringConfig.belowMultiplier}</span>
          <span className="text-blue-700">Meets = {approval.scoringConfig.meetsMultiplier}</span>
          <span className="text-green-700">Exceeds = {approval.scoringConfig.exceedsMultiplier}</span>
        </div>
      )}

      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <HiOutlineExclamation className="w-4 h-4 flex-shrink-0" />
          {submitError}
        </div>
      )}

      {/* KPI Head Tabs */}
      {heads.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200">
          {heads.map((h) => (
            <button
              key={h}
              onClick={() => setActiveHead(h)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeHead === h
                  ? 'border-cyan-600 text-cyan-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {KPI_HEAD_LABELS?.[h] || h}
            </button>
          ))}
        </div>
      )}

      {/* Read-only KPI table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase">
                <th className="text-left px-4 py-3 min-w-[220px]">KPI Item</th>
                <th className="text-center px-3 py-3 min-w-[70px]">WT%</th>
                <th className="text-center px-3 py-3 min-w-[90px] text-violet-600">Monthly<br />WT%</th>
                {qMonths.map((m, i) => (
                  <th key={m} className="text-center px-3 py-3 min-w-[120px]">
                    M{i + 1} — {monthName(m)}<br />
                    <span className="normal-case font-normal text-gray-400">Status · Achieved</span>
                  </th>
                ))}
                <th className="text-center px-3 py-3 min-w-[130px] bg-blue-50 text-blue-700">
                  Calc. Quarterly<br />
                  <span className="normal-case font-normal text-blue-500">System (locked)</span>
                </th>
                <th className="text-center px-3 py-3 min-w-[110px]">Max Quarterly</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeItems.map((item) => {
                const calcActual = parseFloat(item.calculatedQuarterlyActual ?? 0);
                return (
                  <tr key={item.id} className={rowBg(item.calculatedQuarterlyActual)}>
                    {/* KPI title */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 text-sm">{item.kpiTitle}</div>
                      {isApproved && item.finalComment && (
                        <div className="text-xs text-gray-400 mt-0.5 italic">"{item.finalComment}"</div>
                      )}
                    </td>

                    {/* WT% — yearly (quarterlyWt × 4 avoids float precision from monthly×12) */}
                    <td className="px-3 py-3 text-center text-sm font-semibold text-gray-700">
                      {fmt(parseFloat(item.quarterlyWeightage) * 4, 2)}%
                    </td>
                    {/* Monthly WT% = yearly ÷ 12, stored directly */}
                    <td className="px-3 py-3 text-center text-sm font-bold text-violet-600">
                      {fmt(item.monthlyWeightage, 2)}%
                    </td>

                    {/* M1 / M2 / M3 — status badge + achieved weightage */}
                    {[1, 2, 3].map((n) => {
                      const status = item[`month${n}_managerStatus`];
                      const actual = item[`month${n}_actual`];
                      const actVal = parseFloat(actual);
                      return (
                        <td key={n} className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {status ? (
                              <StatusBadge status={`submission_${status.toLowerCase()}`} />
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                            <span className={`text-sm font-bold font-mono ${
                              actVal > 0 ? 'text-green-600' :
                              actVal < 0 ? 'text-red-600' : 'text-amber-600'
                            }`}>
                              {fmt(actual, 2)}
                            </span>
                          </div>
                        </td>
                      );
                    })}

                    {/* Calculated Quarterly — LOCKED */}
                    <td className="px-3 py-3 text-center bg-blue-50/60">
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-base font-bold font-mono ${
                          calcActual > 0 ? 'text-green-700' :
                          calcActual < 0 ? 'text-red-700' : 'text-amber-700'
                        }`}>
                          {fmt(item.calculatedQuarterlyActual, 2)}
                        </span>
                        <HiOutlineLockClosed className="w-3 h-3 text-gray-400" />
                      </div>
                    </td>

                    {/* Max quarterly (stored as yearlyWt÷4) */}
                    <td className="px-3 py-3 text-center text-xs text-gray-400 font-mono">
                      {fmt(item.quarterlyWeightage, 2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky footer — consolidated FA decision */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-start justify-between gap-8">

            {/* Left — scores */}
            <div className="flex items-center gap-8 flex-shrink-0">
              <div className="text-center">
                <div className="text-xs text-gray-400 mb-0.5">System Calculated Score</div>
                <div className="text-2xl font-bold text-blue-700 font-mono flex items-center gap-1">
                  {!isNaN(calculatedScore) ? `${calculatedScore.toFixed(2)}%` : '—'}
                  <HiOutlineLockClosed className="w-4 h-4 text-gray-400" />
                </div>
                <div className="text-xs text-gray-400">From manager statuses</div>
              </div>

              <div className="w-px h-12 bg-gray-200" />

              {isApproved ? (
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-0.5">FA Approved Score</div>
                  <div className="text-2xl font-bold text-emerald-700 font-mono">
                    {!isNaN(finalScore) ? `${finalScore.toFixed(2)}%` : '—'}
                  </div>
                  <div className="text-xs text-emerald-500">Final · Used for PLI payout</div>
                </div>
              ) : (
                <div>
                  <div className="text-xs text-gray-500 mb-1 font-medium">
                    FA Final Score
                    {scoreChanged && (
                      <span className="ml-2 text-amber-600 font-normal">← overriding system score</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={overrideScore}
                    onChange={(e) => setOverrideScore(e.target.value)}
                    className={`w-32 text-center text-lg font-bold font-mono border-2 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 ${
                      needsComment
                        ? 'border-red-400 ring-red-200 bg-red-50'
                        : scoreChanged
                        ? 'border-amber-400 ring-amber-200 bg-amber-50'
                        : 'border-cyan-400 ring-cyan-200 bg-cyan-50'
                    }`}
                    placeholder={!isNaN(calculatedScore) ? calculatedScore.toFixed(2) : '0.00'}
                  />
                  <div className="text-xs text-gray-400 mt-0.5 text-center">Used for PLI payout</div>
                </div>
              )}
            </div>

            {/* Middle — override comment (only shown when score changed) */}
            {!isApproved && scoreChanged && (
              <div className="flex-1 max-w-sm">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Override Reason <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(required when score differs from calculated)</span>
                </label>
                <textarea
                  rows={2}
                  value={overrideComment}
                  onChange={(e) => setOverrideComment(e.target.value)}
                  placeholder="Explain why the score differs from the system-calculated value…"
                  className={`w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 ${
                    needsComment
                      ? 'border-red-400 ring-red-200 bg-red-50'
                      : 'border-amber-300 ring-amber-200 focus:ring-amber-400'
                  }`}
                />
                {needsComment && (
                  <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                    <HiOutlineExclamation className="w-3.5 h-3.5" /> Comment is required
                  </p>
                )}
              </div>
            )}

            {/* Right — action */}
            {!isApproved && (
              <div className="flex items-center gap-3 flex-shrink-0 self-center">
                <button onClick={initialise} className="btn-secondary text-sm">
                  Reload
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={!canSubmit || submitting}
                  className={`btn-success text-sm flex items-center gap-2 px-5 py-2.5 ${
                    !canSubmit ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <HiOutlineCheckCircle className="h-5 w-5" />
                  Approve &amp; Submit →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        title={`Submit Quarterly Approval — ${employee?.name} · ${quarter} ${fy}`}
        message={
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">System Calculated Score:</span>
              <strong className="text-blue-700 font-mono">{!isNaN(calculatedScore) ? `${calculatedScore.toFixed(2)}%` : '—'}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">FA Final Score (PLI payout):</span>
              <strong className="text-cyan-700 font-mono text-base">{overrideScore ? `${parseFloat(overrideScore).toFixed(2)}%` : '—'}</strong>
            </div>
            {scoreChanged && overrideComment && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-medium">Override reason:</span> {overrideComment}
              </div>
            )}
            <p className="text-gray-400 text-xs border-t pt-2">
              This will move all {qMonths.length} monthly KPI assignments to Final Approved status. This action cannot be undone.
            </p>
          </div>
        }
        confirmLabel="Confirm Approval →"
        onConfirm={handleSubmit}
        onCancel={() => setShowConfirm(false)}
        loading={submitting}
      />
    </div>
  );
}

// ── Main component — list or detail based on URL params ───────────────────────
export default function FinalApprovalWorkbench() {
  const { employeeId, fy, quarter } = useParams();
  if (employeeId && fy && quarter) {
    return <WorkbenchDetail employeeId={employeeId} fy={fy} quarter={quarter} />;
  }
  return <WorkbenchList />;
}
