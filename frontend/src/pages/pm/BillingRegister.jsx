import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineCurrencyRupee, HiOutlineCheckCircle, HiOutlineClock, HiOutlineDownload,
  HiOutlineRefresh, HiOutlineSearch, HiOutlineReceiptTax, HiOutlineBan,
} from 'react-icons/hi';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import TableSkeleton from '../../components/common/TableSkeleton';
import EmptyState from '../../components/common/EmptyState';
import {
  getBillingRegisterApi, markProjectBilledApi, unmarkProjectBilledApi, exportBillingApi,
} from '../../api/pm/billing.api';
import { formatDate, downloadBlob } from '../../utils/formatters';

const TABS = [
  { key: 'ready', label: 'Ready to Bill' },
  { key: 'billed', label: 'Billed' },
  { key: 'billable', label: 'All Billable' },
  { key: 'all', label: 'All Projects' },
];

const STATUS_COLORS = {
  planning: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
};

const today = () => new Date().toISOString().slice(0, 10);

export default function BillingRegister() {
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);

  const [tab, setTab] = useState('ready');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [billModal, setBillModal] = useState(null); // project
  const [form, setForm] = useState({ invoiceNumber: '', billedDate: today() });
  const [unbillTarget, setUnbillTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBillingRegisterApi({ filter: tab, ...(search.trim() ? { search: search.trim() } : {}) });
      setData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to load billing register');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  const openBillModal = (project) => {
    setForm({ invoiceNumber: '', billedDate: today() });
    setBillModal(project);
  };

  const handleBill = async () => {
    if (!form.invoiceNumber.trim()) {
      toast.error('Invoice number is required');
      return;
    }
    setSaving(true);
    try {
      const res = await markProjectBilledApi(billModal._id || billModal.id, form.invoiceNumber.trim(), form.billedDate);
      toast.success(res.data.message || 'Project billed');
      setBillModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to record invoice');
    } finally {
      setSaving(false);
    }
  };

  const handleUnbill = async () => {
    setSaving(true);
    try {
      await unmarkProjectBilledApi(unbillTarget._id || unbillTarget.id, 'Reversed from billing register');
      toast.success('Billing entry reversed');
      setUnbillTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to reverse');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportBillingApi({ filter: tab });
      downloadBlob(new Blob([res.data]), `billing-register-${today()}.xlsx`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const stats = data?.stats;
  const canBill = data?.canBill;
  const projects = data?.projects || [];

  return (
    <div>
      <PageHeader
        title="Billing Register"
        subtitle={canBill ? 'Record invoices against completed billable projects' : 'Billing status across all projects'}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary flex items-center gap-1" onClick={load}>
              <HiOutlineRefresh className="w-4 h-4" /> Refresh
            </button>
            <button className="btn-secondary flex items-center gap-1" disabled={exporting} onClick={handleExport}>
              <HiOutlineDownload className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Excel'}
            </button>
          </div>
        }
      />

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Ready to Bill"
            value={stats.readyToBill}
            subtitle="Completed & billable"
            color={stats.readyToBill > 0 ? 'yellow' : 'green'}
            icon={HiOutlineClock}
          />
          <StatCard title="Billed" value={stats.billed} subtitle="Invoice raised" color="green" icon={HiOutlineCheckCircle} />
          <StatCard title="In Flight" value={stats.inFlight} subtitle="Billable, not yet complete" color="primary" icon={HiOutlineCurrencyRupee} />
          <StatCard title="Not Billable" value={stats.notBillable} subtitle={`of ${stats.total} projects`} color="purple" />
        </div>
      )}

      {/* Tabs + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 border-b border-gray-200 flex-1 min-w-[300px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {t.label}
              {t.key === 'ready' && stats?.readyToBill > 0 && (
                <span className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {stats.readyToBill}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <HiOutlineSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input-field pl-9 w-56"
            placeholder="Search project"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} columns={7} />
      ) : !projects.length ? (
        <div className="card">
          <EmptyState
            message={tab === 'ready' ? 'Nothing waiting to be invoiced' : 'No projects match this filter'}
            icon={HiOutlineReceiptTax}
          />
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Manager</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Billing</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((p) => (
                <tr key={p._id || p.id} className={p.readyToBill ? 'bg-amber-50/50' : ''}>
                  <td className="px-4 py-3">
                    <button
                      className="font-medium text-gray-800 hover:text-primary-600 text-left"
                      onClick={() => navigate(`/pm/projects/${p._id || p.id}`)}
                    >
                      {p.name}
                    </button>
                    <div className="text-xs text-gray-400">
                      {p.endDate ? `Ends ${formatDate(p.endDate)}` : 'No end date'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.clientName || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.projectManager?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                      {String(p.status).replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!p.isBillable ? (
                      <span className="text-xs text-gray-400">Not billable</span>
                    ) : p.isBilled ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">Billed</span>
                    ) : p.readyToBill ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">Ready to bill</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600">Billable</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.isBilled ? (
                      <div>
                        <div className="font-mono text-xs text-gray-700">{p.invoiceNumber}</div>
                        <div className="text-[11px] text-gray-400">
                          {formatDate(p.billedDate)}{p.billedBy?.name ? ` · ${p.billedBy.name}` : ''}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!canBill ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : p.isBilled ? (
                      <button
                        className="btn-secondary !px-3 !py-1 text-xs inline-flex items-center gap-1"
                        onClick={() => setUnbillTarget(p)}
                      >
                        <HiOutlineBan className="w-3.5 h-3.5" /> Reverse
                      </button>
                    ) : p.readyToBill ? (
                      <button className="btn-primary !px-3 !py-1 text-xs" onClick={() => openBillModal(p)}>
                        Mark Billed
                      </button>
                    ) : (
                      <span
                        className="text-xs text-gray-300"
                        title={p.isBillable ? 'Project must be Completed before it can be billed' : 'Project is not marked billable'}
                      >
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mark billed */}
      <Modal open={!!billModal} onClose={() => setBillModal(null)} title="Record Invoice" size="md">
        {billModal && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="font-medium text-gray-800">{billModal.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {billModal.clientName || 'No client'} · completed{billModal.endDate ? ` ${formatDate(billModal.endDate)}` : ''}
              </div>
            </div>
            <div>
              <label className="label-text">Invoice Number *</label>
              <input
                className="input-field"
                value={form.invoiceNumber}
                onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                placeholder="e.g. INV-2026-0142"
                autoFocus
              />
            </div>
            <div>
              <label className="label-text">Billed Date</label>
              <input
                type="date"
                className="input-field"
                value={form.billedDate}
                onChange={(e) => setForm((f) => ({ ...f, billedDate: e.target.value }))}
              />
            </div>
            <p className="text-xs text-gray-400">
              The project manager will be notified that this project has been invoiced.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setBillModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={handleBill}>
                {saving ? 'Saving…' : 'Mark Billed'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!unbillTarget}
        title="Reverse Billing Entry"
        message={`Remove invoice ${unbillTarget?.invoiceNumber} from "${unbillTarget?.name}"? The project returns to Ready to Bill. This is recorded in the audit log.`}
        confirmText="Reverse Entry"
        danger
        loading={saving}
        onConfirm={handleUnbill}
        onCancel={() => setUnbillTarget(null)}
      />
    </div>
  );
}
