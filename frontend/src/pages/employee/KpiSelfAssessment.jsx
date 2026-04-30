import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAssignmentDetail } from '../../store/kpiSlice';
import { commitKpiApi, saveDraftApi, employeeSubmitApi, downloadEmployeeAttachmentApi } from '../../api/kpiAssignments.api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Breadcrumbs from '../../components/common/Breadcrumbs';
import WorkflowStepper from '../../components/common/WorkflowStepper';
import DeadlineCountdown from '../../components/common/DeadlineCountdown';
import toast from 'react-hot-toast';
import { getMonthName, formatScore } from '../../utils/formatters';
import { KPI_STATUS } from '../../utils/constants';
import { HiOutlinePaperClip, HiOutlineDownload, HiOutlineX, HiOutlineSave } from 'react-icons/hi';

// ── Compact inline status picker ─────────────────────────────────────────────
function StatusPicker({ value, onChange, disabled }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => !disabled && onChange(e.target.value)}
      disabled={disabled}
      className="input-field text-xs py-1 px-2 w-full"
    >
      <option value="">-- Select Status --</option>
      <option value="Meets">Meets</option>
      <option value="Exceeds">Exceeds</option>
      <option value="Below">Below</option>
    </select>
  );
}

// ── Read-only status badge ────────────────────────────────────────────────────
function StatusChip({ value }) {
  if (!value) return <span className="text-gray-300 text-xs">—</span>;
  const cls = value === 'Exceeds' ? 'bg-emerald-100 text-emerald-700'
    : value === 'Meets' ? 'bg-blue-100 text-blue-700'
    : 'bg-red-100 text-red-700';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{value}</span>;
}

export default function KpiSelfAssessment() {
  const { assignmentId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { currentAssignment, currentItems, loading } = useSelector((s) => s.kpi);
  const [formData, setFormData] = useState({});
  const [achieveFile, setAchieveFile] = useState(null);
  const achieveFileRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { dispatch(fetchAssignmentDetail(assignmentId)); }, [dispatch, assignmentId]);

  useEffect(() => {
    if (currentItems.length > 0) {
      const init = {};
      currentItems.forEach((item) => {
        const id = item._id || item.id;
        init[id] = {
          commitValue: item.commitValue || '',
          employeeCommitmentComment: item.employeeCommitmentComment || '',
          employeeStatus: item.employeeStatus || '',
          employeeComment: item.employeeComment || '',
        };
      });
      setFormData(init);
    }
  }, [currentItems]);

  const status = currentAssignment?.status;
  const isCommitMode     = status === KPI_STATUS.ASSIGNED;
  const isPending        = status === KPI_STATUS.COMMITMENT_SUBMITTED;
  const isAchieveMode    = status === KPI_STATUS.COMMITMENT_APPROVED;
  const isReadOnly       = !isCommitMode && !isAchieveMode;

  const setField = (id, field, val) =>
    setFormData((p) => ({ ...p, [id]: { ...p[id], [field]: val } }));

  const filledCount = isAchieveMode
    ? currentItems.filter((i) => !!formData[i._id || i.id]?.employeeStatus).length
    : isCommitMode
    ? currentItems.filter((i) => !!formData[i._id || i.id]?.commitValue?.trim()).length
    : currentItems.length;
  const allFilled = filledCount === currentItems.length;

  const handleCommitSubmit = async () => {
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return { id, commitValue: formData[id]?.commitValue || '', employeeCommitmentComment: formData[id]?.employeeCommitmentComment || '' };
    });
    if (items.some((i) => !i.commitValue?.trim())) {
      toast.error('Please enter a committed value for all KPI items');
      return;
    }
    setSubmitting(true);
    try {
      await commitKpiApi(assignmentId, items);
      toast.success('Commitment submitted successfully');
      navigate('/employee/kpis');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  const handleSaveDraft = async () => {
    const draftItems = currentItems.map((item) => {
      const id = item._id || item.id;
      return isCommitMode
        ? { id, commitValue: formData[id]?.commitValue || '', employeeCommitmentComment: formData[id]?.employeeCommitmentComment || '' }
        : { id, employeeStatus: formData[id]?.employeeStatus || '', employeeComment: formData[id]?.employeeComment || '' };
    });
    setSubmitting(true);
    try {
      await saveDraftApi(assignmentId, draftItems);
      toast.success('Draft saved');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save draft');
    } finally { setSubmitting(false); }
  };

  const handleAchieveSubmit = async () => {
    const items = currentItems.map((item) => {
      const id = item._id || item.id;
      return { id, employeeStatus: formData[id]?.employeeStatus, employeeComment: formData[id]?.employeeComment || '' };
    });
    if (items.some((i) => !i.employeeStatus)) {
      toast.error('Please select an achievement status for all KPI items');
      return;
    }
    setSubmitting(true);
    try {
      await employeeSubmitApi(assignmentId, items, achieveFile || null);
      toast.success('Achievement submitted');
      navigate('/employee/kpis');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Submission failed');
    } finally { setSubmitting(false); }
  };

  const handleDownload = async () => {
    try {
      const res = await downloadEmployeeAttachmentApi(assignmentId);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = currentAssignment.employeeAttachmentName || 'attachment'; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download attachment'); }
  };

  if (loading) return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  if (!currentAssignment) return <p className="text-gray-500">Assignment not found</p>;

  const cycle         = currentAssignment.appraisalCycle;
  const totalWt       = currentItems.reduce((s, i) => s + Number(i.weightage || 0), 0);
  const monthlyWt     = (Number(currentAssignment.totalWeightage || totalWt || 0) / 12).toFixed(2);

  // Column counts for colspan in totals row
  const extraCols = isCommitMode || isPending ? 2 : isAchieveMode ? 3 : 4;

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[
        { label: 'Dashboard', to: '/employee/dashboard' },
        { label: 'My KPIs',   to: '/employee/kpis' },
        { label: isCommitMode ? 'Submit Commitment' : isAchieveMode ? 'Submit Achievement' : isPending ? 'Pending Approval' : 'View Assessment' },
      ]} />

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isCommitMode ? 'Submit Commitment'
              : isAchieveMode ? 'Submit Achievement'
              : isPending ? 'Commitment — Pending Approval'
              : 'KPI Assessment'}
            {' — '}{getMonthName(currentAssignment.month)} {currentAssignment.financialYear}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentItems.length} KPI items · Total weightage: {totalWt}%
            <span className="mx-2 text-gray-300">·</span>
            <span className="text-violet-600 font-semibold">Monthly Wt: {monthlyWt}%</span>
          </p>
        </div>
        {isCommitMode && cycle?.commitmentDeadline && (
          <DeadlineCountdown deadline={cycle.commitmentDeadline} label="Commit by" />
        )}
        {isAchieveMode && cycle?.employeeSubmissionDeadline && (
          <DeadlineCountdown deadline={cycle.employeeSubmissionDeadline} label="Submit by" />
        )}
      </div>

      {/* ── Workflow stepper ─────────────────────────────────────────────────── */}
      <div className="card py-4">
        <WorkflowStepper status={currentAssignment.status} />
      </div>

      {/* ── Pending approval notice ───────────────────────────────────────────── */}
      {isPending && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-4">
          <p className="font-semibold text-sky-800">Awaiting manager approval</p>
          <p className="text-sm text-sky-600 mt-1">Once your manager approves this commitment you can submit your self-assessment.</p>
          {currentAssignment.commitmentRejectionComment && (
            <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <strong>Previous rejection:</strong> {currentAssignment.commitmentRejectionComment}
            </div>
          )}
        </div>
      )}

      {/* ── Rejection banner (commit mode after rejection) ────────────────────── */}
      {isCommitMode && currentAssignment.commitmentRejectionComment && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <p className="font-semibold text-red-700">Commitment rejected — please revise and resubmit</p>
          <p className="text-sm text-red-600 mt-1">{currentAssignment.commitmentRejectionComment}</p>
        </div>
      )}

      {/* ── Achieve mode progress bar ─────────────────────────────────────────── */}
      {isAchieveMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <div className="flex justify-between text-xs text-amber-700 mb-1.5">
            <span>{filledCount}/{currentItems.length} items rated</span>
            <span>{currentItems.length > 0 ? Math.round((filledCount / currentItems.length) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${currentItems.length > 0 ? (filledCount / currentItems.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* ── KPI Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide border-b border-gray-200">
                <th className="px-3 py-3 text-center w-10 border-r border-gray-200">#</th>
                <th className="px-3 py-3 text-left border-r border-gray-200 min-w-[220px]">KPI Title</th>
                <th className="px-3 py-3 text-center border-r border-gray-200 w-14">Wt%</th>
                <th className="px-3 py-3 text-center border-r border-gray-200 w-20 text-violet-600">Monthly Wt%</th>

                {/* Commit / Pending columns */}
                {(isCommitMode || isPending) && <>
                  <th className="px-3 py-3 text-left border-r border-gray-200 min-w-[150px]">
                    Committed Value{isCommitMode && <span className="text-red-400 ml-0.5">*</span>}
                  </th>
                  <th className="px-3 py-3 text-left min-w-[180px]">Plan / Notes</th>
                </>}

                {/* Achieve columns */}
                {isAchieveMode && <>
                  <th className="px-3 py-3 text-left border-r border-gray-200 min-w-[130px]">Committed (ref)</th>
                  <th className="px-3 py-3 text-left border-r border-gray-200 min-w-[220px]">
                    Achievement<span className="text-red-400 ml-0.5">*</span>
                  </th>
                  <th className="px-3 py-3 text-left min-w-[160px]">Notes</th>
                </>}

                {/* Read-only columns */}
                {isReadOnly && <>
                  <th className="px-3 py-3 text-left border-r border-gray-200 min-w-[120px]">Committed</th>
                  <th className="px-3 py-3 text-center border-r border-gray-200 w-28">Self-Review</th>
                  <th className="px-3 py-3 text-center border-r border-gray-200 w-24">Manager</th>
                  <th className="px-3 py-3 text-center w-24">Final</th>
                </>}
              </tr>
            </thead>

            <tbody>
              {currentItems.map((item, idx) => {
                const id  = item._id || item.id;
                const fd  = formData[id] || {};

                return (
                  <tr key={id} className="border-b border-gray-100 hover:bg-gray-50/40 transition-colors">

                    {/* # */}
                    <td className="px-3 py-3 text-center text-gray-400 text-xs border-r border-gray-100 align-top">{idx + 1}</td>

                    {/* KPI Title + meta */}
                    <td className="px-3 py-3 border-r border-gray-100 align-top">
                      <div className="font-medium text-gray-800 leading-snug">{item.title}</div>
                      {item.description && (
                        <div className="text-xs text-gray-400 mt-0.5 leading-snug">{item.description}</div>
                      )}
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-400">
                        {item.targetValue != null && (
                          <span>Target: <span className="font-medium text-gray-600">{item.targetValue}</span></span>
                        )}
                        {item.thresholdValue != null && (
                          <span>Min: <span className="text-gray-500">{item.thresholdValue}</span></span>
                        )}
                        {item.stretchTarget != null && (
                          <span>Stretch: <span className="text-gray-500">{item.stretchTarget}</span></span>
                        )}
                        {item.unit && <span>{item.unit}</span>}
                      </div>
                    </td>

                    {/* Wt% */}
                    <td className="px-3 py-3 text-center border-r border-gray-100 align-top">
                      <span className="font-semibold text-gray-700">{item.weightage}%</span>
                    </td>

                    {/* Monthly Wt% */}
                    <td className="px-3 py-3 text-center border-r border-gray-100 align-top">
                      <span className="font-semibold text-violet-600">
                        {(Number(item.weightage || 0) / 12).toFixed(2)}%
                      </span>
                    </td>

                    {/* ── Commit / Pending mode ── */}
                    {(isCommitMode || isPending) && <>
                      <td className="px-2 py-2 border-r border-gray-100 align-top">
                        {isCommitMode ? (
                          <input
                            type="text"
                            value={fd.commitValue || ''}
                            onChange={(e) => setField(id, 'commitValue', e.target.value)}
                            className="input-field text-sm py-1.5 w-full"
                            placeholder="e.g. 95%, ₹2L, 10 tasks"
                            autoFocus={idx === 0}
                          />
                        ) : (
                          <span className={`text-sm font-medium ${item.commitValue ? 'text-gray-800' : 'text-gray-300'}`}>
                            {item.commitValue || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {isCommitMode ? (
                          <textarea
                            value={fd.employeeCommitmentComment || ''}
                            onChange={(e) => setField(id, 'employeeCommitmentComment', e.target.value)}
                            className="input-field text-sm py-1.5 w-full resize-none"
                            rows={2}
                            placeholder="Optional plan notes"
                          />
                        ) : (
                          <span className="text-sm text-gray-500 italic">
                            {item.employeeCommitmentComment || <span className="text-gray-300">—</span>}
                          </span>
                        )}
                      </td>
                    </>}

                    {/* ── Achieve mode ── */}
                    {isAchieveMode && <>
                      {/* Committed reference */}
                      <td className="px-3 py-3 border-r border-gray-100 align-top">
                        <div className="text-sm font-medium text-blue-700">
                          {item.commitValue || <span className="text-gray-300 font-normal">—</span>}
                        </div>
                        {item.employeeCommitmentComment && (
                          <div className="text-xs text-gray-400 italic mt-0.5">"{item.employeeCommitmentComment}"</div>
                        )}
                      </td>
                      {/* Achievement picker */}
                      <td className="px-2 py-2.5 border-r border-gray-100 align-top">
                        <StatusPicker
                          value={fd.employeeStatus || ''}
                          onChange={(v) => setField(id, 'employeeStatus', v)}
                        />
                        {!fd.employeeStatus && (
                          <p className="text-xs text-red-400 mt-1.5">Select status</p>
                        )}
                      </td>
                      {/* Notes */}
                      <td className="px-2 py-2 align-top">
                        <textarea
                          value={fd.employeeComment || ''}
                          onChange={(e) => setField(id, 'employeeComment', e.target.value)}
                          className="input-field text-sm py-1.5 w-full resize-none"
                          rows={2}
                          placeholder="Optional note"
                        />
                      </td>
                    </>}

                    {/* ── Read-only ── */}
                    {isReadOnly && <>
                      {/* Committed */}
                      <td className="px-3 py-3 border-r border-gray-100 align-top">
                        <div className="text-sm text-gray-700">
                          {item.commitValue || <span className="text-gray-300">—</span>}
                        </div>
                        {item.employeeCommitmentComment && (
                          <div className="text-xs text-gray-400 italic mt-0.5">"{item.employeeCommitmentComment}"</div>
                        )}
                      </td>
                      {/* Self-Review */}
                      <td className="px-3 py-3 text-center border-r border-gray-100 align-top">
                        <StatusChip value={item.employeeStatus} />
                        {item.employeeComment && (
                          <div className="text-xs text-gray-400 italic mt-1 text-left">"{item.employeeComment}"</div>
                        )}
                      </td>
                      {/* Manager */}
                      <td className="px-3 py-3 text-center border-r border-gray-100 align-top">
                        <StatusChip value={item.managerStatus} />
                      </td>
                      {/* Final */}
                      <td className="px-3 py-3 text-center align-top">
                        {item.finalApproverStatus ? (
                          <div>
                            <StatusChip value={item.finalApproverStatus} />
                            {item.finalApproverAchievedWeightage != null && (
                              <div className="text-xs text-gray-400 mt-0.5">{item.finalApproverAchievedWeightage}%</div>
                            )}
                          </div>
                        ) : item.finalScore != null ? (
                          <span className="text-xs text-gray-500">{formatScore(item.finalScore)}</span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </>}
                  </tr>
                );
              })}

              {/* Totals row */}
              {currentItems.length > 0 && (
                <tr className="bg-gray-50 text-xs">
                  <td colSpan={2} className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide border-r border-gray-200">
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200">
                    <span className={`font-bold text-sm ${totalWt === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>{totalWt}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-center border-r border-gray-200">
                    <span className="font-bold text-sm text-violet-600">{(totalWt / 12).toFixed(2)}%</span>
                  </td>
                  <td colSpan={extraCols} className="px-3 py-2.5 text-gray-400">
                    {isCommitMode && `${filledCount}/${currentItems.length} committed`}
                    {isAchieveMode && `${filledCount}/${currentItems.length} rated`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Attachment download (read-only) ──────────────────────────────────── */}
      {isReadOnly && currentAssignment.hasEmployeeAttachment && (
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <HiOutlinePaperClip className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <span className="flex-1 text-sm text-gray-600">Your self-review attachment</span>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-medium"
          >
            <HiOutlineDownload className="w-4 h-4" /> Download
          </button>
        </div>
      )}

      {/* ── Submit: Commit ───────────────────────────────────────────────────── */}
      {isCommitMode && (
        <div className="flex items-center gap-3 pt-1">
          <button onClick={handleSaveDraft} disabled={submitting} className="btn-secondary flex items-center gap-1.5">
            <HiOutlineSave className="w-4 h-4" /> Save Draft
          </button>
          <button
            onClick={handleCommitSubmit}
            disabled={submitting || !allFilled}
            className="btn-primary"
          >
            {submitting ? 'Submitting…' : `Submit Commitment (${filledCount}/${currentItems.length})`}
          </button>
          <button onClick={() => navigate('/employee/kpis')} className="btn-secondary">Cancel</button>
          {!allFilled && (
            <span className="text-xs text-amber-600">
              {currentItems.length - filledCount} item{currentItems.length - filledCount !== 1 ? 's' : ''} still need a committed value.
            </span>
          )}
        </div>
      )}

      {/* ── Submit: Achieve ──────────────────────────────────────────────────── */}
      {isAchieveMode && (
        <div className="space-y-3 pt-1">
          {/* File attachment */}
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <HiOutlinePaperClip className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-600 flex-1">
              Supporting attachment <span className="text-gray-400 text-xs">(optional)</span>
              {currentAssignment.hasEmployeeAttachment && !achieveFile && (
                <span className="ml-2 text-xs text-gray-400 italic">· existing file will be replaced</span>
              )}
            </span>
            {achieveFile ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-amber-800 max-w-[200px] truncate">{achieveFile.name}</span>
                <button
                  onClick={() => { setAchieveFile(null); if (achieveFileRef.current) achieveFileRef.current.value = ''; }}
                  className="text-red-500 hover:text-red-700"
                >
                  <HiOutlineX className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-primary-600 hover:text-primary-800 font-medium whitespace-nowrap">
                <HiOutlinePaperClip className="w-4 h-4" /> Attach file
                <input ref={achieveFileRef} type="file" className="hidden"
                  onChange={(e) => setAchieveFile(e.target.files[0] || null)} />
              </label>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleSaveDraft} disabled={submitting} className="btn-secondary flex items-center gap-1.5">
              <HiOutlineSave className="w-4 h-4" /> Save Draft
            </button>
            <button
              onClick={handleAchieveSubmit}
              disabled={submitting || !allFilled}
              className="btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500"
            >
              {submitting ? 'Submitting…' : 'Submit Achievement'}
            </button>
            <button onClick={() => navigate('/employee/kpis')} className="btn-secondary">Cancel</button>
            {!allFilled && (
              <span className="text-xs text-amber-600">
                {currentItems.length - filledCount} item{currentItems.length - filledCount !== 1 ? 's' : ''} not rated yet.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
