import { useEffect, useState } from 'react';
import { getAuditLogsApi } from '../../api/auditLogs.api';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import Pagination from '../../components/common/Pagination';
import { formatDateTime } from '../../utils/formatters';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ page: 1, entityType: '', action: '' });

  useEffect(() => {
    setLoading(true);
    getAuditLogsApi(filters)
      .then((res) => {
        setLogs(res.data.data);
        setPagination(res.data.pagination);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const columns = [
    { key: 'createdAt', label: 'Time', render: (r) => formatDateTime(r.createdAt) },
    { key: 'entityType', label: 'Entity', render: (r) => <span className="capitalize">{r.entityType?.replace(/_/g, ' ')}</span> },
    { key: 'action', label: 'Action', render: (r) => <span className="capitalize">{r.action?.replace(/_/g, ' ')}</span> },
    { key: 'changedBy', label: 'User', render: (r) => r.changedBy?.name || '—' },
    { key: 'entityId', label: 'Entity ID', render: (r) => <span className="text-xs font-mono">{r.entityId?.toString().slice(-8)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Audit Logs" />

      <div className="flex gap-3 mb-4">
        <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value, page: 1 })} className="input-field w-44">
          <option value="">All Entities</option>
          <option value="user">User</option>
          <option value="kpi_assignment">KPI Assignment</option>
          <option value="kpi_item">KPI Item</option>
          <option value="appraisal_cycle">Appraisal Cycle</option>
          <option value="pli_rule">PLI Rule</option>
          <option value="department">Department</option>
        </select>
        <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })} className="input-field w-40">
          <option value="">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="submitted">Submitted</option>
          <option value="reviewed">Reviewed</option>
          <option value="locked">Locked</option>
          <option value="unlocked">Unlocked</option>
          <option value="login">Login</option>
        </select>
      </div>

      <DataTable columns={columns} data={logs} loading={loading} emptyMessage="No audit logs found" />
      <Pagination pagination={pagination} onPageChange={(p) => setFilters({ ...filters, page: p })} />
    </div>
  );
}
