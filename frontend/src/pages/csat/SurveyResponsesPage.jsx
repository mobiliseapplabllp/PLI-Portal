import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineChartBar, HiOutlineDownload, HiOutlineX, HiOutlineExclamation,
  HiOutlineRefresh, HiOutlineChevronDown,
} from 'react-icons/hi';
import { getDispatchesApi, getDispatchResponsesApi, getDispatchDetailApi, exportDispatchApi, resendEmailApi } from '../../api/csat.api';
import ResponseViewer from './components/ResponseViewer';
import Pagination from '../../components/common/Pagination';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const MODE_BADGE = {
  instant:   { bg: 'bg-blue-50',   text: 'text-blue-700',   label: 'Instant' },
  scheduled: { bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Scheduled' },
  recurring: { bg: 'bg-violet-50', text: 'text-violet-700', label: 'Recurring' },
};
const STATUS_BADGE = {
  pending: { bg: 'bg-gray-100',    text: 'text-gray-500' },
  active:  { bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  closed:  { bg: 'bg-red-50',      text: 'text-red-600' },
};

function DispatchCard({ dispatch, onSelect, selected }) {
  const mode = dispatch.dispatchMode;
  const status = dispatch.status;
  const mb = MODE_BADGE[mode] || { bg: 'bg-gray-100', text: 'text-gray-600', label: mode };
  const sb = STATUS_BADGE[status] || STATUS_BADGE.pending;
  const submitted = dispatch.totalRecipients > 0
    ? Math.round((dispatch.submittedCount || 0) / dispatch.totalRecipients * 100)
    : 0;

  return (
    <button
      onClick={() => onSelect(dispatch._id)}
      className={`w-full text-left bg-white border rounded-xl p-4 transition-all hover:shadow-sm ${
        selected
          ? 'border-emerald-400 ring-1 ring-emerald-200 shadow-sm'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-gray-900 truncate flex-1 leading-snug">
          {dispatch.survey?.name || 'Survey'}
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${mb.bg} ${mb.text}`}>
            {mb.label}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${sb.bg} ${sb.text}`}>
            {status}
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {dispatch.sentAt
          ? new Date(dispatch.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : dispatch.scheduledAt
          ? `Scheduled: ${new Date(dispatch.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
          : 'Pending'}
        {' · '}{dispatch.clientOrganisation?.name || ''}
      </p>

      {/* Response progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{dispatch.totalRecipients} recipients</span>
          <span className="font-medium text-gray-600">{submitted}% responded</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${submitted}%` }}
          />
        </div>
      </div>
    </button>
  );
}

function StatPill({ label, value, accent }) {
  const acc = {
    default: 'bg-gray-50 text-gray-900',
    emerald: 'bg-emerald-50 text-emerald-700',
    blue:    'bg-blue-50 text-blue-700',
    amber:   'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl px-4 py-3 text-center ${acc[accent] || acc.default}`}>
      <p className="text-xl font-bold">{value ?? '—'}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

export default function SurveyResponsesPage() {
  const navigate = useNavigate();
  const [dispatches, setDispatches] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [responses, setResponses] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [exportingId, setExportingId] = useState(null);
  const [resendTarget, setResendTarget] = useState(null);
  const [resending, setResending] = useState(false);

  const fetchDispatches = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await getDispatchesApi({ page, limit: 15 });
      setDispatches(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load dispatches');
    } finally {
      setLoadingList(false);
    }
  }, [page]);

  useEffect(() => { fetchDispatches(); }, [fetchDispatches]);

  const loadDetail = useCallback(async (id) => {
    setLoadingDetail(true);
    setDetail(null);
    setResponses(null);
    try {
      const [detailRes, respRes] = await Promise.all([
        getDispatchDetailApi(id),
        getDispatchResponsesApi(id),
      ]);
      setDetail(detailRes.data.data);
      setResponses(respRes.data.data);
    } catch {
      toast.error('Failed to load responses');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleSelect = (id) => {
    if (selectedId === id) { setSelectedId(null); setDetail(null); setResponses(null); return; }
    setSelectedId(id);
    loadDetail(id);
  };

  const handleExport = async (id) => {
    setExportingId(id);
    try {
      const res = await exportDispatchApi(id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `survey-responses-${id.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    } finally {
      setExportingId(null);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendEmailApi(resendTarget._id);
      toast.success('Email resent');
      setResendTarget(null);
      if (selectedId) loadDetail(selectedId);
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Resend failed');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Survey Responses</h1>
        <p className="text-sm text-gray-500 mt-1">Analytics and response tracking per dispatch</p>
      </div>

      <div className={`grid gap-6 ${selectedId ? 'lg:grid-cols-5' : 'grid-cols-1 max-w-2xl'}`}>
        {/* Dispatch list */}
        <div className={selectedId ? 'lg:col-span-2' : 'col-span-1'}>
          {loadingList ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : dispatches.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
              <HiOutlineChartBar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-gray-500 text-sm font-medium">No dispatches yet</p>
              <p className="text-xs text-gray-400 mt-1">Send a survey to start tracking responses.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {dispatches.map((d) => (
                <DispatchCard
                  key={d._id}
                  dispatch={d}
                  selected={selectedId === d._id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
          {pagination.pages > 1 && (
            <div className="mt-4">
              <Pagination page={page} pages={pagination.pages} onPageChange={setPage} />
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="lg:col-span-3 space-y-5 min-w-0">
            {/* Detail header */}
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-gray-900 truncate">
                {detail?.survey?.name || 'Loading...'}
              </h2>
              <div className="flex items-center gap-2 flex-shrink-0">
                {detail && (
                  <button
                    onClick={() => handleExport(selectedId)}
                    disabled={exportingId === selectedId}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
                  >
                    <HiOutlineDownload className="w-4 h-4" />
                    {exportingId === selectedId ? 'Exporting...' : 'Export Excel'}
                  </button>
                )}
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : detail && responses ? (
              <>
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2">
                  <StatPill label="Sent"     value={detail.stats?.sent}      accent="default" />
                  <StatPill label="Opened"   value={detail.stats?.opened}    accent="blue" />
                  <StatPill label="Submitted" value={detail.stats?.submitted} accent="emerald" />
                  <StatPill label="Response Rate" value={`${detail.stats?.responseRate ?? 0}%`} accent="emerald" />
                </div>

                {/* Failed email alert */}
                {detail.stats?.emailFailed > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <HiOutlineExclamation className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">
                        {detail.stats.emailFailed} email{detail.stats.emailFailed !== 1 ? 's' : ''} failed to deliver
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Expand Recipients below and click Resend on failed items.
                      </p>
                    </div>
                  </div>
                )}

                {/* Recipients accordion */}
                <details className="bg-white border border-gray-200 rounded-xl overflow-hidden group">
                  <summary className="flex items-center justify-between px-4 py-3.5 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 list-none select-none">
                    <span className="flex items-center gap-2">
                      <HiOutlineChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                      Recipients
                    </span>
                    <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      {detail.recipients?.length || 0}
                    </span>
                  </summary>
                  <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                    {(detail.recipients || []).map((r) => (
                      <div key={r._id} className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-gray-500">
                              {(r.employee?.name || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{r.employee?.name}</p>
                            <p className="text-xs text-gray-400 truncate">{r.employee?.email}</p>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {r.status === 'submitted' ? (
                            <button
                              onClick={() => navigate(`/csat/responses/${selectedId}/recipient/${r._id}`)}
                              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold hover:underline"
                            >
                              View answers →
                            </button>
                          ) : !r.emailSentAt && r.emailError ? (
                            <button
                              onClick={() => setResendTarget(r)}
                              className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                            >
                              <HiOutlineRefresh className="w-3.5 h-3.5" />
                              Resend
                            </button>
                          ) : (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                              r.status === 'opened'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {r.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                {/* Per-question breakdown */}
                {(responses.breakdown || []).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                      Question Breakdown
                    </h3>
                    {responses.breakdown.map((q) => (
                      <ResponseViewer key={q.questionId} question={q} />
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Resend confirm */}
      <ConfirmDialog
        isOpen={!!resendTarget}
        onCancel={() => setResendTarget(null)}
        onConfirm={handleResend}
        loading={resending}
        title="Resend Email"
        message={`Resend the survey email to "${resendTarget?.employee?.name}" (${resendTarget?.employee?.email})?`}
        confirmLabel="Resend"
      />
    </div>
  );
}
