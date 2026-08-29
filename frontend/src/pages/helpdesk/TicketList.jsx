/**
 * TicketList.jsx
 * Helpdesk ticket list — visual layout mirrors Requests.jsx from the helpdesk app.
 * Backend wired to PLI Portal's Redux store (fetchTickets / setTicketsFilter) and
 * PLI API endpoints with lowercase status/priority ENUMs.
 */
import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  fetchTickets,
  setTicketsFilter,
  setTicketsPage,
  selectTickets,
  selectTicketsTotal,
  selectTicketsPage,
  selectTicketsFilters,
  selectTicketsLoading,
} from '../../store/helpdeskSlice';
import {
  getTicketsApi,
  bulkAssignApi,
  updateTicketApi,
  deleteTicketApi,
  bulkUploadTicketsApi,
} from '../../api/helpdesk/tickets.api';
import { getGroupsApi } from '../../api/helpdesk/groups.api';
import { getUsersApi } from '../../api/users.api';
import { getHdProjectsApi } from '../../api/helpdesk/hdProjects.api';
import { downloadHdImportTemplateApi } from '../../api/helpdesk/hdTemplate.api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineRefresh,
  HiOutlineDownload,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlineFilter,
  HiOutlineCalendar,
  HiDotsVertical,
  HiViewList,
  HiViewGrid,
  HiChevronDown,
  HiX,
} from 'react-icons/hi';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS   = ['open', 'in-progress', 'pending', 'resolved', 'closed'];
const PRIORITY_OPTIONS = ['critical', 'high', 'medium', 'low'];
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// Colors mapped to match original Requests.jsx palette (Title Case equivalents)
const STATUS_COLORS = {
  'open':        'bg-blue-100 text-blue-700',
  'in-progress': 'bg-purple-100 text-purple-700',
  'pending':     'bg-yellow-100 text-yellow-700',
  'resolved':    'bg-orange-100 text-orange-700',
  'closed':      'bg-green-100 text-green-700',
};

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  low:      'bg-green-100 text-green-700 border-green-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert snake_case / kebab-case to Title Case */
const fmtLabel = (s) =>
  (s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Safely unwrap API response arrays ({data:{data:[...]}} | {data:[...]}) */
const unwrapList = (res) => {
  const d = res?.data;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d)) return d;
  return [];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TicketList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useSelector((s) => s.auth);

  // Redux state
  const tickets = useSelector(selectTickets);
  const total   = useSelector(selectTicketsTotal);
  const page    = useSelector(selectTicketsPage);
  const filters = useSelector(selectTicketsFilters);
  const loading = useSelector(selectTicketsLoading);

  // Local state
  const [pageSize, setPageSize] = useState(20);
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [viewMode, setViewMode] = useState('list');

  // Filter-dropdown datasets
  const [users,    setUsers]    = useState([]);
  const [projects, setProjects] = useState([]);
  const [groups,   setGroups]   = useState([]);

  // Row selection
  const [selected, setSelected] = useState([]);

  // Bulk assign modal
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [baGroupId,      setBaGroupId]      = useState('');
  const [baGroupUsers,   setBaGroupUsers]   = useState([]);
  const [baAgentId,      setBaAgentId]      = useState('');

  // Bulk upload modal
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile,       setBulkFile]       = useState(null);
  const [bulkUploading,  setBulkUploading]  = useState(false);
  const [bulkResult,     setBulkResult]     = useState(null);

  // Download dropdown
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [downloading,      setDownloading]      = useState(false);
  const downloadMenuRef = useRef(null);

  // Template download
  const [templateDownloading, setTemplateDownloading] = useState(false);
  const fileInputRef = useRef(null);

  // Operation states
  const [bulkAssigning,      setBulkAssigning]      = useState(false);
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false);
  const [refreshing,         setRefreshing]         = useState(false);
  const [opError,            setOpError]            = useState(null);
  const [loadError,          setLoadError]          = useState(false);

  // Permissions
  const roleNorm = (user?.role || '').toLowerCase().replace(/\s+/g, '_').trim();
  const canDelete =
    ['admin', 'manager', 'team_lead', 'teamlead', 'senior_manager', 'md'].includes(roleNorm) ||
    !!user?.permissions?.can_delete_tickets;

  // Derived pagination
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showFrom   = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo     = Math.min(page * pageSize, total);

  // Active filter check
  const hasActiveFilters =
    !!filters.search     ||
    !!filters.status     ||
    !!filters.priority   ||
    !!filters.assigneeId ||
    !!filters.projectId  ||
    !!filters.groupId;

  // -------------------------------------------------------------------------
  // Load tickets
  // -------------------------------------------------------------------------
  const load = useCallback(() => {
    setSelected([]);       // clear stale selection before fetching a new page
    setLoadError(false);
    dispatch(fetchTickets({ ...filters, page, pageSize }))
      .unwrap()
      .catch(() => setLoadError(true));
  }, [dispatch, filters, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  // Load filter-dropdown data once on mount.
  // getUsersApi requires admin/manager/senior_manager — skip for employee role to avoid 403.
  const canListUsers = ['admin', 'manager', 'senior_manager', 'hr_admin'].includes(user?.role);
  useEffect(() => {
    if (canListUsers) {
      getUsersApi().then(unwrapList).then(setUsers).catch(() => setUsers([]));
    }
    getHdProjectsApi().then(unwrapList).then(setProjects).catch(() => setProjects([]));
  }, [canListUsers]);

  // Load groups on mount for the group filter dropdown
  useEffect(() => {
    getGroupsApi().then(unwrapList).then(setGroups).catch(() => setGroups([]));
  }, []);

  // URL deep-linking: pre-populate filters from query params on first render
  useEffect(() => {
    const status     = searchParams.get('status');
    const priority   = searchParams.get('priority');
    const assigneeId = searchParams.get('assigneeId');
    const search     = searchParams.get('search');
    const toApply = {};
    if (status)     toApply.status     = status;
    if (priority)   toApply.priority   = priority;
    if (assigneeId) toApply.assigneeId = assigneeId;
    if (search)     toApply.search     = search;
    if (Object.keys(toApply).length) {
      dispatch(setTicketsFilter(toApply));
      if (search) setSearchInput(search);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search — dispatches filter update 400 ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        dispatch(setTicketsFilter({ search: searchInput }));
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear row selection whenever the ticket list changes
  useEffect(() => { setSelected([]); }, [tickets]);

  // Close download dropdown on outside click
  useEffect(() => {
    if (!showDownloadMenu) return;
    const onClick = (e) => {
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(e.target)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showDownloadMenu]);

  // -------------------------------------------------------------------------
  // Search — debounced 300 ms
  // -------------------------------------------------------------------------
  const handleSearchChange = (e) => setSearchInput(e.target.value);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    dispatch(setTicketsFilter({ search: searchInput }));
  };

  // -------------------------------------------------------------------------
  // Filter helpers
  // -------------------------------------------------------------------------
  const handleFilter = (key, value) => dispatch(setTicketsFilter({ [key]: value }));

  const clearFilters = () => {
    setSearchInput('');
    dispatch(setTicketsFilter({
      search:     '',
      status:     '',
      priority:   '',
      assigneeId: '',
      projectId:  '',
      groupId:    '',
    }));
  };

  // -------------------------------------------------------------------------
  // Manual refresh
  // -------------------------------------------------------------------------
  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchTickets({ ...filters, page, pageSize }));
    setRefreshing(false);
  };

  // -------------------------------------------------------------------------
  // Download tickets as CSV — paginated fetch, filtered by chosen status
  // -------------------------------------------------------------------------
  const handleDownloadTickets = async (chosenStatus = '') => {
    setShowDownloadMenu(false);
    setDownloading(true);
    try {
      const PAGE = 500;
      let pageNum = 1;
      const all = [];
      // Safety bound: 50 pages = 25 k tickets
      for (let i = 0; i < 50; i++) {
        const res = await getTicketsApi({
          ...filters,
          ...(chosenStatus ? { status: chosenStatus } : {}),
          pageSize: PAGE,
          page: pageNum,
        });
        const d = res?.data;
        const batch = Array.isArray(d?.data?.tickets) ? d.data.tickets
          : Array.isArray(d?.tickets)                 ? d.tickets
          : Array.isArray(d?.data)                    ? d.data
          : [];
        all.push(...batch);
        if (batch.length < PAGE) break;
        pageNum++;
      }

      if (all.length === 0) {
        alert(`No${chosenStatus ? ` "${fmtLabel(chosenStatus)}"` : ''} tickets found — nothing to download.`);
        return;
      }

      const cols = [
        { label: 'REQ#',            fn: (t) => t.req_number || t.reqNumber || t.ticket_id || `#${t.id}` },
        { label: 'Subject',         fn: (t) => t.title || t.subject || '' },
        { label: 'Status',          fn: (t) => fmtLabel(t.status) },
        { label: 'Priority',        fn: (t) => fmtLabel(t.priority) },
        { label: 'Category',        fn: (t) => t.category || '' },
        { label: 'Request Type',    fn: (t) => t.request_type || t.requestType || '' },
        { label: 'Mode',            fn: (t) => t.mode || '' },
        { label: 'Impact',          fn: (t) => t.impact || '' },
        { label: 'Urgency',         fn: (t) => t.urgency || '' },
        { label: 'Requester',       fn: (t) => t.requester?.name || t.requesterName || t.widgetName || '' },
        { label: 'Requester Email', fn: (t) => t.widget_email || t.requester_email || '' },
        { label: 'Site',            fn: (t) => t.site || '' },
        { label: 'Group',           fn: (t) => t.group?.name || t.groupName || '' },
        { label: 'Assignee',        fn: (t) => t.assigneeUser?.name || t.assignee?.name || t.assigneeName || '' },
        { label: 'Due Date',        fn: (t) => fmtDate(t.due_date || t.dueDate) },
        { label: 'Resolution',      fn: (t) => t.resolution || '' },
        { label: 'Created',         fn: (t) => fmtDate(t.created_at) },
        { label: 'Updated',         fn: (t) => fmtDate(t.updated_at) },
        { label: 'Closed',          fn: (t) => (t.status === 'closed' || t.status === 'resolved') && t.closed_at ? fmtDate(t.closed_at) : '' },
      ];

      const header  = cols.map((c) => c.label).join(',');
      const csvRows = all.map((t) => cols.map((c) => csvEscape(c.fn(t))).join(','));
      const csv     = '﻿' + [header, ...csvRows].join('\r\n'); // BOM for Excel UTF-8

      const stamp = new Date().toISOString().slice(0, 10);
      const tag   = chosenStatus ? chosenStatus.replace(/\s+/g, '-') : 'all';
      const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = `tickets-${tag}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed:', e);
      alert(`Download failed: ${e.message || 'Unknown error'}`);
    } finally {
      setDownloading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Bulk Upload (CSV import)
  // -------------------------------------------------------------------------
  const handleDownloadTemplate = async () => {
    setTemplateDownloading(true);
    try {
      await downloadHdImportTemplateApi();
    } catch {
      toast.error('Failed to download template');
    } finally {
      setTemplateDownloading(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    if (bulkFile.size > 2 * 1024 * 1024) {
      toast.error('File too large — maximum 2MB');
      return;
    }

    setBulkUploading(true);
    setBulkResult(null);
    try {
      let rows = [];

      if (bulkFile.name.endsWith('.xlsx') || bulkFile.name.endsWith('.xls')) {
        // xlsx parsing using SheetJS
        const buffer = await bulkFile.arrayBuffer();
        // Wrap in Uint8Array — sheet_to_json type:'array' expects Uint8Array, not ArrayBuffer
        const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        // Use the first sheet that is NOT a helper sheet (those start with '_')
        const sheetName = wb.SheetNames.find((n) => !n.startsWith('_') && n !== 'Valid Options') || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        // range:2 skips the header row (row 1) AND the example row (row 2) so
        // the template's sample data is never sent to the server as a real ticket.
        rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: 2 });
      } else {
        // CSV parsing
        const text = await bulkFile.text();
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) {
          setBulkResult({ created: 0, errors: [{ msg: 'No valid rows in CSV. Check template format.' }] });
          return;
        }
        const parseRow = (line) => {
          const out = []; let cur = ''; let inQ = false;
          for (const c of line) {
            if (c === '"') inQ = !inQ;
            else if (c === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
            else cur += c;
          }
          out.push(cur.trim());
          return out;
        };
        const headers = parseRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
        rows = lines.slice(1).map((l) => {
          const vals = parseRow(l);
          const obj  = {};
          headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, ''); });
          return obj;
        }).filter((r) => Object.values(r).some((v) => v));
      }

      if (!rows.length) {
        toast.error('No data rows found in file');
        return;
      }

      const res    = await bulkUploadTicketsApi(rows);
      const result = res.data?.data || res.data || {};
      setBulkResult({ ...result, message: res.data?.message || 'Import complete' });
      load(); // refresh ticket list
      if (!result.errors?.length && !result.skipped) {
        setTimeout(() => setShowBulkUpload(false), 1500);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setBulkUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // -------------------------------------------------------------------------
  // Row selection
  // -------------------------------------------------------------------------
  const handleSelectAll = (e) =>
    setSelected(e.target.checked ? tickets.map((t) => t._id) : []);

  const handleSelectOne = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // -------------------------------------------------------------------------
  // Bulk status change (shown only when 2+ are selected)
  // -------------------------------------------------------------------------
  const handleBulkStatusChange = async (status) => {
    if (!status || !selected.length) return;
    if (!window.confirm(`Change status of ${selected.length} request(s) to "${fmtLabel(status)}"?`)) return;
    setOpError(null);
    setBulkStatusUpdating(true);
    try {
      await Promise.all(selected.map((id) => updateTicketApi(id, { status })));
      setSelected([]);
      load();
    } catch (e) {
      setOpError(e.response?.data?.error?.message || e.message || 'Status update failed');
    } finally {
      setBulkStatusUpdating(false);
    }
  };

  // -------------------------------------------------------------------------
  // Bulk delete
  // -------------------------------------------------------------------------
  const handleDeleteSelected = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Delete ${selected.length} request(s)?`)) return;
    setOpError(null);
    try {
      await Promise.all(selected.map((id) => deleteTicketApi(id)));
      setSelected([]);
      load();
    } catch (e) {
      setOpError(e.response?.data?.error?.message || e.message || 'Delete failed');
    }
  };

  // -------------------------------------------------------------------------
  // Bulk assign
  // -------------------------------------------------------------------------
  const openBulkAssign = () => {
    setBaGroupId('');
    setBaGroupUsers([]);
    setBaAgentId('');
    setOpError(null);
    setShowBulkAssign(true);
  };

  const onBaGroupChange = (gId) => {
    setBaGroupId(gId);
    setBaAgentId('');
    if (!gId) { setBaGroupUsers([]); return; }
    getUsersApi({ groupId: gId })
      .then(unwrapList)
      .then(setBaGroupUsers)
      .catch(() => setBaGroupUsers([]));
  };

  const handleBulkAssignConfirm = async () => {
    if (!baAgentId) return;
    setOpError(null);
    setBulkAssigning(true);
    try {
      await bulkAssignApi({
        ticketIds:  selected,
        assigneeId: baAgentId,           // UUID string — do NOT coerce to Number
        ...(baGroupId ? { groupId: Number(baGroupId) } : {}),
      });
      setSelected([]);
      setShowBulkAssign(false);
      load();
    } catch (e) {
      setOpError(e.response?.data?.error?.message || e.message || 'Bulk assign failed');
    } finally {
      setBulkAssigning(false);
    }
  };

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------
  const handlePageChange = (p) => {
    if (p < 1 || p > totalPages) return;
    dispatch(setTicketsPage(p));
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    dispatch(setTicketsPage(1));
  };

  // =========================================================================
  // Render
  // =========================================================================
  return (
    <div className="h-full flex flex-col bg-[#f5f5f5] text-[11px] leading-snug">

      {/* ------------------------------------------------------------------ */}
      {/* Header card — title row + filter row (matches Requests.jsx layout)  */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border-b border-gray-200">

        {/* Top row: title + count + action buttons */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-800">Requests</h1>
            <span className="text-[11px] text-gray-500">({total} total)</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Download dropdown */}
            <div className="relative" ref={downloadMenuRef}>
              <button
                onClick={() => setShowDownloadMenu((v) => !v)}
                disabled={downloading || loading}
                title="Download tickets — choose status"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-[11px] font-medium"
              >
                {downloading
                  ? <HiOutlineRefresh className="w-3.5 h-3.5 animate-spin" />
                  : <HiOutlineDownload className="w-3.5 h-3.5" />}
                {downloading ? 'Downloading...' : 'Download'}
                {!downloading && <HiChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </button>

              {showDownloadMenu && !downloading && (
                <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 text-[11px]">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    Download by status
                  </div>
                  {[{ label: 'All tickets', value: '' }, ...STATUS_OPTIONS.map((s) => ({ label: fmtLabel(s), value: s }))].map(({ label, value }) => (
                    <button
                      key={label}
                      onClick={() => handleDownloadTickets(value)}
                      className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center justify-between"
                    >
                      <span className="text-gray-800">{label}</span>
                      {value && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${STATUS_COLORS[value] || 'bg-gray-100 text-gray-700'}`}>
                          {label}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bulk Upload */}
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#2196f3] text-[#2196f3] rounded-lg hover:bg-blue-50 transition-colors text-[11px] font-medium"
            >
              <HiOutlineUpload className="w-3.5 h-3.5" />
              Bulk Upload
            </button>

            {/* New Request */}
            <button
              onClick={() => navigate('/helpdesk/tickets/new')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] transition-colors text-[11px] font-medium"
            >
              <HiOutlinePlus className="w-3.5 h-3.5" />
              New Request
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100">
          <div className="flex items-center gap-3">
            {/* Search */}
            <form onSubmit={handleSearchSubmit} className="relative">
              <HiOutlineSearch className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search requests..."
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-[11px] w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </form>

            <div className="flex items-center gap-1.5">
              <HiOutlineFilter className="w-3.5 h-3.5 text-gray-400" />

              {/* Status */}
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilter('status', e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Status</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{fmtLabel(s)}</option>
                ))}
              </select>

              {/* Priority */}
              <select
                value={filters.priority || ''}
                onChange={(e) => handleFilter('priority', e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Priority</option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{fmtLabel(p)}</option>
                ))}
              </select>

              {/* Group — coerce to Number so Redux state matches integer group.id */}
              {groups.length > 0 && (
                <select
                  value={filters.groupId || ''}
                  onChange={(e) => dispatch(setTicketsFilter({ groupId: e.target.value ? Number(e.target.value) : '' }))}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}

              {/* Agent / Assignee — only shown to roles that can access the users list */}
              {canListUsers && (
                <select
                  value={filters.assigneeId || ''}
                  onChange={(e) => handleFilter('assigneeId', e.target.value)}
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Agents</option>
                  <option value="unassigned">Unassigned</option>
                  {users.map((u) => {
                    const uid = u._id ?? u.id;
                    return <option key={uid} value={uid}>{u.name || u.full_name}</option>;
                  })}
                </select>
              )}

              {/* Project */}
              <select
                value={filters.projectId || ''}
                onChange={(e) => handleFilter('projectId', e.target.value)}
                title="Filter by Project"
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  title="Clear all filters"
                  className="flex items-center gap-1 px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-[11px] font-medium"
                >
                  <HiX className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Right side: bulk actions + refresh + view toggle */}
          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <>
                {/* Set Status — only when 2+ rows selected */}
                {selected.length >= 2 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) handleBulkStatusChange(e.target.value); }}
                    disabled={bulkStatusUpdating}
                    title="Change status of selected requests"
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer"
                  >
                    <option value="">
                      {bulkStatusUpdating ? 'Updating…' : `Set Status (${selected.length})…`}
                    </option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{fmtLabel(s)}</option>
                    ))}
                  </select>
                )}

                {/* Bulk Assign */}
                <button
                  onClick={openBulkAssign}
                  className="flex items-center gap-1 px-2 py-1.5 text-[#2196f3] hover:bg-blue-50 rounded-lg text-[11px] font-medium"
                >
                  Assign ({selected.length})
                </button>

                {/* Bulk Delete — permission-gated */}
                {canDelete && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1 px-2 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-[11px]"
                  >
                    <HiOutlineTrash className="w-3.5 h-3.5" />
                    Delete ({selected.length})
                  </button>
                )}
              </>
            )}

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <HiOutlineRefresh className={`w-4 h-4 text-gray-500 ${(loading || refreshing) ? 'animate-spin' : ''}`} />
            </button>

            {/* View toggle: List | Grid */}
            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                <HiViewList className="w-4 h-4 text-gray-500" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                <HiViewGrid className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main content area                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-auto p-3">

        {/* Operation error banner */}
        {opError && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-[11px] text-red-700 mb-3">
            <span>{opError}</span>
            <button onClick={() => setOpError(null)} className="ml-3 text-red-400 hover:text-red-600">
              <HiX className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Loading spinner */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <HiOutlineRefresh className="w-8 h-8 animate-spin text-blue-500" />
          </div>

        /* Load error */
        ) : loadError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 flex flex-col gap-3">
            <span>Failed to load tickets. Ensure the backend is running and the database is reachable.</span>
            <button
              onClick={load}
              className="self-start px-4 py-2 bg-red-100 hover:bg-red-200 rounded text-sm font-medium"
            >
              Retry
            </button>
          </div>

        /* Empty state — no tickets exist at all */
        ) : tickets.length === 0 && !hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg border border-gray-200 p-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <HiOutlineCalendar className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">No Requests Yet</h3>
            <p className="text-gray-500 text-sm mb-6 text-center max-w-md">
              Create your first request to start tracking and managing your support tickets.
            </p>
            <button
              onClick={() => navigate('/helpdesk/tickets/new')}
              className="flex items-center gap-2 px-6 py-3 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] transition-colors font-medium"
            >
              <HiOutlinePlus className="w-5 h-5" />
              Create First Request
            </button>
          </div>

        /* Empty state — filters active but no matching results */
        ) : tickets.length === 0 && hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg border border-gray-200 p-12">
            <HiOutlineSearch className="w-12 h-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-800 mb-2">No Results Found</h3>
            <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
          </div>

        /* List view */
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-9 px-2 py-2">
                    <input
                      type="checkbox"
                      onChange={handleSelectAll}
                      checked={selected.length === tickets.length && tickets.length > 0}
                      className="w-3.5 h-3.5 rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[72px]">ID</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2">Subject</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[128px]">Team · Raised by</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[88px]">Status</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[72px]">Priority</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[100px]">Agent</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[76px]">Created</th>
                  <th className="text-left text-[10px] font-semibold text-gray-500 uppercase px-2 py-2 w-[76px]">Closed</th>
                  <th className="w-8 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t._id}
                    className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer"
                    onClick={() => navigate(`/helpdesk/tickets/${t._id}`)}
                  >
                    {/* Checkbox */}
                    <td className="px-2 py-1.5 align-middle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(t._id)}
                        onChange={() => handleSelectOne(t._id)}
                        className="w-3.5 h-3.5 rounded border-gray-300"
                      />
                    </td>

                    {/* ID */}
                    <td className="px-2 py-1.5 align-middle">
                      <span className="text-blue-600 font-medium text-[11px]">
                        {t.req_number || t.reqNumber || t.ticket_id || `#${String(t.id).slice(-6)}`}
                      </span>
                      {(t.widget_source || t.source === 'widget') && (
                        <span
                          className="ml-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 align-middle"
                          title="External — raised via widget"
                        >
                          EXT
                        </span>
                      )}
                    </td>

                    {/* Subject */}
                    <td className="px-2 py-1.5 align-middle">
                      <div className="max-w-[220px] truncate text-[11px] text-gray-800">
                        {t.title || t.subject}
                      </div>
                      {(t.project?.name || t.projectName) && (
                        <div
                          className="max-w-[220px] truncate text-[10px] text-indigo-600 font-medium leading-tight mt-0.5"
                          title={`Project: ${t.project?.name || t.projectName}`}
                        >
                          📁 {t.project?.name || t.projectName}
                        </div>
                      )}
                    </td>

                    {/* Team · Raised by */}
                    <td className="px-2 py-1.5 align-middle">
                      <div
                        className="text-[10px] text-gray-500 leading-tight truncate"
                        title={t.group?.name || t.groupName || t.team || ''}
                      >
                        {t.group?.name || t.groupName || t.team || '—'}
                      </div>
                      <div
                        className="text-[11px] text-gray-800 font-medium leading-tight truncate mt-0.5"
                        title={t.requester?.name || t.requesterName || ''}
                      >
                        {t.requester?.name || t.requesterName || t.widgetName || '—'}
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="px-2 py-1.5 align-middle">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-700'}`}>
                        {fmtLabel(t.status)}
                      </span>
                    </td>

                    {/* Priority badge */}
                    <td className="px-2 py-1.5 align-middle">
                      <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-medium ${PRIORITY_COLORS[t.priority] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                        {fmtLabel(t.priority)}
                      </span>
                    </td>

                    {/* Agent */}
                    <td className="px-2 py-1.5 align-middle">
                      <span className="text-[11px] text-gray-600 truncate block">
                        {t.assigneeUser?.name || t.assignee?.name || t.assigneeName || 'Unassigned'}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-2 py-1.5 align-middle">
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">
                        {fmtDate(t.created_at)}
                      </span>
                    </td>

                    {/* Closed */}
                    <td className="px-2 py-1.5 align-middle">
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">
                        {(t.status === 'closed' || t.status === 'resolved') ? fmtDate(t.closed_at) : '—'}
                      </span>
                    </td>

                    {/* Row menu */}
                    <td className="px-1 py-1.5 align-middle" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="p-0.5 hover:bg-gray-100 rounded">
                        <HiDotsVertical className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination bar — compact to fit the original's single-page aesthetic */}
            <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-[10px] text-gray-500">
                {total === 0 ? 'No results' : `Showing ${showFrom}–${showTo} of ${total}`}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-500">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="px-2 py-1 border border-gray-200 rounded-lg text-[10px] bg-white focus:outline-none"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-2 py-1 text-[10px] text-gray-600 font-medium whitespace-nowrap">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-[10px] hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

        /* Grid view */
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {tickets.map((t) => (
              <div
                key={t._id}
                onClick={() => navigate(`/helpdesk/tickets/${t._id}`)}
                className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md cursor-pointer transition-shadow text-[11px]"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-blue-600 font-medium text-[11px]">
                    {t.req_number || t.reqNumber || t.ticket_id || `#${String(t.id).slice(-6)}`}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-700'}`}>
                    {fmtLabel(t.status)}
                  </span>
                </div>
                <h3 className="font-medium text-gray-800 mb-1.5 line-clamp-2 text-[11px] leading-snug">
                  {t.title || t.subject}
                </h3>
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span className="truncate">{t.requester?.name || t.requesterName || '—'}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${PRIORITY_COLORS[t.priority] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {fmtLabel(t.priority)}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400 space-y-0.5">
                  <div>Created: {fmtDate(t.created_at)}</div>
                  {(t.status === 'closed' || t.status === 'resolved') && (
                    <div>Closed: {fmtDate(t.closed_at)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bulk Assign Modal                                                    */}
      {/* ------------------------------------------------------------------ */}
      {showBulkAssign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Bulk Assign ({selected.length} tickets)</h2>
              <button
                onClick={() => { setShowBulkAssign(false); setBaGroupId(''); setBaGroupUsers([]); setBaAgentId(''); }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Select a group, then choose an agent to assign the selected tickets to.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <label className="text-sm font-medium text-gray-700">Group</label>
              <select
                value={baGroupId}
                onChange={(e) => onBaGroupChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select Group --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <label className="text-sm font-medium text-gray-700">Assign to Agent</label>
              <select
                value={baAgentId}
                onChange={(e) => setBaAgentId(e.target.value)}
                disabled={!baGroupId || bulkAssigning}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="">-- Select Agent --</option>
                {baGroupUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.full_name}{u.role ? ` (${u.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {opError && <p className="text-sm text-red-600 mb-3">{opError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowBulkAssign(false); setBaGroupId(''); setBaGroupUsers([]); setBaAgentId(''); }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAssignConfirm}
                disabled={!baAgentId || bulkAssigning}
                className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {bulkAssigning ? 'Assigning…' : 'Assign Tickets'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Bulk Upload Modal                                                    */}
      {/* ------------------------------------------------------------------ */}
      {showBulkUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Bulk Ticket Upload</h2>
              <button
                onClick={() => { setShowBulkUpload(false); setBulkFile(null); setBulkResult(null); }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <HiX className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Import tickets from an Excel (.xlsx) or CSV file. Download the template, fill your data, and upload.
            </p>
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadTemplate}
                  disabled={templateDownloading}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {templateDownloading
                    ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                    : <HiOutlineDownload className="w-4 h-4" />}
                  {templateDownloading ? 'Downloading...' : 'Download Template'}
                </button>
                <label className="flex items-center gap-2 px-4 py-2 border border-[#2196f3] text-[#2196f3] rounded-lg hover:bg-blue-50 cursor-pointer text-sm font-medium">
                  <HiOutlineUpload className="w-4 h-4" />
                  {bulkFile ? bulkFile.name : 'Select File (.xlsx / .csv)'}
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              {bulkResult && (
                <div className={`p-3 rounded-lg text-sm ${bulkResult.created > 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
                  <p className="font-medium">{bulkResult.message}</p>
                  {bulkResult.created !== undefined && (
                    <p className="text-sm text-green-600">✓ {bulkResult.created} tickets created</p>
                  )}
                  {bulkResult.skipped !== undefined && bulkResult.skipped > 0 && (
                    <p className="text-sm text-amber-600">⚠ {bulkResult.skipped} rows skipped</p>
                  )}
                  {bulkResult.errors?.length > 0 && (
                    <ul className="mt-2 text-xs list-disc list-inside">
                      {bulkResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>Row {e.row}: {e.field ? `[${e.field}] ` : ''}{e.msg}</li>
                      ))}
                      {bulkResult.errors.length > 5 && (
                        <li>...and {bulkResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => { setShowBulkUpload(false); setBulkFile(null); setBulkResult(null); }}
                  className="px-4 py-2 border rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={!bulkFile || bulkUploading}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2196f3] text-white rounded-lg hover:bg-[#1976d2] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {bulkUploading
                    ? <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                    : <HiOutlineUpload className="w-4 h-4" />}
                  Upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
