import { useState } from 'react';
import { getMonthlyReportApi, getQuarterlyReportApi, getPendingReportApi, exportExcelApi, exportPdfApi } from '../../api/reports.api';
import PageHeader from '../../components/common/PageHeader';
import FilterBar from '../../components/common/FilterBar';
import DataTable from '../../components/common/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { getMonthName, formatScore, downloadBlob } from '../../utils/formatters';
import { getCurrentFinancialYear } from '../../utils/constants';

const REPORT_TYPES = [
  { value: 'monthly', label: 'Monthly KPI Report' },
  { value: 'quarterly', label: 'Quarterly Summary' },
  { value: 'pending', label: 'Pending Submissions' },
];

export default function Reports() {
  const [reportType, setReportType] = useState('monthly');
  const [filters, setFilters] = useState(() => ({ financialYear: getCurrentFinancialYear(), month: String(new Date().getMonth() + 1), quarter: '' }));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      let res;
      if (reportType === 'monthly') {
        res = await getMonthlyReportApi(filters);
      } else if (reportType === 'quarterly') {
        res = await getQuarterlyReportApi(filters);
      } else {
        res = await getPendingReportApi(filters);
      }
      setData(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const params = { ...filters, reportType };
      const res = format === 'excel'
        ? await exportExcelApi(params)
        : await exportPdfApi(params);
      downloadBlob(new Blob([res.data]), `${reportType}_report.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      toast.success('Downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  const monthlyColumns = [
    { key: 'emp', label: 'Employee', render: (r) => r.assignment?.employee?.name },
    { key: 'code', label: 'Code', render: (r) => r.assignment?.employee?.employeeCode },
    { key: 'month', label: 'Month', render: (r) => getMonthName(r.assignment?.month) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.assignment?.status} /> },
    { key: 'score', label: 'Score', render: (r) => formatScore(r.assignment?.monthlyWeightedScore) },
    { key: 'items', label: 'KPIs', render: (r) => r.items?.length },
  ];

  const quarterlyColumns = [
    { key: 'emp', label: 'Employee', render: (r) => r.employee?.name },
    { key: 'code', label: 'Code', render: (r) => r.employee?.employeeCode },
    { key: 'qScore', label: 'Q Score', render: (r) => formatScore(r.quarterlyScore) },
    { key: 'payout', label: 'Payout %', render: (r) => r.pliRecommendation?.payoutPercentage ?? '—' },
    { key: 'label', label: 'Label', render: (r) => r.pliRecommendation?.label ?? '—' },
    { key: 'complete', label: 'Complete', render: (r) => r.allMonthsLocked ? 'Yes' : 'Partial' },
  ];

  const pendingColumns = [
    { key: 'emp', label: 'Employee', render: (r) => r.employee?.name },
    { key: 'code', label: 'Code', render: (r) => r.employee?.employeeCode },
    { key: 'month', label: 'Month', render: (r) => getMonthName(r.month) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'manager', label: 'Manager', render: (r) => r.manager?.name },
  ];

  const columns = reportType === 'quarterly' ? quarterlyColumns : reportType === 'pending' ? pendingColumns : monthlyColumns;

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          <div className="flex gap-2">
            <button onClick={() => handleExport('excel')} className="btn-secondary">Export Excel</button>
            <button onClick={() => handleExport('pdf')} className="btn-secondary">Export PDF</button>
          </div>
        }
      />

      <div className="flex gap-3 mb-4">
        <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="input-field w-52">
          {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      <button onClick={handleGenerate} className="btn-primary mb-4">Generate Report</button>

      {loading ? <LoadingSpinner /> : <DataTable columns={columns} data={data} emptyMessage="No data. Click Generate to load." />}
    </div>
  );
}
